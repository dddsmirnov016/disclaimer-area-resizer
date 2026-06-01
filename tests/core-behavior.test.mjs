import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

function modulePath(relativePath) {
  return JSON.stringify(path.join(process.cwd(), relativePath));
}

async function bundleAndImport(source) {
  const { build } = await import("esbuild");
  const tempRoot = await mkdtemp(path.join(tmpdir(), "disclaimer-core-"));
  const entryFile = path.join(tempRoot, "entry.ts");
  const outputFile = path.join(tempRoot, "entry.mjs");

  await writeFile(entryFile, source, "utf8");
  await build({
    entryPoints: [entryFile],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: outputFile,
    absWorkingDir: process.cwd(),
    logLevel: "silent",
  });

  return import(pathToFileURL(outputFile).href);
}

test("geometry helpers preserve target area for width-based disclaimer frames", async () => {
  const mod = await bundleAndImport(`
    import { calcAreaWithWidth } from ${modulePath("src/core/geometry.ts")};
    export const value = calcAreaWithWidth(660, 82, 7, 200);
  `);

  assert.equal(mod.value.newWidth, 200);
  assert.equal(Math.round(mod.value.newHeight * 1000) / 1000, 18.942);
});

test("image overlay geometry is centered on media bounds and pinned to the bottom", async () => {
  const mod = await bundleAndImport(`
    import { calcImageOverlayFrame } from ${modulePath("src/core/geometry.ts")};
    export const value = calcImageOverlayFrame(660, 82, 7, {
      x: 440,
      y: 0,
      width: 220,
      height: 82,
    });
  `);

  assert.equal(mod.value.width, 204);
  assert.equal(mod.value.x, 448);
  assert.equal(Math.round(mod.value.y * 1000) / 1000, 61.429);
});

test("preset helpers return one primary create-all entry per unique SVG asset", async () => {
  const mod = await bundleAndImport(`
    import { getPrimaryPresetEntriesByAsset } from ${modulePath("src/core/presets.ts")};
    export const entries = getPrimaryPresetEntriesByAsset().map((entry) => ({
      presetKey: entry.presetKey,
      assetKey: entry.asset.key,
      percent: entry.preset.percent,
    }));
  `);

  assert.deepEqual(
    mod.entries.map((entry) => entry.presetKey),
    [
      "medicine_video_7",
      "bad_static_10",
      "finance_credit_5",
      "finance_custom_10",
    ]
  );
  assert.equal(new Set(mod.entries.map((entry) => entry.assetKey)).size, 4);
});

test("bankruptcy preset keeps stable key and uses edited Russian label", async () => {
  const mod = await bundleAndImport(`
    import { DISCLAIMER_PRESETS } from ${modulePath("src/core/presets.ts")};
    export const label = DISCLAIMER_PRESETS.finance_custom_10.label;
    export const assetKey = DISCLAIMER_PRESETS.finance_custom_10.assetKey;
  `);

  assert.equal(mod.label, "Финансы: банкротство — 10 %");
  assert.match(mod.assetKey, /^Банкротство влечёт негативные последствия/);
});

test("preset percent labels use non-breaking spaces before percent signs", async () => {
  const mod = await bundleAndImport(`
    import { DISCLAIMER_PRESETS } from ${modulePath("src/core/presets.ts")};
    export const labels = Object.values(DISCLAIMER_PRESETS).map((preset) => preset.label);
  `);

  const percentLabels = mod.labels.filter((label) => /\d/.test(label));
  assert.ok(percentLabels.length > 0, "expected labels with percentages");

  for (const label of percentLabels) {
    assert.match(label, /\d %/, label);
    assert.doesNotMatch(label, /\d%/, label);
  }
});

test("figma disclaimer helpers resize generated SVGs with resize instead of resizeWithoutConstraints", async () => {
  const source = await readFile("src/figma/disclaimerNodes.ts", "utf8");
  const helper = source.match(/function resizeSvgNodeToFrame[\s\S]*?\n}\n/);

  assert.ok(helper, "expected resizeSvgNodeToFrame helper");
  assert.match(helper[0], /\.resize\(/);
  assert.doesNotMatch(helper[0], /resizeWithoutConstraints/);
});

test("create-all variants remove known disclaimers before inserting new ones", async () => {
  const source = await readFile("src/features/createAllVariants.ts", "utf8");

  assert.match(source, /removeKnownDisclaimers/);
  assert.match(source, /addTarget === "image"/);
  assert.match(source, /addDisclaimerToImage/);
  assert.match(source, /addDisclaimerToBody/);
});

