/// <reference types="@figma/plugin-typings" />

import { round2 } from "./core/geometry";
import { getPresetAndAsset, getTargetPercent } from "./core/presets";
import { addDisclaimerToBody, addDisclaimerToImage, placeDisclaimerOverImage } from "./features/addMissing";
import { createAllDisclaimerVariants } from "./features/createAllVariants";
import { resizeExistingDisclaimer } from "./features/resizeExisting";
import { findBannerFrame } from "./figma/bannerDetection";
import {
  findContainingDisclaimerForSelection,
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

function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function formatRuNumber(n: number): string {
  const rounded = round2(n);
  const sign = rounded < 0 ? "−" : "";
  const abs = Math.abs(rounded);
  const [intPart, decimalPart = ""] = String(abs).split(".");
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const trimmedDecimal = decimalPart.replace(/0+$/, "");

  return sign + groupedInt + (trimmedDecimal ? "," + trimmedDecimal : "");
}

function formatRuPercent(n: number): string {
  return formatRuNumber(n) + " %";
}

function toUserErrorMessage(err: unknown): string {
  const rawMessage = String(err instanceof Error ? err.message : err);
  const instanceOverridePattern = new RegExp(
    ["set", "constraints"].join("_") +
      "|" +
      ["cannot", "be", "overridden", "in", "an", "instance"].join(" "),
    "i"
  );

  if (instanceOverridePattern.test(rawMessage)) {
    return "Нельзя изменить слой внутри инстанса. Отсоедините инстанс или выберите главный компонент.";
  }

  if (!/[А-Яа-яЁё]/.test(rawMessage)) {
    return "Не удалось применить изменения. Выберите редактируемый слой и попробуйте ещё раз.";
  }

  return rawMessage;
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
    postError(state.error !== undefined ? state.error : "Выделите слой.");
    return;
  }

  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    postError("Выделение изменилось. Попробуйте ещё раз.");
    return;
  }

  const selectedNode = selection[0];

  if (state.info.mode === "add-missing" && msg.createAll) {
    if (!isFrameLike(selectedNode)) {
      postError("Выделите баннерный фрейм.");
      return;
    }

    const created = createAllDisclaimerVariants({
      bannerFrame: selectedNode,
      addTarget: msg.addTarget,
    });
    const resultMessage =
      `Создали ${formatRuNumber(created.count)} ` +
      pluralizeRu(created.count, "вариант", "варианта", "вариантов") +
      ".";

    figma.currentPage.selection = [selectedNode];
    figma.notify(resultMessage, { timeout: 4000 });
    postSuccess(resultMessage);
    sendState();
    return;
  }

  const presetAndAsset = getPresetAndAsset(msg.presetKey);
  if (!presetAndAsset) {
    postError("Для выбранного типа нет дисклеймера.");
    return;
  }

  const targetPercent = getTargetPercent(msg.presetKey, msg.customPercent);
  if (targetPercent === null) {
    postError("Укажите процент больше 0 и не больше 100.");
    return;
  }

  const { asset } = presetAndAsset;
  let result: { node: ResizableNode; actualPercent: number };
  let actionLabel = "Применено";

  if (state.info.mode === "add-missing") {
    if (!isFrameLike(selectedNode)) {
      postError("Выделите баннерный фрейм.");
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

    if (!resizeNode && bannerFrame) {
      resizeNode = findContainingDisclaimerForSelection(
        selectedNode,
        bannerFrame
      );
    }

    if (!resizeNode && isResizable(selectedNode)) {
      resizeNode = selectedNode;
    }

    if (!resizeNode) {
      postError(
        isFrameLike(selectedNode)
          ? BANNER_DISCLAIMER_DETECTION_ERROR
          : "Этот слой нельзя изменить в размере."
      );
      return;
    }

    if (!bannerFrame) {
      postError("Выделите слой с дисклеймером внутри баннера.");
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
    formatRuNumber(result.node.width) +
    "×" +
    formatRuNumber(result.node.height) +
    " px — " +
    formatRuPercent(result.actualPercent) +
    " площади баннера";

  selectAndReport(result.node, resultMessage);
}

figma.showUI(__html__, { width: 432, height: 776 });

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
    postError(toUserErrorMessage(err));
  }
});
