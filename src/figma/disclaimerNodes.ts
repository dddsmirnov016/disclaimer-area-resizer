import type { DisclaimerAsset } from "../generatedDisclaimerAssets";
import { getCopy } from "../core/copy";
import { ASSET_GROUP_KEYS } from "../core/presets";
import {
  copyLayoutChildSettings,
  setLayoutSizingFixed,
  shouldPreserveManualPosition,
} from "./layout";
import {
  canInsertChildren,
  hasChildren,
  isFrameLike,
  isResizable,
  type BannerFrame,
  type ResizableNode,
} from "./nodeGuards";
import { isVisibleInHierarchy, visitDescendants } from "./traversal";

export const PLUGIN_DATA_NAMESPACE = "disclaimerAreaResizer";
export const PLUGIN_DATA_ASSET_KEY = "assetKey";
export const PLUGIN_DATA_PRESET_KEY = "presetKey";

const HEURISTIC_DISCLAIMER_NAME_RE =
  /disclaimer|дисклеймер|legal|warning|предупрежд|противопоказан|лекарств|условия кредита|займ|банкротств/i;
const MIN_BANNER_SELECTION_AREA_RATIO = 0.4;

export function hasHeuristicDisclaimerName(node: BaseNode): boolean {
  return HEURISTIC_DISCLAIMER_NAME_RE.test(node.name);
}

export function prepareSvgNodeForDeformation(node: SceneNode): void {
  if ("clipsContent" in node) {
    try {
      (node as SceneNode & { clipsContent: boolean }).clipsContent = true;
    } catch {
      // Existing SVGs can contain read-only descendants; root resize is still useful.
    }
  }

  visitDescendants(node, (child) => {
    if ("constraints" in child) {
      try {
        (child as SceneNode & { constraints: Constraints }).constraints = {
          horizontal: "SCALE",
          vertical: "SCALE",
        };
      } catch {
        // Keep best-effort preparation from blocking editable root layers.
      }
    }
  });
}

export function resizeSvgNodeToFrame(
  node: ResizableNode,
  width: number,
  height: number
): void {
  prepareSvgNodeForDeformation(node);

  if (!("resize" in node) || typeof node.resize !== "function") {
    throw new Error(getCopy("plugin.errors.disclaimerChangeFailed"));
  }

  (node as ResizableNode & { resize: (w: number, h: number) => void }).resize(
    width,
    height
  );
}

export function markDisclaimerNode(
  node: BaseNode,
  assetGroupKey: string,
  presetKey: string
): void {
  node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY, assetGroupKey);
  node.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    PLUGIN_DATA_PRESET_KEY,
    presetKey
  );
}

export function isMatchingDisclaimer(
  node: SceneNode,
  assetKey: string
): boolean {
  return (
    node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY) ===
      assetKey || node.name.includes(assetKey)
  );
}

export function isPluginGeneratedDisclaimer(
  node: SceneNode,
  assetKey: string
): boolean {
  return (
    node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY) ===
      assetKey || node.name.startsWith("Disclaimer — ")
  );
}

function isPluginCreatedDisclaimerCandidate(node: SceneNode): boolean {
  return (
    Boolean(
      node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY)
    ) || node.name.startsWith("Disclaimer — ")
  );
}

/**
 * Everything the selection flow needs to know about disclaimers inside one
 * banner, collected in a single subtree traversal. Building this index once
 * and passing it to the detection helpers below avoids re-walking the same
 * banner 4–6 times per selection change.
 */
export interface BannerDisclaimerIndex {
  readonly pluginDisclaimers: readonly ResizableNode[];
  readonly heuristicDisclaimers: readonly ResizableNode[];
}

