import { calcActualPercent, calcNewDimensions, round2 } from "../core/geometry";
import type { DisclaimerAsset, ResizeDirection, ResizeOutcome } from "../core/types";
import {
  isPluginGeneratedDisclaimer,
  markDisclaimerNode,
  replaceGeneratedDisclaimerNode,
  resizeSvgNodeToFrame,
} from "../figma/disclaimerNodes";
import { setLayoutSizingFixed } from "../figma/layout";
import type { BannerFrame, ResizableNode } from "../figma/nodeGuards";

export function resizeExistingDisclaimer(params: {
  node: ResizableNode;
  bannerFrame: BannerFrame;
  targetPercent: number;
  direction: ResizeDirection;
  onlyEnlarge: boolean;
  asset: DisclaimerAsset;
  presetKey: string;
}): ResizeOutcome<ResizableNode> {
  const {
    node,
    bannerFrame,
    targetPercent,
    direction,
    onlyEnlarge,
    asset,
    presetKey,
  } = params;

  if (node.locked) {
    throw new Error("Слой заблокирован (locked). Разблокируйте и попробуйте снова");
  }

  const currentPercent = calcActualPercent(
    node.width * node.height,
    bannerFrame.width,
    bannerFrame.height
  );
  const shouldRefreshGeneratedSvg =
    node.type !== "TEXT" && isPluginGeneratedDisclaimer(node, asset.key);

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
        asset,
        presetKey,
        newWidth,
        newHeight,
      })
    : node;

  if (!shouldRefreshGeneratedSvg) {
    if (node.type === "TEXT") {
      node.resizeWithoutConstraints(newWidth, newHeight);
    } else {
      resizeSvgNodeToFrame(node, newWidth, newHeight);
    }
    markDisclaimerNode(node, asset, presetKey);
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
