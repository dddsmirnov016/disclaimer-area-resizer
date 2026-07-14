/// <reference types="@figma/plugin-typings" />

import { formatCopy, getCopy, pluralizeVariantWord } from "./core/copy";
import { formatRuNumber, formatRuPercent } from "./core/format";
import { getPresetAndAssetGroup, getTargetPercent } from "./core/presets";
import { addDisclaimerToBody, addDisclaimerToImage, placeDisclaimerOverImage } from "./features/addMissing";
import { createAllDisclaimerVariants } from "./features/createAllVariants";
import { resizeExistingDisclaimer } from "./features/resizeExisting";
import { findBannerFrame } from "./figma/bannerDetection";
import {
  buildBannerDisclaimerIndex,
  findContainingDisclaimerForSelection,
  findDetectedDisclaimerForBannerSelection,
  findMatchingDisclaimer,
  isImageLedBannerFrame,
  isProbableBannerSelectionFrame,
  resolveDisclaimerAreaBannerFrame,
} from "./figma/disclaimerDetection";
import { isFrameLike, isResizable, hasNonZeroSize, isAttached, isLocked, type BannerFrame, type ResizableNode } from "./figma/nodeGuards";
import {
  BANNER_DISCLAIMER_DETECTION_ERROR,
  buildState,
} from "./state/selectionState";
import { parseUiMessage } from "./ui/messageValidation";
import type { UiMessage } from "./ui/messages";

declare const __html__: string;

function resolveAreaBannerFrame(hostFrame: BannerFrame): BannerFrame {
  const index = buildBannerDisclaimerIndex(hostFrame);
  if (isImageLedBannerFrame(hostFrame, index)) {
    return hostFrame;
  }
  return findBannerFrame(hostFrame) ?? hostFrame;
}

function sendState(): void {
  figma.ui.postMessage(buildState(figma.currentPage.selection));
}

function postError(message: string): void {
  figma.ui.postMessage({ type: "error", message });
}

function postSuccess(message: string): void {
  figma.ui.postMessage({ type: "success", message });
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

  if (!isAttached(selectedNode)) {
    postError(getCopy("plugin.errors.selectionChanged"));
    return;
  }

  if (isLocked(selectedNode)) {
    postError(getCopy("plugin.errors.layerLocked"));
    return;
  }

  if (!hasNonZeroSize(selectedNode)) {
    postError(
      isFrameLike(selectedNode)
        ? formatCopy("plugin.errors.bannerSizeZero", {
            width: selectedNode.width,
            height: selectedNode.height,
          })
        : formatCopy("plugin.errors.disclaimerSizeZero", {
            width: selectedNode.width,
            height: selectedNode.height,
          })
    );
    return;
  }

  // The UI echoes the node id its state was rendered for. If the user changed
  // the selection between rendering and clicking Apply, refuse instead of
  // silently operating on a different layer.
  if (msg.expectedNodeId !== null && selectedNode.id !== msg.expectedNodeId) {
    postError(getCopy("plugin.errors.selectionChanged"));
    return;
  }

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

  const targetPercent = getTargetPercent(msg.presetKey);
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

    const hostFrame = selectedNode;
    const areaBannerFrame = resolveAreaBannerFrame(hostFrame);
    const existingDisclaimer = findMatchingDisclaimer(hostFrame, assetGroupKey);

    if (existingDisclaimer) {
      if (msg.addTarget === "image") {
        result = placeDisclaimerOverImage({
          bannerFrame: areaBannerFrame,
          hostFrame,
          node: existingDisclaimer,
          assetGroupKey,
          presetKey: msg.presetKey,
          targetPercent,
        });
        actionLabel = getCopy("plugin.actions.moved");
      } else {
        result = resizeExistingDisclaimer({
          node: existingDisclaimer,
          bannerFrame: areaBannerFrame,
          targetPercent,
          assetGroupKey,
          presetKey: msg.presetKey,
        });
      }
    } else {
      result =
        msg.addTarget === "image"
          ? addDisclaimerToImage({
              bannerFrame: areaBannerFrame,
              hostFrame,
              assetGroupKey,
              presetKey: msg.presetKey,
              targetPercent,
            })
          : addDisclaimerToBody({
              bannerFrame: areaBannerFrame,
              hostFrame,
              assetGroupKey,
              presetKey: msg.presetKey,
              targetPercent,
            });
      actionLabel = getCopy("plugin.actions.added");
    }
  } else {
    let resizeNode: ResizableNode | null = null;
    let bannerFrame = findBannerFrame(selectedNode);
    let bannerIndex: ReturnType<typeof buildBannerDisclaimerIndex> | null = null;

    if (isFrameLike(selectedNode)) {
      const selectionIndex = buildBannerDisclaimerIndex(selectedNode);
      resizeNode = findDetectedDisclaimerForBannerSelection(
        selectedNode,
        bannerFrame,
        selectionIndex
      );

      if (resizeNode) {
        const fallbackBannerFrame = bannerFrame || selectedNode;
        bannerFrame = resolveDisclaimerAreaBannerFrame(
          resizeNode,
          fallbackBannerFrame,
          selectionIndex
        );
      } else if (
        isProbableBannerSelectionFrame(selectedNode, bannerFrame, selectionIndex)
      ) {
        postError(BANNER_DISCLAIMER_DETECTION_ERROR);
        return;
      }
    }

    if (!resizeNode && bannerFrame) {
      bannerIndex = buildBannerDisclaimerIndex(bannerFrame);
      resizeNode = findContainingDisclaimerForSelection(
        selectedNode,
        bannerFrame,
        bannerIndex
      );

      if (resizeNode) {
        bannerFrame = resolveDisclaimerAreaBannerFrame(
          resizeNode,
          bannerFrame,
          bannerIndex
        );
      }
    }

    if (!resizeNode && isResizable(selectedNode)) {
      resizeNode = selectedNode;
      if (bannerFrame) {
        bannerFrame = resolveDisclaimerAreaBannerFrame(
          resizeNode,
          bannerFrame,
          bannerIndex || buildBannerDisclaimerIndex(bannerFrame)
        );
      }
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

// Skip invisible instance internals during traversal: the plugin cannot edit
// them anyway, and skipping makes large-document walks significantly faster.
figma.skipInvisibleInstanceChildren = true;

figma.showUI(__html__, { width: 384, height: 776 });

sendState();

// Leading + trailing debounce: a single click updates the panel instantly,
// while rapid selection storms (drag-select, arrow-key walking) collapse into
// at most one extra refresh per window instead of a full recompute per event.
const SELECTION_REFRESH_DEBOUNCE_MS = 80;
let selectionRefreshTimer: number | null = null;
let selectionRefreshQueued = false;

figma.on("selectionchange", () => {
  if (selectionRefreshTimer !== null) {
    selectionRefreshQueued = true;
    return;
  }

  sendState();
  selectionRefreshTimer = setTimeout(() => {
    selectionRefreshTimer = null;
    if (selectionRefreshQueued) {
      selectionRefreshQueued = false;
      sendState();
    }
  }, SELECTION_REFRESH_DEBOUNCE_MS);
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
