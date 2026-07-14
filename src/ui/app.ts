declare const parent: {
  postMessage(message: unknown, targetOrigin: string): void;
};

import {
  formatRuNumberOrDash,
  formatRuPercentOrDash,
} from "../core/format";
import type {
  ApplyResizeMessage,
  DisclaimerPreset,
  PluginMessage,
  PluginState,
  SelectionInfo,
} from "./messages";

declare global {
  interface Window {
    UI_COPY: {
      ui: {
        title: string;
        labels: {
          presetAria: string;
        };
        buttons: {
          apply: string;
          add: string;
          create: string;
          applying: string;
        };
        fallbacks: {
          disclaimerNotFound: string;
          selectLayer: string;
        };
      };
    };
  }
}

const WINDOW_W = 384;
const WINDOW_H = 776;
const UI = window.UI_COPY.ui;

let state: PluginState | null = null;
let presets: Record<string, DisclaimerPreset> = {};
let keepFeedbackOnNextReady = false;
let lastDetectionIdentity: string | null = null;

const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement;
const presetTrigger = document.getElementById("presetTrigger") as HTMLButtonElement;
const presetTriggerText = document.getElementById(
  "presetTriggerText"
) as HTMLSpanElement;
const presetMenu = document.getElementById("presetMenu") as HTMLDivElement;
const addToImageInput = document.getElementById(
  "addToImageInput"
) as HTMLInputElement;
const createAllInput = document.getElementById("createAllInput") as HTMLInputElement;
const applyBtn = document.getElementById("applyBtn") as HTMLButtonElement;
const errorBox = document.getElementById("errorBox") as HTMLDivElement;
const successMsg = document.getElementById("successMsg") as HTMLDivElement;
const infoMsg = document.getElementById("infoMsg") as HTMLDivElement;
const disclaimerVal = document.getElementById("disclaimerVal") as HTMLDivElement;
const percentVal = document.getElementById("percentVal") as HTMLDivElement;
const metricsBlock = document.getElementById("metricsBlock") as HTMLDivElement;

function getUiCopy(path: string): string {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, UI) as string;
}

function applyStaticCopy(): void {
  document.title = UI.title;
  presetSelect.setAttribute("aria-label", UI.labels.presetAria);
  document.querySelectorAll<HTMLElement>("[data-copy]").forEach((el) => {
    const path = el.getAttribute("data-copy");
    if (path) {
      el.textContent = getUiCopy(path);
    }
  });
}

applyStaticCopy();

function setSizeMetric(
  el: HTMLElement,
  w: number | null,
  h: number | null,
  empty: boolean
): void {
  const wEl = el.querySelector('[data-part="w"]');
  const hEl = el.querySelector('[data-part="h"]');
  if (!wEl || !hEl) return;

  if (empty) {
    wEl.textContent = "—";
    hEl.textContent = "—";
    el.classList.add("muted");
  } else {
    wEl.textContent = formatRuNumberOrDash(w);
    hEl.textContent = formatRuNumberOrDash(h);
    el.classList.remove("muted");
  }
}

function buildMenu(data: Record<string, DisclaimerPreset>): void {
  presets = data;
  presetSelect.innerHTML = "";
  presetMenu.innerHTML = "";

  Object.keys(data).forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = data[key].label;
    presetSelect.appendChild(opt);

    const item = document.createElement("div");
    item.className = "select-menu-item";
    item.setAttribute("role", "option");
    item.setAttribute("data-value", key);

    const text = document.createElement("span");
    text.className = "select-menu-item-text";
    text.textContent = data[key].label;

    const check = document.createElement("span");
    check.className = "select-menu-item-check";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none">' +
      '<path d="M5 10.5L8.5 14L15 7" stroke="#7F56D9" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';

    item.appendChild(text);
    item.appendChild(check);

    item.addEventListener("click", () => {
      selectValue(key);
      closeMenu();
    });

    presetMenu.appendChild(item);
  });

  syncMenuSelection();
  syncTriggerText();
}