export function buildBannerDisclaimerIndex(
  bannerFrame: BannerFrame
): BannerDisclaimerIndex {
  const pluginCandidates: ResizableNode[] = [];
  const heuristicCandidates: ResizableNode[] = [];
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const bannerVisible = bannerFrame.visible !== false;

  const matchesHeuristicLimits = (node: ResizableNode): boolean => {
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
  };

  // One depth-first pass; visibility is threaded down instead of re-walking
  // ancestors per node (what `isVisibleInHierarchy` would cost on each hit).
  const walk = (parent: BaseNode, parentVisible: boolean): void => {
    if (!hasChildren(parent)) return;

    for (const child of parent.children) {
      const childVisible = parentVisible && child.visible !== false;

      if (isResizable(child)) {
        if (isPluginCreatedDisclaimerCandidate(child)) {
          pluginCandidates.push(child);
        }
        if (
          childVisible &&
          hasHeuristicDisclaimerName(child) &&
          matchesHeuristicLimits(child)
        ) {
          heuristicCandidates.push(child);
        }
      }

      walk(child, childVisible);
    }
  };

  walk(bannerFrame, bannerVisible);

  return {
    pluginDisclaimers: resolveTopLevelCandidates(
      pluginCandidates.map(resolveMarkedWrapperCandidate),
      bannerFrame
    ),
    heuristicDisclaimers: resolveTopLevelCandidates(
      heuristicCandidates.map((candidate) =>
        resolveHeuristicWrapperCandidate(candidate, heuristicCandidates)
      ),
      bannerFrame
    ),
  };
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

function getIndex(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): BannerDisclaimerIndex {
  return index || buildBannerDisclaimerIndex(bannerFrame);
}

export function findPluginCreatedDisclaimer(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  return getSingleCandidate(getIndex(bannerFrame, index).pluginDisclaimers);
}

function getSingleCandidate(
  candidates: readonly ResizableNode[]
): ResizableNode | null {
  return candidates.length === 1 ? candidates[0] : null;
}

export function findHeuristicDisclaimer(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  return getSingleCandidate(getIndex(bannerFrame, index).heuristicDisclaimers);
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

function resolveMarkedWrapperCandidate(candidate: ResizableNode): ResizableNode {
  return findDirectDisclaimerChildForWrapper(candidate) || candidate;
}

function findDirectDisclaimerChildForWrapper(
  wrapper: ResizableNode
): ResizableNode | null {
  if (!isFrameLike(wrapper) || !hasChildren(wrapper)) return null;

  return getSingleCandidate(
    wrapper.children.filter(
      (child): child is ResizableNode =>
        isResizable(child) &&
        !isFrameLike(child) &&
        isVisibleInHierarchy(child, wrapper) &&
        isDirectVectorDisclaimerForWrapper(wrapper, child)
    )
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

function nodeContainsSelection(
  container: SceneNode,
  selectedNode: SceneNode
): boolean {
  let current: BaseNode | null = selectedNode;

  while (current) {
    if (current === container) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function findSingleCandidateContainingSelection(
  selectedNode: SceneNode,
  candidates: readonly ResizableNode[]
): ResizableNode | null {
  return getSingleCandidate(
    candidates.filter((candidate) =>
      nodeContainsSelection(candidate, selectedNode) ||
      nodeContainsSelection(selectedNode, candidate)
    )
  );
}

export function findContainingDisclaimerForSelection(
  selectedNode: SceneNode,
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  const bannerIndex = getIndex(bannerFrame, index);
  const pluginCandidate = findSingleCandidateContainingSelection(
    selectedNode,
    bannerIndex.pluginDisclaimers
  );

  if (pluginCandidate) {
    return pluginCandidate;
  }

  return findSingleCandidateContainingSelection(
    selectedNode,
    bannerIndex.heuristicDisclaimers
  );
}

export function findDetectedDisclaimer(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  const bannerIndex = getIndex(bannerFrame, index);

  if (bannerIndex.pluginDisclaimers.length > 0) {
    return getSingleCandidate(bannerIndex.pluginDisclaimers);
  }

  return getSingleCandidate(bannerIndex.heuristicDisclaimers);
}

/**
 * Whether the banner contains any disclaimer-like node at all (plugin-created
 * or matched by heuristic), regardless of whether a single one can be resolved.
 * Lets callers tell "no disclaimer → offer to add one" apart from "disclaimers
 * exist but are ambiguous → ask to pick manually".
 */
export function bannerHasDisclaimerCandidates(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): boolean {
  const bannerIndex = getIndex(bannerFrame, index);
  return (
    bannerIndex.pluginDisclaimers.length > 0 ||
    bannerIndex.heuristicDisclaimers.length > 0
  );
}

export function isProbableBannerSelectionFrame(
  selectedFrame: BannerFrame,
  containingBannerFrame: BannerFrame | null,
  index?: BannerDisclaimerIndex
): boolean {
  if (isPluginCreatedDisclaimerCandidate(selectedFrame)) {
    return false;
  }

  // A disclaimer-like NAME alone must not disqualify a frame from being a
  // banner. "Создать все варианты" names each duplicate after the asset label
  // (e.g. "Ad Container — Не является лекарством"), which matches the heuristic
  // keyword list. Treat the frame as the disclaimer itself only when it has
  // such a name AND holds no disclaimer inside it.
  if (
    hasHeuristicDisclaimerName(selectedFrame) &&
    !bannerHasDisclaimerCandidates(selectedFrame, index)
  ) {
    return false;
  }

  if (!containingBannerFrame) {
    return true;
  }

  const containingArea = containingBannerFrame.width * containingBannerFrame.height;
  if (containingArea <= 0) return false;

  const selectedArea = selectedFrame.width * selectedFrame.height;
  return selectedArea / containingArea >= MIN_BANNER_SELECTION_AREA_RATIO;
}

export function findDetectedDisclaimerForBannerSelection(
  selectedFrame: BannerFrame,
  containingBannerFrame: BannerFrame | null,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  const selectedFrameIndex = getIndex(selectedFrame, index);

  if (
    !isProbableBannerSelectionFrame(
      selectedFrame,
      containingBannerFrame,
      selectedFrameIndex
    )
  ) {
    return null;
  }

  return findDetectedDisclaimer(selectedFrame, selectedFrameIndex);
}

export function findMatchingDisclaimer(
  bannerFrame: BannerFrame,
  assetKey: string
): ResizableNode | null {
  let result: ResizableNode | null = null;

  visitDescendants(bannerFrame, (node) => {
    if (!result && isResizable(node) && isMatchingDisclaimer(node, assetKey)) {
      result = node;
    }
  });

  return result;
}

export function isKnownDisclaimerNode(node: SceneNode): boolean {
  if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY)) {
    return true;
  }

  if (node.name.startsWith("Disclaimer — ")) {
    return true;
  }

  return ASSET_GROUP_KEYS.some((assetGroupKey) => node.name.includes(assetGroupKey));
}

export function removeKnownDisclaimers(bannerFrame: BannerFrame): void {
  const nodesToRemove: SceneNode[] = [];

  visitDescendants(bannerFrame, (node) => {
    if (isKnownDisclaimerNode(node)) {
      nodesToRemove.push(node);
    }
  });

  for (const node of nodesToRemove) {
    node.remove();
  }
}

export function createDisclaimerNode(
  assetGroupKey: string,
  variant: DisclaimerAsset,
  presetKey: string
): ResizableNode {
  const node = figma.createNodeFromSvg(variant.svg);
  node.name = "Дисклеймер — " + assetGroupKey;

  if (!isResizable(node)) {
    node.remove();
    throw new Error(getCopy("plugin.errors.disclaimerNotResizable"));
  }

  markDisclaimerNode(node, assetGroupKey, presetKey);
  setLayoutSizingFixed(node, "proportional");
  prepareSvgNodeForDeformation(node);

  return node;
}

export function replaceGeneratedDisclaimerNode(params: {
  node: ResizableNode;
  assetGroupKey: string;
  variant: DisclaimerAsset;
  presetKey: string;
  newWidth: number;
  newHeight: number;
}): ResizableNode {
  const { node, assetGroupKey, variant, presetKey, newWidth, newHeight } = params;
  const parent = node.parent;

  if (!canInsertChildren(parent)) return node;

  const index = parent.children.indexOf(node);
  const replacement = createDisclaimerNode(assetGroupKey, variant, presetKey);

  try {
    copyLayoutChildSettings(node, replacement);
    resizeSvgNodeToFrame(replacement, newWidth, newHeight);
    parent.insertChild(index >= 0 ? index : parent.children.length, replacement);
    if (shouldPreserveManualPosition(parent, replacement)) {
      replacement.x = node.x;
      replacement.y = node.y;
    }
    node.remove();
  } catch (err) {
    replacement.remove();
    throw err;
  }

  return replacement;
}
