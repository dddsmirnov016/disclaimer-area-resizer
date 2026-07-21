import type { Bounds } from "../core/types";
import {
  getAbsoluteBounds,
  getIntersectionBounds,
  intersectionArea,
} from "./traversal";
import {
  hasChildren,
  isFrameLike,
  isResizable,
  type AutoLayoutFrame,
  type BannerFrame,
  type ResizableNode,
} from "./nodeGuards";
import {
  PLUGIN_DATA_ASSET_KEY,
  PLUGIN_DATA_NAMESPACE,
  PLUGIN_DATA_PRESET_KEY,
} from "./pluginData";

const HEURISTIC_DISCLAIMER_NAME_RE =
  /disclaimer|дисклеймер|legal|warning|предупрежд|противопоказан|лекарств|условия кредита|займ|банкротств/i;

function hasHeuristicDisclaimerName(node: BaseNode): boolean {
  return HEURISTIC_DISCLAIMER_NAME_RE.test(node.name);
}

export interface BannerDisclaimerIndex {
  readonly pluginDisclaimers: readonly ResizableNode[];
  readonly heuristicDisclaimers: readonly ResizableNode[];
}

export interface BannerIndex extends BannerDisclaimerIndex {
  readonly bodyContainer: AutoLayoutFrame | null;
  readonly mainImage: { node: ResizableNode; bounds: Bounds } | null;
  readonly visibleImages: readonly {
    node: ResizableNode;
    bounds: Bounds;
  }[];
}

/**
 * Caches `getSharedPluginData` reads for the duration of one banner walk so
 * the same node is never queried twice when both asset and preset keys are
 * needed.
 */
export class PluginDataReader {
  private readonly cache = new Map<string, Record<string, string>>();

  get(node: BaseNode, namespace: string, key: string): string {
    const nodeKey =
      "id" in node && node.id ? String(node.id) : `${node.type}:${node.name}`;
    let values = this.cache.get(nodeKey);

    if (!values) {
      values = {};
      if ("getSharedPluginData" in node) {
        const sceneNode = node as SceneNode;
        values[PLUGIN_DATA_ASSET_KEY] = sceneNode.getSharedPluginData(
          PLUGIN_DATA_NAMESPACE,
          PLUGIN_DATA_ASSET_KEY
        );
        values[PLUGIN_DATA_PRESET_KEY] = sceneNode.getSharedPluginData(
          PLUGIN_DATA_NAMESPACE,
          PLUGIN_DATA_PRESET_KEY
        );
      }
      this.cache.set(nodeKey, values);
    }

    if (key in values) {
      return values[key];
    }

    if ("getSharedPluginData" in node) {
      const value = (node as SceneNode).getSharedPluginData(namespace, key);
      values[key] = value;
      return value;
    }

    return "";
  }

  hasAssetKey(node: SceneNode): boolean {
    return Boolean(this.get(node, PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY));
  }

  getAssetKey(node: SceneNode): string {
    return this.get(node, PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY);
  }
}

function normalizedName(node: BaseNode): string {
  return node.name.toLowerCase();
}

function isLikelyBodyName(node: BaseNode): boolean {
  return /body|copy|text|content|текст|контент|описание|оффер/.test(
    normalizedName(node)
  );
}

function hasImageOrVideoFill(node: SceneNode): boolean {
  if (!("fills" in node)) return false;
  const fills = (node as { fills: readonly Paint[] | PluginAPI["mixed"] })
    .fills;
  return (
    Array.isArray(fills) &&
    fills.some((paint) => paint.type === "IMAGE" || paint.type === "VIDEO")
  );
}

function isPluginCreatedDisclaimerCandidate(
  node: SceneNode,
  reader: PluginDataReader
): boolean {
  return (
    reader.hasAssetKey(node) || node.name.startsWith("Disclaimer — ")
  );
}

function uniqueCandidates(candidates: readonly ResizableNode[]): ResizableNode[] {
  const unique: ResizableNode[] = [];

  for (const candidate of candidates) {
    if (!unique.includes(candidate)) {
      unique.push(candidate);
    }
  }

  return unique;
}

function getSingleCandidate(
  candidates: readonly ResizableNode[]
): ResizableNode | null {
  return candidates.length === 1 ? candidates[0] : null;
}

function hasHugSizing(node: SceneNode): boolean {
  return (
    ("layoutSizingHorizontal" in node &&
      (node as SceneNode & { layoutSizingHorizontal: string })
        .layoutSizingHorizontal === "HUG") ||
    ("layoutSizingVertical" in node &&
      (node as SceneNode & { layoutSizingVertical: string })
        .layoutSizingVertical === "HUG")
  );
}

function isDirectVectorDisclaimerForWrapper(
  wrapper: ResizableNode,
  nested: ResizableNode
): boolean {
  if (wrapper === nested) return false;
  if (!isFrameLike(wrapper)) return false;
  if (isFrameLike(nested)) return false;
  if (!hasChildren(wrapper) || nested.parent !== wrapper) return false;

  const wrapperName = wrapper.name.trim().toLowerCase();
  const nestedName = nested.name.trim().toLowerCase();

  return (
    Boolean(wrapperName && nestedName.startsWith(wrapperName + "-")) ||
    hasHugSizing(wrapper)
  );
}

function findDirectDisclaimerChildForWrapper(
  wrapper: ResizableNode,
  parentVisible: boolean
): ResizableNode | null {
  if (!isFrameLike(wrapper) || !hasChildren(wrapper)) return null;

  return getSingleCandidate(
    wrapper.children.filter(
      (child): child is ResizableNode =>
        isResizable(child) &&
        !isFrameLike(child) &&
        parentVisible &&
        child.visible !== false &&
        isDirectVectorDisclaimerForWrapper(wrapper, child)
    )
  );
}

