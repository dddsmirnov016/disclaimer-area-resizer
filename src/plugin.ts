/// <reference types="@figma/plugin-typings" />

import { round2 } from "./core/geometry";
import { getPresetAndAsset, getTargetPercent } from "./core/presets";
import { addDisclaimerToBody, addDisclaimerToImage, placeDisclaimerOverImage } from "./features/addMissing";
import { createAllDisclaimerVariants } from "./features/createAllVariants";
import { resizeExistingDisclaimer } from "./features/resizeExisting";
import { findBannerFrame } from "./figma/bannerDetection";
import {
  findDetectedDisclaimerForBannerSelection,
  findMatchingDisclaimer,
  isProbableBannerSelectionFrame,
} from "./figma/disclaimerNodes";
import { isFrameLike, isResizable, type ResizableNode } from "./figma/nodeGuards";
import {
  BANNER_DISCLAIMER_DETECTION_ERROR,
  buildState,
} from "./state/selectionState";
import type { UiMessage } from "./ui/messages";

declare const __html__: string;

function sendState(): void {
  figma.ui.postMessage(buildState(figma.currentPage.selection));
}

function postError(message: string): void {
  figma.ui.postMessage({ type: "error", message });
}

function postSuccess(message: string): void {
  figma.ui.postMessage({ type: "success", message });
}

function selectAndReport(node: SceneNode, message: string): void {
  figma.currentPage.selection = [node];
  figma.notify(message, { timeout: 4000 });
  postSuccess(message);
  sendState();
}

function handleApplyResize(msg: Extract<UiMessage, { type: "apply-resize" }>): void {
  const state = buildState(figma.currentPage.selection);

  if (state.type !== "ready" || !state.info) {
    postError(state.error !== undefined ? state.error : "Нет выбранного слоя");
    return;
  }

  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    postError("Выбор изменился. Повторите.");
    return;
  }

  const selectedNode = selection[0];

  if (state.info.mode === "add-missing" && msg.createAll) {
    if (!isFrameLike(selectedNode)) {
      postError("Выберите баннерный фрейм");
      return;
    }

    const created = createAllDisclaimerVariants({
      bannerFrame: selectedNode,
      addTarget: msg.addTarget,
    });
    const resultMessage = `Создано: ${created.count} вариантов дисклеймеров`;

    figma.currentPage.selection = [selectedNode];
    figma.notify(resultMessage, { timeout: 4000 });
    postSuccess(resultMessage);
    sendState();
    return;
  }

  const presetAndAsset = getPresetAndAsset(msg.presetKey);
  if (!presetAndAsset) {
    postError("Не найден SVG-ассет для выбранного пресета");
    return;
  }

  const targetPercent = getTargetPercent(msg.presetKey, msg.customPercent);
  if (targetPercent === null) {
    postError("Укажите корректный процент (0–100)");
    return;
  }

  const { asset } = presetAndAsset;
  let result: { node: ResizableNode; actualPercent: number };
  let actionLabel = "Применено";

  if (state.info.mode === "add-missing") {
    if (!isFrameLike(selectedNode)) {
      postError("Выберите баннерный фрейм");
      return;
    }

    const existingDisclaimer = findMatchingDisclaimer(selectedNode, asset.key);

    if (existingDisclaimer) {
      if (msg.addTarget === "image") {
        result = placeDisclaimerOverImage({
          bannerFrame: selectedNode,
          node: existingDisclaimer,
          asset,
          presetKey: msg.presetKey,
          targetPercent,
        });
        actionLabel = "Перенесено";
      } else {
        result = resizeExistingDisclaimer({
          node: existingDisclaimer,
          bannerFrame: selectedNode,
          targetPercent,
          direction: msg.direction,
          onlyEnlarge: msg.onlyEnlarge,
          asset,
          presetKey: msg.presetKey,
        });
      }
    } else {
      result =
        msg.addTarget === "image"
          ? addDisclaimerToImage({
              bannerFrame: selectedNode,
              asset,
              presetKey: msg.presetKey,
              targetPercent,
            })
          : addDisclaimerToBody({
              bannerFrame: selectedNode,
              asset,
              presetKey: msg.presetKey,
              targetPercent,
            });
      actionLabel = "Добавлено";
    }
  } else {
    let resizeNode: ResizableNode | null = null;
    let bannerFrame = findBannerFrame(selectedNode);

    if (isFrameLike(selectedNode)) {
      resizeNode = findDetectedDisclaimerForBannerSelection(
        selectedNode,
        bannerFrame
      );

      if (resizeNode) {
        bannerFrame = bannerFrame || selectedNode;
      } else if (isProbableBannerSelectionFrame(selectedNode, bannerFrame)) {
        postError(BANNER_DISCLAIMER_DETECTION_ERROR);
        return;
      }
    }

    if (!resizeNode && isResizable(selectedNode)) {
      resizeNode = selectedNode;
    }

    if (!resizeNode) {
      postError(
        isFrameLike(selectedNode)
          ? BANNER_DISCLAIMER_DETECTION_ERROR
          : "Слой не поддерживает resize"
      );
      return;
    }

    if (!bannerFrame) {
      postError("Выделите disclaimer внутри баннерного фрейма");
      return;
    }

    result = resizeExistingDisclaimer({
      node: resizeNode,
      bannerFrame,
      targetPercent,
      direction: msg.direction,
      onlyEnlarge: msg.onlyEnlarge,
      asset,
      presetKey: msg.presetKey,
    });
  }

  const resultMessage =
    actionLabel +
    ": " +
    round2(result.node.width) +
    "×" +
    round2(result.node.height) +
    " px — " +
    result.actualPercent +
    "% площади баннера";

  selectAndReport(result.node, resultMessage);
}

figma.showUI(__html__, { width: 432, height: 704 });

sendState();

figma.on("selectionchange", () => {
  sendState();
});

figma.ui.on("message", (msg: UiMessage) => {
  try {
    if (msg.type === "request-state") {
      sendState();
      return;
    }

    if (msg.type === "resize") {
      figma.ui.resize(msg.width, msg.height);
      return;
    }

    if (msg.type === "apply-resize") {
      handleApplyResize(msg);
    }
  } catch (err) {
    postError("Ошибка: " + String(err instanceof Error ? err.message : err));
  }
});
