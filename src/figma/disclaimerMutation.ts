import type { DisclaimerAsset } from "../generatedDisclaimerAssets";
import { getCopy } from "../core/copy";
import {
  isKnownDisclaimerNode,
  PLUGIN_DATA_ASSET_KEY,
  PLUGIN_DATA_NAMESPACE,
  PLUGIN_DATA_PRESET_KEY,
} from "./disclaimerDetection";
import { prepareSvgNodeForDeformation, resizeSvgNodeToFrame } from "./disclaimerSvg";
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
import { visitDescendants } from "./traversal";

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

export function removeKnownDisclaimers(bannerFrame: BannerFrame): void {
  const nodesToRemove: SceneNode[] = [];

  visitDescendants(bannerFrame, (node) => {
    if (isKnownDisclaimerNode(node)) {
      nodesToRemove.push(node);
    }
  });

  // The list is collected in pre-order (parents before children). Remove in
  // reverse so nested matches go first: removing a parent also removes its
  // descendants, and calling `.remove()` on an already-removed child throws.
  for (let i = nodesToRemove.length - 1; i >= 0; i -= 1) {
    const node = nodesToRemove[i];
    if (!node.removed) {
      node.remove();
    }
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

  if (!canInsertChildren(parent)) {
    // A silent fallback here would look like a successful resize while the
    // stretched old SVG variant stays in place. Fail loudly instead.
    throw new Error(getCopy("plugin.errors.disclaimerChangeFailed"));
  }

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
