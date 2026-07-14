import assert from "node:assert/strict";
import test from "node:test";

import { bundleAndImport, modulePath } from "./helpers/bundle.mjs";
import { loadCopyModule } from "./helpers/copy.mjs";

const copyMod = await loadCopyModule();

function makeBannerTree() {
  return {
    id: "banner",
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    visible: true,
    layoutMode: "VERTICAL",
    fills: [{ type: "IMAGE" }],
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 82 },
    parent: null,
    children: [],
    getSharedPluginData() {
      return "";
    },
  };
}

test("buildBannerIndex resolves disclaimers, body container, and main image in one pass", async () => {
  const mod = await bundleAndImport(`
    import { buildBannerIndex } from ${modulePath("src/figma/bannerIndex.ts")};
    import { findDetectedDisclaimer } from ${modulePath("src/figma/disclaimerDetection.ts")};
    import { findBodyContainer, findMainImageNode } from ${modulePath("src/figma/bannerDetection.ts")};

    const body = {
      id: "body",
      name: "Body copy",
      type: "FRAME",
      width: 400,
      height: 60,
      visible: true,
      layoutMode: "VERTICAL",
      parent: null,
      children: [],
      getSharedPluginData() { return ""; },
    };
    const text = {
      id: "text",
      name: "Headline",
      type: "TEXT",
      width: 300,
      height: 20,
      visible: true,
      parent: body,
      children: [],
      getSharedPluginData() { return ""; },
    };
    const image = {
      id: "image",
      name: "Photo",
      type: "RECTANGLE",
      width: 220,
      height: 82,
      visible: true,
      fills: [{ type: "IMAGE" }],
      absoluteTransform: [[1, 0, 440], [0, 1, 0]],
      absoluteBoundingBox: { x: 440, y: 0, width: 220, height: 82 },
      parent: null,
      children: [],
      resize() {},
      getSharedPluginData() { return ""; },
    };
    const disclaimer = {
      id: "disc",
      name: "Disclaimer — Не является лекарством",
      type: "FRAME",
      width: 200,
      height: 18,
      visible: true,
      layoutMode: "NONE",
      parent: null,
      children: [],
      resizeWithoutConstraints() {},
      getSharedPluginData(namespace, key) {
        return namespace === "disclaimerAreaResizer" && key === "assetKey"
          ? "Не является лекарством"
          : "";
      },
    };
    const banner = {
      id: "banner",
      name: "Banner",
      type: "FRAME",
      width: 660,
      height: 82,
      visible: true,
      layoutMode: "VERTICAL",
      fills: [{ type: "IMAGE" }],
      absoluteTransform: [[1, 0, 0], [0, 1, 0]],
      absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 82 },
      parent: null,
      children: [body, image, disclaimer],
      getSharedPluginData() { return ""; },
    };
    body.parent = banner;
    body.children = [text];
    image.parent = banner;
    disclaimer.parent = banner;

    const index = buildBannerIndex(banner);
    export const detected = findDetectedDisclaimer(banner, index);
    export const bodyFromIndex = index.bodyContainer && index.bodyContainer.id;
    export const bodyDirect = findBodyContainer(banner, index) && findBodyContainer(banner, index).id;
    export const imageFromIndex = index.mainImage && index.mainImage.node.id;
    export const imageDirect = findMainImageNode(banner, index) && findMainImageNode(banner, index).node.id;
  `);

  assert.equal(mod.detected?.id, "disc");
  assert.equal(mod.bodyFromIndex, "body");
  assert.equal(mod.bodyDirect, "body");
  assert.equal(mod.imageFromIndex, "image");
  assert.equal(mod.imageDirect, "image");
});

