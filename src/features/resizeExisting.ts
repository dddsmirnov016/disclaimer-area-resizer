import { calcActualPercent, calcNewDimensions, round2 } from "../core/geometry";
import { getCopy } from "../core/copy";
import { pickBestAssetVariant } from "../core/presets";
import type { ResizeDirection, ResizeOutcome } from "../core/types";
import {
  isPluginGeneratedDisclaimer,
  markDisclaimerNode,
  replaceGeneratedDisclaimerNode,
  resizeSvgNodeToFrame,
} from "../figma/disclaimerNodes";
import { setLayoutSizingFixed } from "../figma/layout";
import { isInsideInstance } from "../figma/nodeGuards";
import type { BannerFrame, ResizableNode } from "../figma/nodeGuards";

export function resizeExistingDisclaimer(params: {
  node: ResizableNode;
  bannerFrame: BannerFrame;
  targetPercent: number;
  direction: ResizeDirection;
  onlyEnlarge: boolean;
  assetGroupKey: string;
  presetKey: string;
}): ResizeOutcome<ResizableNode> {
  const {
    node,
    bannerFrame,
    targetPercent,
    direction,
    onlyEnlarge,
    assetGroupKey,
    presetKey,
  } = params;

  if (node.locked) {
    throw new Error(getCopy("plugin.errors.layerLocked"));
  }

  if (isInsideInstance(node)) {
    throw new Error(getCopy("plugin.errors.instanceOverride"));
  }

  const currentPercent = calcActualPercent(
    node.width * node.height,
    bannerFrame.width,
    bannerFrame.height
  );
  const shouldRefreshGeneratedSvg =
    node.type !== "TEXT" && isPluginGeneratedDisclaimer(node, assetGroupKey);

  if (onlyEnlarge && currentPercent >= targetPercent && !shouldRefreshGeneratedSvg) {
    return { node, actualPercent: round2(currentPercent) };
  }

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    if (textNode.textAutoResize !== "NONE") {
      textNode.textAutoResize = "NONE";
    }
  }

  setLayoutSizingFixed(node, direction);

  const { newWidth, newHeight } = calcNewDimensions(
    node.width,
    node.height,
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    direction
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
