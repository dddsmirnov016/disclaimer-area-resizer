import { readFile } from "node:fs/promises";
import path from "node:path";

// Loads the real src/ui.html into jsdom and runs its inline script exactly as
// Figma would, except `parent.postMessage` is stubbed so we can observe the
// messages the UI emits and inject the messages the plugin sandbox would send
// back. This exercises actual user-visible behavior, not internal variables.

const UI_PATH = path.join(process.cwd(), "src/ui.html");

export async function mountUi() {
  const { JSDOM } = await import("jsdom");
  const html = await readFile(UI_PATH, "utf8");

  const outgoing = [];

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      Object.defineProperty(window, "parent", {
        configurable: true,
        value: {
          postMessage(payload) {
            outgoing.push(payload && payload.pluginMessage);
          },
        },
      });
    },
  });

  const { window } = dom;
  const { document } = window;

  /** Simulate a message posted from the plugin sandbox to the UI iframe. */
  function send(pluginMessage) {
    const event = new window.MessageEvent("message", {
      data: { pluginMessage },
    });
    window.dispatchEvent(event);
  }

  function $(id) {
    return document.getElementById(id);
  }

  /** The most recent message the UI emitted to the sandbox. */
  function lastOutgoing() {
    return outgoing[outgoing.length - 1];
  }

  function outgoingOfType(type) {
    return outgoing.filter((m) => m && m.type === type);
  }

  return {
    window,
    document,
    outgoing,
    send,
    $,
    lastOutgoing,
    outgoingOfType,
    elements: {
      get applyBtn() {
        return $("applyBtn");
      },
      get presetSelect() {
        return $("presetSelect");
      },
      get customBlock() {
        return $("customBlock");
      },
      get customInput() {
        return $("customInput");
      },
      get addToImageInput() {
        return $("addToImageInput");
      },
      get createAllInput() {
        return $("createAllInput");
      },
      get errorBox() {
        return $("errorBox");
      },
      get successMsg() {
        return $("successMsg");
      },
      get infoMsg() {
        return $("infoMsg");
      },
      get bannerVal() {
        return $("bannerVal");
      },
      get disclaimerVal() {
        return $("disclaimerVal");
      },
      get percentVal() {
        return $("percentVal");
      },
    },
    close() {
      window.close();
    },
  };
}

/** A representative `ready` (add-missing) state for a 660×82 banner. */
export function readyAddMissingState(presets) {
  return {
    type: "ready",
    presets,
    info: {
      mode: "add-missing",
      disclaimerName: null,
      disclaimerWidth: null,
      disclaimerHeight: null,
      bannerName: "Banner",
      bannerWidth: 660,
      bannerHeight: 82,
      currentPercent: null,
      isText: false,
      hasAutoLayout: true,
    },
  };
}

/** A representative `ready` (resize-existing) state. */
export function readyResizeState(presets) {
  return {
    type: "ready",
    presets,
    info: {
      mode: "resize-existing",
      disclaimerName: "Дисклеймер",
      disclaimerWidth: 200,
      disclaimerHeight: 18.94,
      bannerName: "Banner",
      bannerWidth: 660,
      bannerHeight: 82,
      currentPercent: 7,
      isText: false,
      hasAutoLayout: true,
    },
  };
}

export const SAMPLE_PRESETS = {
  medicine_video_7: {
    label: "Медицина — 7 %: ТВ, видео или по ТЗ",
    percent: 7,
    assetKey: "medicine",
  },
  custom: { label: "Свой процент", percent: null, assetKey: "medicine" },
};
