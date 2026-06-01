import { round2 } from "../core/geometry";
import { DISCLAIMER_PRESETS } from "../core/presets";
import {
  findBannerFrame,
  isTopLevelFrame,
  nodeHasAutoLayout,
} from "../figma/bannerDetection";
import {
  findContainingDisclaimerForSelection,
  findDetectedDisclaimerForBannerSelection,
  isProbableBannerSelectionFrame,
} from "../figma/disclaimerNodes";
import { isFrameLike, isResizable } from "../figma/nodeGuards";
import type { BannerFrame, ResizableNode } from "../figma/nodeGuards";
import type { PluginState } from "../ui/messages";

export const BANNER_DISCLAIMER_DETECTION_ERROR =
  "Дисклеймер не найден. Выделите слой с дисклеймером вручную.";

function buildDetectionInfoState(): PluginState {
  return {
    type: "invalid",
    error: BANNER_DISCLAIMER_DETECTION_ERROR,
    feedbackTone: "info",
    presets: DISCLAIMER_PRESETS,
  };
}

function buildResizeState(
  disclaimerNode: ResizableNode,
  bannerFrame: BannerFrame
): PluginState {
  const disclaimerArea = disclaimerNode.width * disclaimerNode.height;
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const currentPercent = (disclaimerArea / bannerArea) * 100;

  return {
    type: "ready",
    info: {
      mode: "resize-existing",
      disclaimerName: disclaimerNode.name,
      disclaimerWidth: round2(disclaimerNode.width),
      disclaimerHeight: round2(disclaimerNode.height),
      bannerName: bannerFrame.name,
      bannerWidth: round2(bannerFrame.width),
      bannerHeight: round2(bannerFrame.height),
      currentPercent: round2(currentPercent),
      isText: disclaimerNode.type === "TEXT",
      hasAutoLayout: nodeHasAutoLayout(disclaimerNode),
    },
    presets: DISCLAIMER_PRESETS,
  };
}

export function buildState(selection: readonly SceneNode[]): PluginState {
  if (selection.length !== 1) {
    return {
      type: selection.length === 0 ? "no-selection" : "invalid",
      error:
        selection.length === 0
          ? "Выделите один слой с дисклеймером или баннерный фрейм."
          : "Выделите только один слой.",
      presets: DISCLAIMER_PRESETS,
    };
  }

  const sceneNode = selection[0];

  if (isTopLevelFrame(sceneNode)) {
    if (sceneNode.locked) {
      return {
        type: "invalid",
        error: "Баннер заблокирован. Разблокируйте его и попробуйте ещё раз.",
        presets: DISCLAIMER_PRESETS,
      };
    }

    if (sceneNode.width <= 0 || sceneNode.height <= 0) {
      return {
        type: "invalid",
        error: `Размер баннера должен быть больше нуля: ${sceneNode.width}×${sceneNode.height}`,
        presets: DISCLAIMER_PRESETS,
      };
    }

    const detectedDisclaimer = findDetectedDisclaimerForBannerSelection(
      sceneNode,
      null
    );

    if (!detectedDisclaimer) {
      return buildDetectionInfoState();
    }

    return buildResizeState(detectedDisclaimer, sceneNode);
  }

  if (!isResizable(sceneNode)) {
    return {
      type: "invalid",
      error: "Этот слой нельзя изменить в размере. Выделите слой с дисклеймером или баннер.",
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.locked) {
    return {
      type: "invalid",
      error: "Слой заблокирован. Разблокируйте его и попробуйте ещё раз.",
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.width <= 0 || sceneNode.height <= 0) {
    return {
      type: "invalid",
      error: `Размер дисклеймера должен быть больше нуля: ${sceneNode.width}×${sceneNode.height}`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  const containingBannerFrame = isFrameLike(sceneNode)
    ? findBannerFrame(sceneNode)
    : null;

  if (isFrameLike(sceneNode)) {
    const detectedDisclaimer = findDetectedDisclaimerForBannerSelection(
      sceneNode,
      containingBannerFrame
    );

    if (detectedDisclaimer) {
      const bannerFrame = containingBannerFrame || sceneNode;
      if (bannerFrame.width <= 0 || bannerFrame.height <= 0) {
        return {
          type: "invalid",
          error: `Размер баннера должен быть больше нуля: ${bannerFrame.width}×${bannerFrame.height}`,
          presets: DISCLAIMER_PRESETS,
        };
      }
      return buildResizeState(detectedDisclaimer, bannerFrame);
    }

    if (isProbableBannerSelectionFrame(sceneNode, containingBannerFrame)) {
      return buildDetectionInfoState();
    }
  }

  const bannerFrame = containingBannerFrame || findBannerFrame(sceneNode);

  if (bannerFrame) {
    const containingDisclaimer = findContainingDisclaimerForSelection(
      sceneNode,
      bannerFrame
    );

    if (containingDisclaimer) {
      return buildResizeState(containingDisclaimer, bannerFrame);
    }
  }

  if (!bannerFrame) {
    return {
      type: "invalid",
      error: "Выделите слой с дисклеймером внутри баннера или сам баннер.",
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (bannerFrame.width <= 0 || bannerFrame.height <= 0) {
    return {
      type: "invalid",
      error: `Размер баннера должен быть больше нуля: ${bannerFrame.width}×${bannerFrame.height}`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  return buildResizeState(sceneNode, bannerFrame);
}
