import {
  calcActualPercent,
  calcAreaWithWidth,
  calcImageOverlayFrame,
} from "../core/geometry";
import { getCopy } from "../core/copy";
import { pickBestAssetVariant } from "../core/presets";
import type { ResizeOutcome } from "../core/types";
import { findBodyContainer, findMainImageNode } from "../figma/bannerDetection";
import {
  createDisclaimerNode,
  markDisclaimerNode,
  resizeSvgNodeToFrame,
} from "../figma/disclaimerNodes";
import {
  getAutoLayoutPadding,
  setAbsolutePositioningIfParentHasAutoLayout,
  setLayoutPositioning,
  setLayoutSizingFixed,
} from "../figma/layout";
import { isInsideInstance } from "../figma/nodeGuards";
import type { BannerFrame, ResizableNode } from "../figma/nodeGuards";
import { getRelativeBoundsFromAbsolute } from "../figma/traversal";
import type { Bounds } from "../core/types";

export function addDisclaimerToBody(params: {
  bannerFrame: BannerFrame;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, assetGroupKey, presetKey, targetPercent } = params;
  const bodyContainer = findBodyContainer(bannerFrame);

  if (!bodyContainer) {
    return addDisclaimerToBannerBottom({
      bannerFrame,
      assetGroupKey,
      presetKey,
      targetPercent,
    });
  }

  const padding = getAutoLayoutPadding(bodyContainer);
  const contentWidth = bodyContainer.width - padding.left - padding.right;

  if (contentWidth <= 0) {
    throw new Error(getCopy("plugin.errors.noBodySpace"));
  }

  const { newWidth, newHeight } = calcAreaWithWidth(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    contentWidth
  );
  const variant = pickBestAssetVariant(assetGroupKey, newWidth, newHeight);
  const node = createDisclaimerNode(assetGroupKey, variant, presetKey);

  try {
    resizeSvgNodeToFrame(node, newWidth, newHeight);
    setLayoutPositioning(node, "AUTO");
    bodyContainer.appendChild(node);
  } catch (err) {
    node.remove();
    throw err;
  }

  return {
    node,
    actualPercent: calcActualPercent(
      node.width * node.height,
      bannerFrame.width,
      bannerFrame.height
    ),
  };
}

function computeImageOverlayFrame(
  bannerFrame: BannerFrame,
  targetPercent: number
): Bounds {
  const mainImage = findMainImageNode(bannerFrame);

  if (!mainImage) {
    throw new Error(getCopy("plugin.errors.noImageOrVideo"));
  }

  const mediaBounds = getRelativeBoundsFromAbsolute(
    mainImage.bounds,
    bannerFrame
  );

  return calcImageOverlayFrame(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    mediaBounds
  );
}

function placeDisclaimerAtOverlayFrame(params: {
  bannerFrame: BannerFrame;
  node: ResizableNode;
  assetGroupKey: string;
  presetKey: string;
  overlayFrame: Bounds;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, node, assetGroupKey, presetKey, overlayFrame } = params;

  setLayoutSizingFixed(node, "proportional");
  bannerFrame.appendChild(node);
  setAbsolutePositioningIfParentHasAutoLayout(node, bannerFrame);
  resizeSvgNodeToFrame(node, overlayFrame.width, overlayFrame.height);
  node.x = overlayFrame.x;
  node.y = overlayFrame.y;

  if ("constraints" in node) {
    (node as SceneNode & { constraints: Constraints }).constraints = {
      horizontal: "STRETCH",
      vertical: "MAX",
    };
  }

  markDisclaimerNode(node, assetGroupKey, presetKey);

  return {
    node,
    actualPercent: calcActualPercent(
      node.width * node.height,
      bannerFrame.width,
      bannerFrame.height
    ),
  };
}

export function placeDisclaimerOverImage(params: {
  bannerFrame: BannerFrame;
  node: ResizableNode;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, node, assetGroupKey, presetKey, targetPercent } = params;

  if (node.locked) {
    throw new Error(getCopy("plugin.errors.layerLocked"));
  }

  if (isInsideInstance(node)) {
    throw new Error(getCopy("plugin.errors.instanceOverride"));
  }

  const overlayFrame = computeImageOverlayFrame(bannerFrame, targetPercent);

  return placeDisclaimerAtOverlayFrame({
    bannerFrame,
    node,
    assetGroupKey,
    presetKey,
    overlayFrame,
  });
}

function addDisclaimerToBannerBottom(params: {
  bannerFrame: BannerFrame;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, assetGroupKey, presetKey, targetPercent } = params;
  const overlayFrame = calcImageOverlayFrame(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    { x: 0, y: 0, width: bannerFrame.width, height: bannerFrame.height }
  );
  const variant = pickBestAssetVariant(
    assetGroupKey,
    overlayFrame.width,
    overlayFrame.height
  );
  const node = createDisclaimerNode(assetGroupKey, variant, presetKey);

  try {
    return placeDisclaimerAtOverlayFrame({
      bannerFrame,
      node,
      assetGroupKey,
      presetKey,
      overlayFrame,
    });
  } catch (err) {
    node.remove();
    throw err;
  }
}

export function addDisclaimerToImage(params: {
  bannerFrame: BannerFrame;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, assetGroupKey, presetKey, targetPercent } = params;
  const overlayFrame = computeImageOverlayFrame(bannerFrame, targetPercent);
  const variant = pickBestAssetVariant(
    assetGroupKey,
    overlayFrame.width,
    overlayFrame.height
  );
  const node = createDisclaimerNode(assetGroupKey, variant, presetKey);

  try {
    // The overlay frame is already computed above (also validating that the
    // banner has an image), so place directly instead of recomputing it.
    return placeDisclaimerAtOverlayFrame({
      bannerFrame,
      node,
      assetGroupKey,
      presetKey,
      overlayFrame,
    });
  } catch (err) {
    node.remove();
    throw err;
  }
}