function syncMenuSelection(): void {
  const current = presetSelect.value;
  presetMenu.querySelectorAll<HTMLElement>(".select-menu-item").forEach((item) => {
    if (item.getAttribute("data-value") === current) {
      item.classList.add("selected");
      item.setAttribute("aria-selected", "true");
    } else {
      item.classList.remove("selected");
      item.setAttribute("aria-selected", "false");
    }
  });
}

function syncTriggerText(): void {
  const key = presetSelect.value;
  presetTriggerText.textContent = (presets[key] && presets[key].label) || "";
}

function selectValue(key: string): void {
  if (!presets[key]) return;
  presetSelect.value = key;
  syncMenuSelection();
  syncTriggerText();
  presetSelect.dispatchEvent(new Event("change"));
}

function openMenu(): void {
  presetMenu.classList.add("open");
  presetTrigger.classList.add("open");
  presetTrigger.setAttribute("aria-expanded", "true");
}

function closeMenu(): void {
  presetMenu.classList.remove("open");
  presetTrigger.classList.remove("open");
  presetTrigger.setAttribute("aria-expanded", "false");
}

function toggleMenu(): void {
  if (presetMenu.classList.contains("open")) {
    closeMenu();
  } else {
    openMenu();
  }
}

presetTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});

presetTrigger.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleMenu();
  } else if (e.key === "Escape") {
    closeMenu();
  }
});

document.addEventListener("click", () => {
  closeMenu();
});

function getTargetPercent(): number | null {
  const key = presetSelect.value;
  if (!key || !presets[key]) return null;
  return presets[key].percent;
}

function updatePercentColor(): void {
  percentVal.classList.remove("green", "red");
  if (!state || state.type !== "ready") return;
  if (state.info?.currentPercent === null || state.info?.currentPercent === undefined) {
    percentVal.classList.add("green");
    return;
  }
  const target = getTargetPercent();
  if (target === null) {
    percentVal.classList.add("green");
    return;
  }
  if (state.info.currentPercent < target) {
    percentVal.classList.add("red");
  } else {
    percentVal.classList.add("green");
  }
}

function getIdleButtonLabel(): string {
  if (state?.type === "ready" && state.info?.mode === "add-missing") {
    return createAllInput.checked ? UI.buttons.create : UI.buttons.add;
  }
  return UI.buttons.apply;
}

function detectionIdentity(i: SelectionInfo): string {
  return [
    i.mode,
    i.bannerName,
    i.disclaimerName,
    i.disclaimerWidth,
    i.disclaimerHeight,
  ].join("|");
}

function applyDetectedPreset(i: SelectionInfo): void {
  const identity = detectionIdentity(i);
  const isNewDetection = identity !== lastDetectionIdentity;
  lastDetectionIdentity = identity;
  if (!isNewDetection) return;
  if (!i.detectedPresetKey || !presets[i.detectedPresetKey]) return;
  if (presetSelect.value === i.detectedPresetKey) return;
  presetSelect.value = i.detectedPresetKey;
  syncMenuSelection();
  syncTriggerText();
}

function syncAddTargetAvailability(): void {
  const canAdd = state?.type === "ready" && state.info?.mode === "add-missing";
  addToImageInput.disabled = !canAdd;
  createAllInput.disabled = !canAdd;
  if (!canAdd) addToImageInput.checked = false;
  if (!canAdd) createAllInput.checked = false;
}

function setMetricsEmpty(empty: boolean): void {
  metricsBlock.querySelectorAll<HTMLElement>(".metric-card").forEach((card) => {
    card.style.display = empty ? "none" : "";
  });
}

function showError(text: string): void {
  errorBox.textContent = text;
  errorBox.classList.add("visible");
  successMsg.classList.remove("visible");
  infoMsg.classList.remove("visible");
}

function hideError(): void {
  errorBox.classList.remove("visible");
  errorBox.textContent = "";
}

function showSuccess(text: string): void {
  successMsg.textContent = text;
  successMsg.classList.add("visible");
  errorBox.classList.remove("visible");
  infoMsg.classList.remove("visible");
}

function hideSuccess(): void {
  successMsg.classList.remove("visible");
  successMsg.textContent = "";
}

function showInfo(text: string): void {
  infoMsg.textContent = text;
  infoMsg.classList.add("visible");
  errorBox.classList.remove("visible");
  successMsg.classList.remove("visible");
}