test("banner selection prefers plugin-created disclaimer nodes for resize state", async () => {
  const mod = await bundleAndImport(`
    import { buildState } from ${modulePath("src/state/selectionState.ts")};
    import { PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY } from ${modulePath("src/figma/disclaimerNodes.ts")};

    function makeNode(overrides) {
      return {
        id: overrides.name,
        name: overrides.name,
        type: overrides.type || "FRAME",
        width: overrides.width,
        height: overrides.height,
        x: overrides.x || 0,
        y: overrides.y || 0,
        locked: false,
        visible: true,
        layoutMode: overrides.layoutMode || "NONE",
        parent: null,
        children: overrides.children || [],
        resizeWithoutConstraints() {},
        absoluteTransform: [[1, 0, overrides.x || 0], [0, 1, overrides.y || 0]],
        getSharedPluginData(namespace, key) {
          return overrides.pluginData && namespace === PLUGIN_DATA_NAMESPACE
            ? overrides.pluginData[key] || ""
            : "";
        },
      };
    }

    const manualCandidate = makeNode({
      name: "legal disclaimer text",
      type: "TEXT",
      width: 120,
      height: 12,
      x: 20,
      y: 60,
    });
    const pluginDisclaimer = makeNode({
      name: "Disclaimer — Не является лекарством",
      width: 180,
      height: 18,
      x: 20,
      y: 220,
      pluginData: {
        [PLUGIN_DATA_ASSET_KEY]: "Не является лекарством",
      },
    });
    const banner = makeNode({
      name: "Banner",
      width: 300,
      height: 250,
      children: [manualCandidate, pluginDisclaimer],
    });
    manualCandidate.parent = banner;
    pluginDisclaimer.parent = banner;

    export const state = buildState([banner]);
  `);

  assert.equal(mod.state.type, "ready");
  assert.equal(mod.state.info.mode, "resize-existing");
  assert.equal(mod.state.info.disclaimerName, "Disclaimer — Не является лекарством");
  assert.equal(mod.state.info.disclaimerWidth, 180);
  assert.equal(mod.state.info.disclaimerHeight, 18);
  assert.equal(mod.state.info.currentPercent, 4.32);
});

test("banner selection refuses ambiguous plugin-created disclaimer candidates", async () => {
  const mod = await bundleAndImport(`
    import { buildState, BANNER_DISCLAIMER_DETECTION_ERROR } from ${modulePath("src/state/selectionState.ts")};
    import { PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY } from ${modulePath("src/figma/disclaimerNodes.ts")};

    function makeNode(overrides) {
      return {
        id: overrides.name,
        name: overrides.name,
        type: overrides.type || "FRAME",
        width: overrides.width,
        height: overrides.height,
        x: overrides.x || 0,
        y: overrides.y || 0,
        locked: false,
        visible: true,
        layoutMode: overrides.layoutMode || "NONE",
        parent: null,
        children: overrides.children || [],
        resizeWithoutConstraints() {},
        absoluteTransform: [[1, 0, overrides.x || 0], [0, 1, overrides.y || 0]],
        getSharedPluginData(namespace, key) {
          return overrides.pluginData && namespace === PLUGIN_DATA_NAMESPACE
            ? overrides.pluginData[key] || ""
            : "";
        },
      };
    }

    const firstDisclaimer = makeNode({
      name: "Disclaimer — first",
      width: 180,
      height: 18,
      pluginData: {
        [PLUGIN_DATA_ASSET_KEY]: "first",
      },
    });
    const secondDisclaimer = makeNode({
      name: "Disclaimer — second",
      width: 160,
      height: 16,
      pluginData: {
        [PLUGIN_DATA_ASSET_KEY]: "second",
      },
    });
    const banner = makeNode({
      name: "Banner",
      width: 300,
      height: 250,
      children: [firstDisclaimer, secondDisclaimer],
    });
    firstDisclaimer.parent = banner;
    secondDisclaimer.parent = banner;

    export const expectedError = BANNER_DISCLAIMER_DETECTION_ERROR;
    export const state = buildState([banner]);
  `);

  assert.equal(mod.state.type, "invalid");
  assert.equal(mod.state.error, mod.expectedError);
});

