import { calcActualPercent, calcHeightForTargetArea } from "../core/geometry";
import { getCopy } from "../core/copy";
import { pickBestAssetVariant } from "../core/presets";
import type { ResizeOutcome } from "../core/types";
import { isPluginGeneratedDisclaimer } from "../figma/disclaimerDetection";
import {
  markDisclaimerNode,
  replaceGeneratedDisclaimerNode,
} from "../figma/disclaimerMutation";
import { resizeSvgNodeToFrame } from "../figma/disclaimerSvg";
import { setLayoutSizingFixed } from "../figma/layout";
import { isInsideInstance } from "../figma/nodeGuards";
import type { BannerFrame, ResizableNode } from "../figma/nodeGuards";

export function resizeExistingDisclaimer(params: {
  node: ResizableNode;
  bannerFrame: BannerFrame;
  targetPercent: number;
  assetGroupKey: string;
  presetKey: string;
}): ResizeOutcome<ResizableNode> {
  const { node, bannerFrame, targetPercent, assetGroupKey, presetKey } = params;

  if (node.locked) {
    throw new Error(getCopy("plugin.errors.layerLocked"));
  }

  if (isInsideInstance(node)) {
    throw new Error(getCopy("plugin.errors.instanceOverride"));
  }

  const shouldRefreshGeneratedSvg =
    node.type !== "TEXT" && isPluginGeneratedDisclaimer(node, assetGroupKey);

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    if (textNode.textAutoResize !== "NONE") {
      textNode.textAutoResize = "NONE";
    }
  }

  setLayoutSizingFixed(node, "height");

  const { newWidth, newHeight } = calcHeightForTargetArea(
    node.width,
    bannerFrame.width,
    bannerFrame.height,
    targetPercent
  );

  const resizedNode = shouldRefreshGeneratedSvg
    ? replaceGeneratedDisclaimerNode({
        node,
        assetGroupKey,
        variant: pickBestAssetVariant(assetGroupKey, newWidth, newHeight),
        presetKey,
        newWidth,
        newHeight,
      })
    : node;

  if (!shouldRefreshGeneratedSvg) {
    if (node.type === "TEXT") {
      if (typeof node.resizeWithoutConstraints !== "function") {
        throw new Error(getCopy("plugin.errors.textDisclaimerChangeFailed"));
      }
      node.resizeWithoutConstraints(newWidth, newHeight);
    } else {
      resizeSvgNodeToFrame(node, newWidth, newHeight);
    }
    markDisclaimerNode(node, assetGroupKey, presetKey);
  }

  return {
    node: resizedNode,
    actualPercent: calcActualPercent(
      resizedNode.width * resizedNode.height,
      bannerFrame.width,
      bannerFrame.height
    ),
  };
}
