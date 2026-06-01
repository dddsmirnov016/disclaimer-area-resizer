import { round2 } from "../core/geometry";
import { DISCLAIMER_PRESETS } from "../core/presets";
import {
  findBannerFrame,
  isTopLevelFrame,
  nodeHasAutoLayout,
} from "../figma/bannerDetection";
import { isResizable } from "../figma/nodeGuards";
import type { PluginState } from "../ui/messages";

export function buildState(selection: readonly SceneNode[]): PluginState {
  if (selection.length !== 1) {
    return {
      type: selection.length === 0 ? "no-selection" : "invalid",
      error:
        selection.length === 0
          ? "Выберите один disclaimer-слой или баннерный фрейм"
          : "Выберите ровно один слой",
      presets: DISCLAIMER_PRESETS,
    };
  }

  const sceneNode = selection[0];

  if (isTopLevelFrame(sceneNode)) {
    if (sceneNode.locked) {
      return {
        type: "invalid",
        error: "Баннер заблокирован (locked). Разблокируйте и попробуйте снова",
        presets: DISCLAIMER_PRESETS,
      };
    }

    if (sceneNode.width <= 0 || sceneNode.height <= 0) {
      return {
        type: "invalid",
        error: `Некорректные размеры баннера: ${sceneNode.width}×${sceneNode.height}`,
        presets: DISCLAIMER_PRESETS,
      };
    }

    return {
      type: "ready",
      info: {
        mode: "add-missing",
        disclaimerName: null,
        disclaimerWidth: null,
        disclaimerHeight: null,
        bannerName: sceneNode.name,
        bannerWidth: round2(sceneNode.width),
        bannerHeight: round2(sceneNode.height),
        currentPercent: null,
        isText: false,
        hasAutoLayout: sceneNode.layoutMode !== "NONE",
      },
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (!isResizable(sceneNode)) {
    return {
      type: "invalid",
      error: `Тип слоя "${sceneNode.type}" не поддерживает изменение размера`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.locked) {
    return {
      type: "invalid",
      error: "Слой заблокирован (locked). Разблокируйте и попробуйте снова",
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.width <= 0 || sceneNode.height <= 0) {
    return {
      type: "invalid",
      error: `Некорректные размеры disclaimer: ${sceneNode.width}×${sceneNode.height}`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  const bannerFrame = findBannerFrame(sceneNode);

  if (!bannerFrame) {
    return {
      type: "invalid",
      error: "Выделите disclaimer внутри баннерного фрейма или сам баннер",
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (bannerFrame.width <= 0 || bannerFrame.height <= 0) {
    return {
      type: "invalid",
      error: `Некорректные размеры баннера: ${bannerFrame.width}×${bannerFrame.height}`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  const disclaimerArea = sceneNode.width * sceneNode.height;
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const currentPercent = (disclaimerArea / bannerArea) * 100;

  return {
    type: "ready",
    info: {
      mode: "resize-existing",
      disclaimerName: sceneNode.name,
      disclaimerWidth: round2(sceneNode.width),
      disclaimerHeight: round2(sceneNode.height),
      bannerName: bannerFrame.name,
      bannerWidth: round2(bannerFrame.width),
      bannerHeight: round2(bannerFrame.height),
      currentPercent: round2(currentPercent),
      isText: sceneNode.type === "TEXT",
      hasAutoLayout: nodeHasAutoLayout(sceneNode),
    },
    presets: DISCLAIMER_PRESETS,
  };
}