test("banner selection reports missing or undetected disclaimer as info feedback", async () => {
  const mod = await bundleAndImport(`
    import { buildState, BANNER_DISCLAIMER_DETECTION_ERROR } from ${modulePath("src/state/selectionState.ts")};

    const banner = {
      id: "Banner",
      name: "Banner",
      type: "FRAME",
      width: 300,
      height: 250,
      x: 0,
      y: 0,
      locked: false,
      visible: true,
      layoutMode: "NONE",
      parent: { type: "PAGE" },
      children: [],
      resizeWithoutConstraints() {},
      absoluteTransform: [[1, 0, 0], [0, 1, 0]],
      getSharedPluginData() {
        return "";
      },
    };

    export const expectedError = BANNER_DISCLAIMER_DETECTION_ERROR;
    export const state = buildState([banner]);
  `);

  assert.equal(mod.state.type, "invalid");
  assert.equal(mod.state.error, mod.expectedError);
  assert.equal(mod.state.feedbackTone, "info");
  assert.match(mod.state.error, /Дисклеймер не найден/);
});

test("banner selection falls back to a single heuristic disclaimer candidate", async () => {
  const mod = await bundleAndImport(`
    import { buildState } from ${modulePath("src/state/selectionState.ts")};

    function makeNode(overrides) {
      return {
        id: overrides.name,
        name: overrides.name,
        type: overrides.type || "FRAME",
        width: overrides.width,
        height: overrides.height,
        x: overrides.x || 0,
        y: overrides.y || 0,
        locked: false,
        visible: true,
        layoutMode: overrides.layoutMode || "NONE",
        parent: null,
        children: overrides.children || [],
        resizeWithoutConstraints() {},
        absoluteTransform: [[1, 0, overrides.x || 0], [0, 1, overrides.y || 0]],
        getSharedPluginData() {
          return "";
        },
      };
    }

    const image = makeNode({
      name: "Image",
      width: 300,
      height: 180,
    });
    const heuristicDisclaimer = makeNode({
      name: "дисклеймер — legal copy",
      type: "TEXT",
      width: 220,
      height: 16,
      x: 40,
      y: 224,
    });
    const banner = makeNode({
      name: "Banner",
      width: 300,
      height: 250,
      children: [image, heuristicDisclaimer],
    });
    image.parent = banner;
    heuristicDisclaimer.parent = banner;

    export const state = buildState([banner]);
  `);

  assert.equal(mod.state.type, "ready");
  assert.equal(mod.state.info.mode, "resize-existing");
  assert.equal(mod.state.info.disclaimerName, "дисклеймер — legal copy");
  assert.equal(mod.state.info.disclaimerWidth, 220);
  assert.equal(mod.state.info.disclaimerHeight, 16);
  assert.equal(mod.state.info.currentPercent, 4.69);
});

test("banner selection treats nested heuristic matches as one disclaimer container", async () => {
  const mod = await bundleAndImport(`
    import { buildState } from ${modulePath("src/state/selectionState.ts")};

    function makeNode(overrides) {
      return {
        id: overrides.name,
        name: overrides.name,
        type: overrides.type || "FRAME",
        width: overrides.width,
        height: overrides.height,
        x: overrides.x || 0,
        y: overrides.y || 0,
        locked: false,
        visible: true,
        layoutMode: overrides.layoutMode || "NONE",
        parent: null,
        children: overrides.children || [],
        resizeWithoutConstraints() {},
        absoluteTransform: [[1, 0, overrides.x || 0], [0, 1, overrides.y || 0]],
        getSharedPluginData() {
          return "";
        },
      };
    }

    const disclaimerGlyphs = makeNode({
      name: "Не является лекарством",
      width: 425.2207336425781,
      height: 13,
      x: 22.389633178710938,
      y: 0,
    });
    const disclaimerContainer = makeNode({
      name: "Disclaimer",
      width: 450,
      height: 15,
      x: 0,
      y: 67,
      children: [disclaimerGlyphs],
    });
    const body = makeNode({
      name: "Container",
      width: 450,
      height: 82,
      children: [disclaimerContainer],
    });
    const image = makeNode({
      name: "Image",
      width: 198,
      height: 82,
      x: 462,
      y: 0,
    });
    const banner = makeNode({
      name: " ",
      width: 660,
      height: 82,
      children: [body, image],
    });
    body.parent = banner;
    disclaimerContainer.parent = body;
    disclaimerGlyphs.parent = disclaimerContainer;
    image.parent = banner;

    export const state = buildState([banner]);
  `);

  assert.equal(mod.state.type, "ready");
  assert.equal(mod.state.info.mode, "resize-existing");
  assert.equal(mod.state.info.disclaimerName, "Disclaimer");
  assert.equal(mod.state.info.disclaimerWidth, 450);
  assert.equal(mod.state.info.disclaimerHeight, 15);
  assert.equal(mod.state.info.currentPercent, 12.47);
});

