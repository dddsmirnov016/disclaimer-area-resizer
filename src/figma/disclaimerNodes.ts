import { DISCLAIMER_ASSETS } from "../generatedDisclaimerAssets";
import type { DisclaimerAsset } from "../core/types";
import {
  copyLayoutChildSettings,
  setLayoutSizingFixed,
  shouldPreserveManualPosition,
} from "./layout";
import {
  canInsertChildren,
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
    (node as SceneNode & { clipsContent: boolean }).clipsContent = true;
  }

  visitDescendants(node, (child) => {
    if ("constraints" in child) {
      (child as SceneNode & { constraints: Constraints }).constraints = {
        horizontal: "SCALE",
        vertical: "SCALE",
      };
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
    throw new Error("SVG-дисклеймер не поддерживает деформацию содержимого");
  }

  (node as ResizableNode & { resize: (w: number, h: number) => void }).resize(
    width,
    height
  );
}

export function markDisclaimerNode(
  node: BaseNode,
  asset: DisclaimerAsset,
  presetKey: string
): void {
  node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY, asset.key);
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

export function findPluginCreatedDisclaimer(
  bannerFrame: BannerFrame
): ResizableNode | null {
  return getSingleCandidate(collectPluginCreatedDisclaimers(bannerFrame));
}

function getSingleCandidate(candidates: ResizableNode[]): ResizableNode | null {
  return candidates.length === 1 ? candidates[0] : null;
}

function collectPluginCreatedDisclaimers(
  bannerFrame: BannerFrame
): ResizableNode[] {
  const candidates: ResizableNode[] = [];

  visitDescendants(bannerFrame, (node) => {
    if (isResizable(node) && isPluginCreatedDisclaimerCandidate(node)) {
      candidates.push(node);
    }
  });

  return candidates;
}

function isLikelyDisclaimerByHeuristic(
  node: SceneNode,
  bannerFrame: BannerFrame
): node is ResizableNode {
  if (!isResizable(node)) return false;
  if (!isVisibleInHierarchy(node, bannerFrame)) return false;
  if (!hasHeuristicDisclaimerName(node)) return false;

  const bannerArea = bannerFrame.width * bannerFrame.height;
  if (bannerArea <= 0) return false;

  const areaPercent = (node.width * node.height / bannerArea) * 100;

  return (
    node.width >= 8 &&
    node.height >= 4 &&
    node.width <= bannerFrame.width * 1.05 &&
    node.height <= bannerFrame.height * 0.35 &&
    areaPercent >= 0.05 &&
    areaPercent <= 20
  );
}

export function findHeuristicDisclaimer(
  bannerFrame: BannerFrame
): ResizableNode | null {
  return getSingleCandidate(collectHeuristicDisclaimers(bannerFrame));
}

function collectHeuristicDisclaimers(
  bannerFrame: BannerFrame
): ResizableNode[] {
  const candidates: ResizableNode[] = [];

  visitDescendants(bannerFrame, (node) => {
    if (isLikelyDisclaimerByHeuristic(node, bannerFrame)) {
      candidates.push(node);
    }
  });

  return candidates.filter(
    (candidate) => !hasAncestorInSet(candidate, candidates, bannerFrame)
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

export function findDetectedDisclaimer(
  bannerFrame: BannerFrame
): ResizableNode | null {
  const pluginCandidates = collectPluginCreatedDisclaimers(bannerFrame);

  if (pluginCandidates.length > 0) {
    return getSingleCandidate(pluginCandidates);
  }

  return findHeuristicDisclaimer(bannerFrame);
}

export function isProbableBannerSelectionFrame(
  selectedFrame: BannerFrame,
  containingBannerFrame: BannerFrame | null
): boolean {
  if (
    isPluginCreatedDisclaimerCandidate(selectedFrame) ||
    hasHeuristicDisclaimerName(selectedFrame)
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
  containingBannerFrame: BannerFrame | null
): ResizableNode | null {
  if (!isProbableBannerSelectionFrame(selectedFrame, containingBannerFrame)) {
    return null;
  }

  return findDetectedDisclaimer(selectedFrame);
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

  return Object.keys(DISCLAIMER_ASSETS).some((assetKey) =>
    node.name.includes(assetKey)
  );
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
  asset: DisclaimerAsset,
  presetKey: string
): ResizableNode {
  const node = figma.createNodeFromSvg(asset.svg);
  node.name = "Disclaimer — " + asset.label;

  if (!isResizable(node)) {
    node.remove();
    throw new Error("SVG-дисклеймер не поддерживает изменение размера");
  }

  markDisclaimerNode(node, asset, presetKey);
  setLayoutSizingFixed(node, "proportional");
  prepareSvgNodeForDeformation(node);

  return node;
}

export function replaceGeneratedDisclaimerNode(params: {
  node: ResizableNode;
  asset: DisclaimerAsset;
  presetKey: string;
  newWidth: number;
  newHeight: number;
}): ResizableNode {
  const { node, asset, presetKey, newWidth, newHeight } = params;
  const parent = node.parent;

  if (!canInsertChildren(parent)) return node;

  const index = parent.children.indexOf(node);
  const replacement = createDisclaimerNode(asset, presetKey);

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