function hideInfo(): void {
  infoMsg.classList.remove("visible");
  infoMsg.textContent = "";
}

function hideFeedback(): void {
  hideError();
  hideSuccess();
  hideInfo();
}

function renderState(msg: PluginState): void {
  state = msg;

  if (msg.presets && Object.keys(presets).length === 0) {
    buildMenu(msg.presets);
  }

  if (msg.type === "no-selection") {
    setMetricsEmpty(true);
    setSizeMetric(disclaimerVal, null, null, true);
    percentVal.textContent = "—";
    percentVal.classList.add("muted");
    percentVal.classList.remove("green", "red");
    applyBtn.disabled = true;
    applyBtn.textContent = UI.buttons.apply;
    syncAddTargetAvailability();
    hideFeedback();
    return;
  }

  if (msg.type === "invalid") {
    setMetricsEmpty(true);
    setSizeMetric(disclaimerVal, null, null, true);
    percentVal.textContent = "—";
    percentVal.classList.add("muted");
    percentVal.classList.remove("green", "red");
    applyBtn.disabled = true;
    applyBtn.textContent = UI.buttons.apply;
    syncAddTargetAvailability();
    if (msg.feedbackTone === "info") {
      showInfo(msg.error || UI.fallbacks.disclaimerNotFound);
    } else {
      showError(msg.error || UI.fallbacks.selectLayer);
    }
    return;
  }

  const i = msg.info;
  if (!i) return;

  applyDetectedPreset(i);
  setMetricsEmpty(false);
  setSizeMetric(
    disclaimerVal,
    i.disclaimerWidth,
    i.disclaimerHeight,
    i.disclaimerWidth === null
  );
  percentVal.textContent =
    i.currentPercent === null ? "—" : formatRuPercentOrDash(i.currentPercent);
  if (i.currentPercent === null) {
    percentVal.classList.add("muted");
  } else {
    percentVal.classList.remove("muted");
  }
  updatePercentColor();
  applyBtn.disabled = false;
  applyBtn.textContent = getIdleButtonLabel();
  syncAddTargetAvailability();
  if (keepFeedbackOnNextReady) {
    keepFeedbackOnNextReady = false;
  } else {
    hideFeedback();
  }
}

presetSelect.addEventListener("change", () => {
  syncMenuSelection();
  syncTriggerText();
  updatePercentColor();
  hideFeedback();
});

createAllInput.addEventListener("change", () => {
  applyBtn.textContent = getIdleButtonLabel();
  hideFeedback();
});

applyBtn.addEventListener("click", () => {
  if (!state || state.type !== "ready") return;
  const key = presetSelect.value;

  applyBtn.disabled = true;
  applyBtn.textContent = UI.buttons.applying;
  hideFeedback();

  const message: ApplyResizeMessage = {
    type: "apply-resize",
    presetKey: key,
    addTarget: addToImageInput.checked ? "image" : "body",
    createAll: createAllInput.checked,
    expectedNodeId: state.selectionId ?? null,
  };

  parent.postMessage({ pluginMessage: message }, "*");
});

window.onmessage = (evt: MessageEvent<{ pluginMessage?: PluginMessage }>) => {
  const msg = evt.data?.pluginMessage;
  if (!msg) return;

  if (msg.type === "no-selection" || msg.type === "invalid" || msg.type === "ready") {
    if (msg.type === "ready") applyBtn.disabled = false;
    renderState(msg);
    return;
  }
  if (msg.type === "success") {
    applyBtn.textContent = getIdleButtonLabel();
    applyBtn.disabled = false;
    keepFeedbackOnNextReady = true;
    showSuccess(msg.message);
    return;
  }
  if (msg.type === "error") {
    applyBtn.textContent = getIdleButtonLabel();
    applyBtn.disabled = false;
    keepFeedbackOnNextReady = false;
    showError(msg.message);
  }
};

parent.postMessage({ pluginMessage: { type: "request-state" } }, "*");
parent.postMessage(
  { pluginMessage: { type: "resize", width: WINDOW_W, height: WINDOW_H } },
  "*"
);

export {};