test("nested banner frame selection uses its detected disclaimer, not the frame area", async () => {
  const mod = await bundleAndImport(`
    import { buildState } from ${modulePath("src/state/selectionState.ts")};

    function makeNode(overrides) {
      return {
        id: overrides.name,
        name: overrides.name,
        type: overrides.type || "FRAME",
        width: overrides.width,
        height: overrides.height,
        x: overrides.x || 0,
        y: overrides.y || 0,
        locked: false,
        visible: true,
        layoutMode: overrides.layoutMode || "NONE",
        parent: null,
        children: overrides.children || [],
        resizeWithoutConstraints() {},
        absoluteTransform: [[1, 0, overrides.x || 0], [0, 1, overrides.y || 0]],
        getSharedPluginData() {
          return "";
        },
      };
    }

    const disclaimerGlyphs = makeNode({
      name: "Не является лекарством",
      width: 528,
      height: 14,
      x: 19.99981689453125,
      y: 0,
    });
    const disclaimerContainer = makeNode({
      name: "Disclaimer",
      width: 548,
      height: 16,
      x: 0,
      y: 79,
      children: [disclaimerGlyphs],
    });
    const container = makeNode({
      name: "Container",
      width: 548,
      height: 95,
      children: [disclaimerContainer],
    });
    const image = makeNode({
      name: "Image",
      width: 240,
      height: 95,
      x: 560,
      y: 0,
    });
    const adFrame = makeNode({
      name: "Ad",
      width: 800,
      height: 95,
      children: [container, image],
    });
    const wrapper = makeNode({
      name: " ",
      width: 800,
      height: 95.0719985961914,
      children: [adFrame],
    });
    adFrame.parent = wrapper;
    container.parent = adFrame;
    disclaimerContainer.parent = container;
    disclaimerGlyphs.parent = disclaimerContainer;
    image.parent = adFrame;

    export const state = buildState([adFrame]);
  `);

  assert.equal(mod.state.type, "ready");
  assert.equal(mod.state.info.mode, "resize-existing");
  assert.equal(mod.state.info.disclaimerName, "Disclaimer");
  assert.equal(mod.state.info.disclaimerWidth, 548);
  assert.equal(mod.state.info.disclaimerHeight, 16);
  assert.equal(mod.state.info.bannerName, " ");
  assert.equal(mod.state.info.currentPercent, 11.53);
});

test("apply resize uses the detected disclaimer when the banner remains selected", async () => {
  const mod = await bundleAndImport(`
    const uiHandlers = {};
    const postedMessages = [];
    const notifications = [];

    function makeNode(overrides) {
      const pluginData = overrides.pluginData || {};
      return {
        id: overrides.name,
        name: overrides.name,
        type: overrides.type || "FRAME",
        width: overrides.width,
        height: overrides.height,
        x: overrides.x || 0,
        y: overrides.y || 0,
        locked: false,
        visible: true,
        layoutMode: overrides.layoutMode || "NONE",
        parent: null,
        children: overrides.children || [],
        textAutoResize: overrides.textAutoResize || "NONE",
        resizeWithoutConstraints(w, h) {
          this.width = w;
          this.height = h;
        },
        absoluteTransform: [[1, 0, overrides.x || 0], [0, 1, overrides.y || 0]],
        getSharedPluginData(namespace, key) {
          return pluginData[namespace + ":" + key] || "";
        },
        setSharedPluginData(namespace, key, value) {
          pluginData[namespace + ":" + key] = value;
        },
      };
    }

    const disclaimer = makeNode({
      name: "дисклеймер — legal copy",
      type: "TEXT",
      width: 220,
      height: 16,
      x: 40,
      y: 224,
      textAutoResize: "WIDTH_AND_HEIGHT",
    });
    const banner = makeNode({
      name: "Banner",
      width: 300,
      height: 250,
      children: [disclaimer],
    });
    disclaimer.parent = banner;

    globalThis.__html__ = "";
    globalThis.figma = {
      currentPage: {
        selection: [banner],
      },
      ui: {
        postMessage(message) {
          postedMessages.push(message);
        },
        resize() {},
        on(eventName, handler) {
          uiHandlers[eventName] = handler;
        },
      },
      showUI() {},
      notify(message) {
        notifications.push(message);
      },
      on() {},
      createNodeFromSvg() {
        throw new Error("not expected");
      },
    };

    await import(${modulePath("src/plugin.ts")});

    uiHandlers.message({
      type: "apply-resize",
      presetKey: "medicine_static_5",
      customPercent: null,
      direction: "height",
      onlyEnlarge: false,
      addTarget: "body",
      createAll: false,
    });

    export const selectedName = globalThis.figma.currentPage.selection[0].name;
    export const disclaimerHeight = Math.round(disclaimer.height * 1000) / 1000;
    export const textAutoResize = disclaimer.textAutoResize;
    export const lastError = postedMessages
      .filter((message) => message.type === "error")
      .at(-1)?.message || null;
    export const lastSuccess = postedMessages
      .filter((message) => message.type === "success")
      .at(-1)?.message || null;
  `);

  assert.equal(mod.lastError, null);
  assert.equal(mod.selectedName, "дисклеймер — legal copy");
  assert.equal(mod.disclaimerHeight, 17.045);
  assert.equal(mod.textAutoResize, "NONE");
  assert.match(mod.lastSuccess, /Применено: 220×17,05 px — 5 % площади баннера/);
});