function resolveHeuristicWrapperCandidate(
  candidate: ResizableNode,
  candidates: readonly ResizableNode[]
): ResizableNode {
  const nestedCandidate = getSingleCandidate(
    candidates.filter((nested) =>
      isDirectVectorDisclaimerForWrapper(candidate, nested)
    )
  );

  return nestedCandidate || candidate;
}

function resolveMarkedWrapperCandidate(
  candidate: ResizableNode,
  parentVisible: boolean
): ResizableNode {
  return findDirectDisclaimerChildForWrapper(candidate, parentVisible) || candidate;
}

function hasAncestorInSet(
  node: SceneNode,
  candidates: readonly SceneNode[],
  root: BaseNode
): boolean {
  let current = node.parent;

  while (current && current !== root) {
    if (candidates.includes(current as SceneNode)) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function resolveTopLevelCandidates(
  candidates: readonly ResizableNode[],
  bannerFrame: BannerFrame
): ResizableNode[] {
  const resolvedCandidates = uniqueCandidates(candidates);

  return resolvedCandidates.filter(
    (candidate) => !hasAncestorInSet(candidate, resolvedCandidates, bannerFrame)
  );
}

function matchesHeuristicLimits(
  node: ResizableNode,
  bannerFrame: BannerFrame
): boolean {
  const bannerArea = bannerFrame.width * bannerFrame.height;
  if (bannerArea <= 0) return false;
  const areaPercent = ((node.width * node.height) / bannerArea) * 100;
  return (
    node.width >= 8 &&
    node.height >= 4 &&
    node.width <= bannerFrame.width * 1.05 &&
    node.height <= bannerFrame.height * 0.35 &&
    areaPercent >= 0.05 &&
    areaPercent <= 20
  );
}

/**
 * One post-order walk over the banner subtree collects disclaimer candidates,
 * the best body auto-layout container, and all visible image areas (including
 * the largest one used as the main image).
 */
export function buildBannerIndex(bannerFrame: BannerFrame): BannerIndex {
  const reader = new PluginDataReader();
  const pluginCandidates: ResizableNode[] = [];
  const heuristicCandidates: ResizableNode[] = [];
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const bannerBounds = getAbsoluteBounds(bannerFrame);
  const bannerVisible = bannerFrame.visible !== false;

  let bestBody: AutoLayoutFrame | null = null;
  let bestBodyScore = Number.NEGATIVE_INFINITY;
  let bestImage: { node: ResizableNode; bounds: Bounds } | null = null;
  let bestImageArea = 0;
  const visibleImages: Array<{ node: ResizableNode; bounds: Bounds }> = [];
  const indexedImageNodes = new Set<SceneNode>();

  const considerBody = (node: SceneNode, textCount: number): void => {
    if (!isFrameLike(node) || node.layoutMode !== "VERTICAL") return;
    if (textCount === 0) return;

    const areaRatio =
      bannerArea > 0 ? (node.width * node.height) / bannerArea : 1;
    const score =
      textCount * 20 +
      (isLikelyBodyName(node) ? 100 : 0) -
      areaRatio * 10 -
      (node === bannerFrame ? 50 : 0);

    if (score > bestBodyScore) {
      bestBody = node;
      bestBodyScore = score;
    }
  };

  const considerImage = (node: SceneNode, parentVisible: boolean): void => {
    if (!parentVisible || !isResizable(node) || !hasImageOrVideoFill(node)) {
      return;
    }
    if (indexedImageNodes.has(node)) return;

    const visibleBounds = getIntersectionBounds(
      getAbsoluteBounds(node),
      bannerBounds
    );
    const area = intersectionArea(visibleBounds);

    if (!visibleBounds || area <= 0) return;

    indexedImageNodes.add(node);
    const image = { node, bounds: visibleBounds };
    visibleImages.push(image);

    if (area > bestImageArea) {
      bestImage = image;
      bestImageArea = area;
    }
  };

  const walk = (node: SceneNode, parentVisible: boolean): number => {
    let textCount = 0;

    if (hasChildren(node)) {
      for (const child of node.children) {
        const childVisible = parentVisible && child.visible !== false;
        if (child.type === "TEXT") textCount += 1;
        textCount += walk(child, childVisible);
      }
    }

    if (isResizable(node)) {
      if (isPluginCreatedDisclaimerCandidate(node, reader)) {
        pluginCandidates.push(node);
      }
      if (
        parentVisible &&
        hasHeuristicDisclaimerName(node) &&
        matchesHeuristicLimits(node, bannerFrame)
      ) {
        heuristicCandidates.push(node);
      }
    }

    considerBody(node, textCount);
    considerImage(node, parentVisible);

    return textCount;
  };

  if (bannerVisible) {
    considerImage(bannerFrame, bannerVisible);
    walk(bannerFrame, bannerVisible);
  }

  return {
    pluginDisclaimers: resolveTopLevelCandidates(
      pluginCandidates.map((candidate) =>
        resolveMarkedWrapperCandidate(candidate, bannerVisible)
      ),
      bannerFrame
    ),
    heuristicDisclaimers: resolveTopLevelCandidates(
      heuristicCandidates.map((candidate) =>
        resolveHeuristicWrapperCandidate(candidate, heuristicCandidates)
      ),
      bannerFrame
    ),
    bodyContainer: bestBody,
    mainImage: bestImage,
    visibleImages,
  };
}

export function buildBannerDisclaimerIndex(
  bannerFrame: BannerFrame
): BannerIndex {
  return buildBannerIndex(bannerFrame);
}
