import {
  calcActualPercent,
  calcAreaWithWidth,
  calcImageOverlayFrame,
} from "../core/geometry";
import { getCopy } from "../core/copy";
import { pickBestAssetVariant } from "../core/presets";
import type { ResizeOutcome } from "../core/types";
import { findBodyContainer, findMainImageNode } from "../figma/bannerDetection";
import { createDisclaimerNode, markDisclaimerNode } from "../figma/disclaimerMutation";
import { resizeSvgNodeToFrame } from "../figma/disclaimerSvg";
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
  /** Outermost banner frame used for target-percent area math. */
  bannerFrame: BannerFrame;
  /** Frame the user selected; the disclaimer is inserted here. Defaults to bannerFrame. */
  hostFrame?: BannerFrame;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, assetGroupKey, presetKey, targetPercent } = params;
  const hostFrame = params.hostFrame ?? bannerFrame;
  const bodyContainer = findBodyContainer(hostFrame);

  if (!bodyContainer) {
    return addDisclaimerToBannerBottom({
      bannerFrame,
      hostFrame,
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
    setLayoutPositioning(node, "AUTO");
    bodyContainer.appendChild(node);
    setLayoutSizingFixed(node, "proportional");
    resizeSvgNodeToFrame(node, newWidth, newHeight);
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
  hostFrame: BannerFrame,
  areaBannerFrame: BannerFrame,
  targetPercent: number
): Bounds {
  const mainImage = findMainImageNode(hostFrame);

  if (!mainImage) {
    throw new Error(getCopy("plugin.errors.noImageOrVideo"));
  }

  const mediaBounds = getRelativeBoundsFromAbsolute(
    mainImage.bounds,
    hostFrame
  );

  return calcImageOverlayFrame(
    areaBannerFrame.width,
    areaBannerFrame.height,
    targetPercent,
    mediaBounds
  );
}

function placeDisclaimerAtOverlayFrame(params: {
  bannerFrame: BannerFrame;
  hostFrame: BannerFrame;
  node: ResizableNode;
  assetGroupKey: string;
  presetKey: string;
  overlayFrame: Bounds;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, hostFrame, node, assetGroupKey, presetKey, overlayFrame } =
    params;

  setLayoutSizingFixed(node, "proportional");
  hostFrame.appendChild(node);
  setAbsolutePositioningIfParentHasAutoLayout(node, hostFrame);
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
  hostFrame?: BannerFrame;
  node: ResizableNode;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, node, assetGroupKey, presetKey, targetPercent } = params;
  const hostFrame = params.hostFrame ?? bannerFrame;

  if (node.locked) {
    throw new Error(getCopy("plugin.errors.layerLocked"));
  }

  if (isInsideInstance(node)) {
    throw new Error(getCopy("plugin.errors.instanceOverride"));
  }

  const overlayFrame = computeImageOverlayFrame(
    hostFrame,
    bannerFrame,
    targetPercent
  );

  return placeDisclaimerAtOverlayFrame({
    bannerFrame,
    hostFrame,
    node,
    assetGroupKey,
    presetKey,
    overlayFrame,
  });
}

function addDisclaimerToBannerBottom(params: {
  bannerFrame: BannerFrame;
  hostFrame?: BannerFrame;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, assetGroupKey, presetKey, targetPercent } = params;
  const hostFrame = params.hostFrame ?? bannerFrame;
  const overlayFrame = calcImageOverlayFrame(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    { x: 0, y: 0, width: hostFrame.width, height: hostFrame.height }
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
      hostFrame,
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
  hostFrame?: BannerFrame;
  assetGroupKey: string;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, assetGroupKey, presetKey, targetPercent } = params;
  const hostFrame = params.hostFrame ?? bannerFrame;
  const overlayFrame = computeImageOverlayFrame(
    hostFrame,
    bannerFrame,
    targetPercent
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
      hostFrame,
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