test("removeKnownDisclaimers deletes nested matches before their ancestors", async () => {
  const mod = await bundleAndImport(`
    import { removeKnownDisclaimers } from ${modulePath("src/figma/disclaimerMutation.ts")};

    const removed = [];
    function track(node) {
      return {
        ...node,
        remove() {
          removed.push(this.id);
          this.removed = true;
        },
      };
    }

    const nested = track({
      id: "nested",
      name: "Disclaimer — nested",
      type: "FRAME",
      removed: false,
      getSharedPluginData(namespace, key) {
        return namespace === "disclaimerAreaResizer" && key === "assetKey" ? "x" : "";
      },
    });
    const wrapper = track({
      id: "wrapper",
      name: "Disclaimer — wrapper",
      type: "FRAME",
      removed: false,
      children: [nested],
      getSharedPluginData(namespace, key) {
        return namespace === "disclaimerAreaResizer" && key === "assetKey" ? "x" : "";
      },
    });
    nested.parent = wrapper;
    const banner = {
      id: "banner",
      name: "Banner",
      type: "FRAME",
      children: [wrapper],
      getSharedPluginData() { return ""; },
    };
    wrapper.parent = banner;

    removeKnownDisclaimers(banner);
    export const removedOrder = removed;
  `);

  assert.deepEqual(mod.removedOrder, ["nested", "wrapper"]);
});

test("replaceGeneratedDisclaimerNode throws when the parent cannot accept children", async () => {
  const mod = await bundleAndImport(`
    import { replaceGeneratedDisclaimerNode } from ${modulePath("src/figma/disclaimerMutation.ts")};
    import { getCopy } from ${modulePath("src/core/copy.ts")};

    globalThis.figma = {
      createNodeFromSvg() {
        throw new Error("should not create");
      },
    };

    const node = {
      id: "old",
      name: "Disclaimer — test",
      type: "FRAME",
      width: 100,
      height: 10,
      x: 0,
      y: 0,
      parent: { children: [] },
    };

    let thrown = null;
    try {
      replaceGeneratedDisclaimerNode({
        node,
        assetGroupKey: "Не является лекарством",
        variant: { key: "bad-193-47", width: 193, height: 47, svg: "<svg/>" },
        presetKey: "bad_static_10",
        newWidth: 100,
        newHeight: 10,
      });
    } catch (err) {
      thrown = err.message;
    }

    export const thrownMessage = thrown;
    export const expected = getCopy("plugin.errors.disclaimerChangeFailed");
  `);

  assert.equal(mod.thrownMessage, mod.expected);
});

test("apply resize refuses a deleted selection snapshot", async () => {
  const mod = await bundleAndImport(`
    const uiHandlers = {};
    const postedMessages = [];

    const banner = {
      id: "banner",
      name: "Banner",
      type: "FRAME",
      width: 300,
      height: 250,
      locked: false,
      removed: true,
      visible: true,
      layoutMode: "NONE",
      parent: { type: "PAGE" },
      children: [],
      getSharedPluginData() { return ""; },
    };

    globalThis.__html__ = "";
    globalThis.figma = {
      currentPage: { selection: [banner] },
      ui: {
        postMessage(message) { postedMessages.push(message); },
        resize() {},
        on(eventName, handler) { uiHandlers[eventName] = handler; },
      },
      showUI() {},
      notify() {},
      on() {},
      skipInvisibleInstanceChildren: false,
    };

    await import(${modulePath("src/plugin.ts")});

    uiHandlers.message({
      type: "apply-resize",
      presetKey: "medicine_video_7",
      addTarget: "body",
      createAll: false,
      expectedNodeId: "banner",
    });

    export const lastError = postedMessages.filter((m) => m.type === "error").at(-1)?.message;
    export const expected = ${JSON.stringify(copyMod.getCopy("plugin.errors.selectionChanged"))};
  `);

  assert.equal(mod.lastError, mod.expected);
});

test("ui.html contains the esbuild-injected UI bundle", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile("src/ui.html", "utf8");

  assert.match(html, /<!-- @generated-ui-script:start -->/);
  assert.match(html, /function showInfo/);
  assert.match(html, /formatRuNumberOrDash/);
  assert.doesNotMatch(html, /customPercent:/);
});
