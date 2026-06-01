import { DISCLAIMER_ASSETS } from "../generatedDisclaimerAssets";
import type { DisclaimerAsset } from "../core/types";
import { setLayoutSizingFixed, copyLayoutChildSettings, shouldPreserveManualPosition } from "./layout";
import { canInsertChildren, isResizable, type BannerFrame, type ResizableNode } from "./nodeGuards";
import { visitDescendants } from "./traversal";

export const PLUGIN_DATA_NAMESPACE = "disclaimerAreaResizer";
export const PLUGIN_DATA_ASSET_KEY = "assetKey";
export const PLUGIN_DATA_PRESET_KEY = "presetKey";

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