test("apply resize uses the detected disclaimer when a nested banner frame remains selected", async () => {
  const mod = await bundleAndImport(`
    const uiHandlers = {};
    const postedMessages = [];

    function makeNode(overrides) {
      const pluginData = overrides.pluginData || {};
      return {
        id: overrides.name,
        name: overrides.name,
        type: overrides.type || "FRAME",
        width: overrides.width,
        height: overrides.height,
        x: overrides.x || 0,
        y: overrides.y || 0,
        locked: false,
        visible: true,
        layoutMode: overrides.layoutMode || "NONE",
        parent: null,
        children: overrides.children || [],
        resize(w, h) {
          this.width = w;
          this.height = h;
        },
        resizeWithoutConstraints(w, h) {
          this.width = w;
          this.height = h;
        },
        absoluteTransform: [[1, 0, overrides.x || 0], [0, 1, overrides.y || 0]],
        getSharedPluginData(namespace, key) {
          return pluginData[namespace + ":" + key] || "";
        },
        setSharedPluginData(namespace, key, value) {
          pluginData[namespace + ":" + key] = value;
        },
      };
    }

    const disclaimerGlyphs = makeNode({
      name: "Не является лекарством",
      width: 528,
      height: 14,
      x: 19.99981689453125,
      y: 0,
    });
    const disclaimer = makeNode({
      name: "Disclaimer",
      width: 548,
      height: 16,
      x: 0,
      y: 79,
      children: [disclaimerGlyphs],
    });
    const container = makeNode({
      name: "Container",
      width: 548,
      height: 95,
      children: [disclaimer],
    });
    const image = makeNode({
      name: "Image",
      width: 240,
      height: 95,
      x: 560,
      y: 0,
    });
    const adFrame = makeNode({
      name: "Ad",
      width: 800,
      height: 95,
      children: [container, image],
    });
    const wrapper = makeNode({
      name: " ",
      width: 800,
      height: 95.0719985961914,
      children: [adFrame],
    });
    adFrame.parent = wrapper;
    container.parent = adFrame;
    disclaimer.parent = container;
    disclaimerGlyphs.parent = disclaimer;
    image.parent = adFrame;

    globalThis.__html__ = "";
    globalThis.figma = {
      currentPage: {
        selection: [adFrame],
      },
      ui: {
        postMessage(message) {
          postedMessages.push(message);
        },
        resize() {},
        on(eventName, handler) {
          uiHandlers[eventName] = handler;
        },
      },
      showUI() {},
      notify() {},
      on() {},
      createNodeFromSvg() {
        throw new Error("not expected");
      },
    };

    await import(${modulePath("src/plugin.ts")});

    uiHandlers.message({
      type: "apply-resize",
      presetKey: "medicine_static_5",
      customPercent: null,
      direction: "height",
      onlyEnlarge: false,
      addTarget: "body",
      createAll: false,
    });

    export const selectedName = globalThis.figma.currentPage.selection[0].name;
    export const adHeight = Math.round(adFrame.height * 1000) / 1000;
    export const disclaimerHeight = Math.round(disclaimer.height * 1000) / 1000;
    export const lastError = postedMessages
      .filter((message) => message.type === "error")
      .at(-1)?.message || null;
    export const lastSuccess = postedMessages
      .filter((message) => message.type === "success")
      .at(-1)?.message || null;
  `);

  assert.equal(mod.lastError, null);
  assert.equal(mod.selectedName, "Disclaimer");
  assert.equal(mod.adHeight, 95);
  assert.equal(mod.disclaimerHeight, 6.94);
  assert.match(mod.lastSuccess, /Применено: 548×6,94 px — 5 % площади баннера/);
});
