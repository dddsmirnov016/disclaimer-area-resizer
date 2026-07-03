/// <reference types="@figma/plugin-typings" />

import { round2 } from "./core/geometry";
import { formatCopy, getCopy, pluralizeVariantWord } from "./core/copy";
import { getPresetAndAssetGroup, getTargetPercent } from "./core/presets";
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
import { parseUiMessage } from "./ui/messageValidation";
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
    return getCopy("plugin.errors.instanceOverride");
  }

  if (!/[А-Яа-яЁё]/.test(rawMessage)) {
    return getCopy("plugin.errors.applyFailed");
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
    postError(state.error !== undefined ? state.error : getCopy("plugin.errors.selectLayer"));
    return;
  }

  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    postError(getCopy("plugin.errors.selectionChanged"));
    return;
  }

  const selectedNode = selection[0];

  if (state.info.mode === "add-missing" && msg.createAll) {
    if (!isFrameLike(selectedNode)) {
      postError(getCopy("plugin.errors.selectBannerFrame"));
      return;
    }

    const created = createAllDisclaimerVariants({
      bannerFrame: selectedNode,
      addTarget: msg.addTarget,
    });
    const resultMessage = formatCopy("plugin.messages.variantsCreated", {
      count: formatRuNumber(created.count),
      variantWord: pluralizeVariantWord(created.count),
    });

    figma.currentPage.selection = [selectedNode];
    figma.notify(resultMessage, { timeout: 4000 });
    postSuccess(resultMessage);
    sendState();
    return;
  }

  const presetAndAssetGroup = getPresetAndAssetGroup(msg.presetKey);
  if (!presetAndAssetGroup) {
    postError(getCopy("plugin.errors.noDisclaimerForPreset"));
    return;
  }

  const targetPercent = getTargetPercent(msg.presetKey, msg.customPercent);
  if (targetPercent === null) {
    postError(getCopy("plugin.errors.invalidPercent"));
    return;
  }

  const { assetGroupKey } = presetAndAssetGroup;
  let result: { node: ResizableNode; actualPercent: number };
  let actionLabel = getCopy("plugin.actions.applied");

  if (state.info.mode === "add-missing") {
    if (!isFrameLike(selectedNode)) {
      postError(getCopy("plugin.errors.selectBannerFrame"));
      return;
    }

    const existingDisclaimer = findMatchingDisclaimer(selectedNode, assetGroupKey);

    if (existingDisclaimer) {
      if (msg.addTarget === "image") {
        result = placeDisclaimerOverImage({
          bannerFrame: selectedNode,
          node: existingDisclaimer,
          assetGroupKey,
          presetKey: msg.presetKey,
          targetPercent,
        });
        actionLabel = getCopy("plugin.actions.moved");
      } else {
        result = resizeExistingDisclaimer({
          node: existingDisclaimer,
          bannerFrame: selectedNode,
          targetPercent,
          direction: msg.direction,
          onlyEnlarge: msg.onlyEnlarge,
          assetGroupKey,
          presetKey: msg.presetKey,
        });
      }
    } else {
      result =
        msg.addTarget === "image"
          ? addDisclaimerToImage({
              bannerFrame: selectedNode,
              assetGroupKey,
              presetKey: msg.presetKey,
              targetPercent,
            })
          : addDisclaimerToBody({
              bannerFrame: selectedNode,
              assetGroupKey,
              presetKey: msg.presetKey,
              targetPercent,
            });
      actionLabel = getCopy("plugin.actions.added");
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
          : getCopy("plugin.errors.layerNotResizableShort")
      );
      return;
    }

    if (!bannerFrame) {
      postError(getCopy("plugin.errors.selectDisclaimerInBanner"));
      return;
    }

    result = resizeExistingDisclaimer({
      node: resizeNode,
      bannerFrame,
      targetPercent,
      direction: msg.direction,
      onlyEnlarge: msg.onlyEnlarge,
      assetGroupKey,
      presetKey: msg.presetKey,
    });
  }

  const resultMessage = formatCopy("plugin.messages.resizeResult", {
    action: actionLabel,
    width: formatRuNumber(result.node.width),
    height: formatRuNumber(result.node.height),
    percent: formatRuPercent(result.actualPercent),
  });

  selectAndReport(result.node, resultMessage);
}

figma.showUI(__html__, { width: 384, height: 776 });

sendState();

figma.on("selectionchange", () => {
  sendState();
});

figma.ui.on("message", (rawMessage: unknown) => {
  const msg = parseUiMessage(rawMessage);

  if (!msg) {
    return;
  }

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
