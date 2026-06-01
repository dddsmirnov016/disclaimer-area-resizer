import {
  calcActualPercent,
  calcAreaWithWidth,
  calcImageOverlayFrame,
} from "../core/geometry";
import type { DisclaimerAsset, ResizeOutcome } from "../core/types";
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
import type { BannerFrame, ResizableNode } from "../figma/nodeGuards";
import { getRelativeBoundsFromAbsolute } from "../figma/traversal";

export function addDisclaimerToBody(params: {
  bannerFrame: BannerFrame;
  asset: DisclaimerAsset;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, asset, presetKey, targetPercent } = params;
  const bodyContainer = findBodyContainer(bannerFrame);

  if (!bodyContainer) {
    throw new Error("Не удалось найти текстовый контейнер в баннере.");
  }

  const padding = getAutoLayoutPadding(bodyContainer);
  const contentWidth = bodyContainer.width - padding.left - padding.right;

  if (contentWidth <= 0) {
    throw new Error("В текстовом контейнере нет места для дисклеймера.");
  }

  const node = createDisclaimerNode(asset, presetKey);
  const { newWidth, newHeight } = calcAreaWithWidth(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    contentWidth
  );

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

export function placeDisclaimerOverImage(params: {
  bannerFrame: BannerFrame;
  node: ResizableNode;
  asset: DisclaimerAsset;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, node, asset, presetKey, targetPercent } = params;

  if (node.locked) {
    throw new Error("Слой заблокирован. Разблокируйте его и попробуйте ещё раз.");
  }

  const mainImage = findMainImageNode(bannerFrame);

  if (!mainImage) {
    throw new Error("Не удалось найти изображение или медиаобласть в баннере.");
  }

  const mediaBounds = getRelativeBoundsFromAbsolute(
    mainImage.bounds,
    bannerFrame
  );
  const overlayFrame = calcImageOverlayFrame(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    mediaBounds
  );

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

  markDisclaimerNode(node, asset, presetKey);

  return {
    node,
    actualPercent: calcActualPercent(
      node.width * node.height,
      bannerFrame.width,
      bannerFrame.height
    ),
  };
}

export function addDisclaimerToImage(params: {
  bannerFrame: BannerFrame;
  asset: DisclaimerAsset;
  presetKey: string;
  targetPercent: number;
}): ResizeOutcome<ResizableNode> {
  const { bannerFrame, asset, presetKey, targetPercent } = params;
  const node = createDisclaimerNode(asset, presetKey);

  try {
    return placeDisclaimerOverImage({
      bannerFrame,
      node,
      asset,
      presetKey,
      targetPercent,
    });
  } catch (err) {
    node.remove();
    throw err;
  }
}
