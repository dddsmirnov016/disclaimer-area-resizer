import assert from "node:assert/strict";
import test from "node:test";

import { bundleAndImport, modulePath } from "./helpers/bundle.mjs";
import {
  linkTree,
  makeFakeFigma,
  makeFakeNode,
  withFakeFigma,
} from "./helpers/fakeFigma.mjs";

const state = await bundleAndImport(`
  export { buildState, BANNER_DISCLAIMER_DETECTION_ERROR } from ${modulePath("src/state/selectionState.ts")};
`);

const features = await bundleAndImport(`
  export { resizeExistingDisclaimer } from ${modulePath("src/features/resizeExisting.ts")};
  export { addDisclaimerToBody, addDisclaimerToImage } from ${modulePath("src/features/addMissing.ts")};
  export { createAllDisclaimerVariants } from ${modulePath("src/features/createAllVariants.ts")};
  export {
    PLUGIN_DATA_NAMESPACE,
    PLUGIN_DATA_ASSET_KEY,
    PLUGIN_DATA_PRESET_KEY,
  } from ${modulePath("src/figma/disclaimerNodes.ts")};
`);

function bannerWithDisclaimer(disclaimerOverrides = {}) {
  const disclaimer = makeFakeNode({
    name: "disclaimer copy",
    type: "TEXT",
    width: 200,
    height: 18,
    x: 20,
    y: 60,
    ...disclaimerOverrides,
  });
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    parent: { type: "PAGE" },
    children: [disclaimer],
  });
  linkTree(banner);
  banner.parent = { type: "PAGE" };
  return { banner, disclaimer };
}

// ── buildState: selection cardinality ───────────────────────────────────────

test("buildState reports no-selection for an empty selection", () => {
  const result = state.buildState([]);
  assert.equal(result.type, "no-selection");
  assert.match(result.error, /Выделите один слой/);
  assert.ok(result.presets);
});

test("buildState rejects multi-node selections", () => {
  const a = makeFakeNode({ name: "a" });
  const b = makeFakeNode({ name: "b" });
  const result = state.buildState([a, b]);
  assert.equal(result.type, "invalid");
  assert.match(result.error, /только один слой/);
});

// ── buildState: node validity ───────────────────────────────────────────────

test("buildState builds a ready resize state for a disclaimer inside a banner", () => {
  const { banner } = bannerWithDisclaimer();
  const result = state.buildState([banner.children[0]]);
  assert.equal(result.type, "ready");
  assert.equal(result.info.mode, "resize-existing");
  assert.equal(result.info.disclaimerWidth, 200);
  assert.equal(result.info.disclaimerHeight, 18);
  assert.equal(result.info.bannerWidth, 660);
  assert.equal(result.info.currentPercent, 6.65);
});

test("buildState flags a locked banner", () => {
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    locked: true,
    parent: { type: "PAGE" },
  });
  banner.parent = { type: "PAGE" };
  const result = state.buildState([banner]);
  assert.equal(result.type, "invalid");
  assert.match(result.error, /заблокирован/);
});

test("buildState flags a locked disclaimer node", () => {
  const { banner } = bannerWithDisclaimer({ locked: true });
  const result = state.buildState([banner.children[0]]);
  assert.equal(result.type, "invalid");
  assert.match(result.error, /заблокирован/);
});

test("buildState flags zero or negative node sizes", () => {
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 0,
    height: 82,
    parent: { type: "PAGE" },
  });
  banner.parent = { type: "PAGE" };
  const result = state.buildState([banner]);
  assert.equal(result.type, "invalid");
  assert.match(result.error, /больше нуля/);
});

test("buildState rejects a non-resizable node", () => {
  const node = makeFakeNode({
    name: "group",
    type: "SLICE",
    removeResize: true,
    removeResizeWithoutConstraints: true,
    parent: { type: "PAGE" },
  });
  node.parent = { type: "PAGE" };
  const result = state.buildState([node]);
  assert.equal(result.type, "invalid");
  assert.match(result.error, /нельзя изменить в размере/);
});

test("buildState reports info feedback when a banner has no detectable disclaimer", () => {
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 300,
    height: 250,
    parent: { type: "PAGE" },
    children: [],
  });
  banner.parent = { type: "PAGE" };
  const result = state.buildState([banner]);
  assert.equal(result.type, "invalid");
  assert.equal(result.feedbackTone, "info");
  assert.equal(result.error, state.BANNER_DISCLAIMER_DETECTION_ERROR);
});

test("buildState asks for a banner when a loose resizable node has no banner ancestor", () => {
  const node = makeFakeNode({
    name: "lonely text",
    type: "TEXT",
    width: 120,
    height: 12,
    parent: { type: "PAGE" },
  });
  node.parent = { type: "PAGE" };
  const result = state.buildState([node]);
  assert.equal(result.type, "invalid");
  assert.match(result.error, /внутри баннера/);
});

// ── Feature side effects + resilience ───────────────────────────────────────

test("resizeExistingDisclaimer refuses a locked layer and changes nothing", () => {
  const { banner } = bannerWithDisclaimer({ locked: true });
  const node = banner.children[0];
  const before = { w: node.width, h: node.height };

  assert.throws(
    () =>
      features.resizeExistingDisclaimer({
        node,
        bannerFrame: banner,
        targetPercent: 7,
        direction: "height",
        onlyEnlarge: false,
        asset: { key: "x", label: "X", svg: "<svg/>" },
        presetKey: "custom",
      }),
    /заблокирован/
  );
  assert.equal(node.width, before.w);
  assert.equal(node.height, before.h);
});

test("resizeExistingDisclaimer resizes a text node and marks plugin data", () => {
  const { banner } = bannerWithDisclaimer();
  const node = banner.children[0];
  const asset = { key: "Не является лекарством", label: "Не лекарство", svg: "<svg/>" };

  const outcome = features.resizeExistingDisclaimer({
    node,
    bannerFrame: banner,
    targetPercent: 7,
    direction: "height",
    onlyEnlarge: false,
    asset,
    presetKey: "bad_static_10",
  });

  assert.equal(outcome.node, node);
  assert.ok(Math.abs(outcome.actualPercent - 7) < 0.05);
  assert.equal(
    node.getSharedPluginData(features.PLUGIN_DATA_NAMESPACE, features.PLUGIN_DATA_ASSET_KEY),
    "Не является лекарством"
  );
});

test("addDisclaimerToBody throws and creates no node when there is no text container", async () => {
  const { figma, harness } = makeFakeFigma();
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    layoutMode: "NONE",
    children: [],
  });

  await withFakeFigma(figma, () => {
    assert.throws(
      () =>
        features.addDisclaimerToBody({
          bannerFrame: banner,
          asset: { key: "k", label: "L", svg: "<svg/>" },
          presetKey: "custom",
          targetPercent: 7,
        }),
      /текстовый контейнер/
    );
  });

  assert.equal(harness.createdNodes.length, 0);
});

test("addDisclaimerToImage cleans up its created node when no image is found", async () => {
  const { figma, harness } = makeFakeFigma();
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    layoutMode: "NONE",
    children: [],
  });

  await withFakeFigma(figma, () => {
    assert.throws(
      () =>
        features.addDisclaimerToImage({
          bannerFrame: banner,
          asset: { key: "k", label: "L", svg: "<svg/>" },
          presetKey: "custom",
          targetPercent: 7,
        }),
      /изображени|видео/
    );
  });

  assert.equal(harness.createdNodes.length, 1);
  assert.equal(harness.createdNodes[0].removed, true, "orphan node is removed");
});

function bannerWithBody() {
  const text = makeFakeNode({ name: "copy", type: "TEXT", width: 260, height: 20 });
  const body = makeFakeNode({
    name: "body",
    type: "FRAME",
    width: 280,
    height: 200,
    x: 10,
    y: 10,
    layoutMode: "VERTICAL",
    children: [text],
  });
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 300,
    height: 250,
    layoutMode: "NONE",
    children: [body],
  });
  const parent = makeFakeNode({ name: "Page frame", type: "FRAME", children: [banner] });
  linkTree(parent);
  return { parent, banner };
}

test("createAllDisclaimerVariants duplicates the banner once per unique asset without touching the original", async () => {
  const { figma, harness } = makeFakeFigma();
  const { parent, banner } = bannerWithBody();
  const originalChildCount = banner.children.length;

  const result = await withFakeFigma(figma, () =>
    features.createAllDisclaimerVariants({ bannerFrame: banner, addTarget: "body" })
  );

  assert.ok(result.count >= 1);
  assert.equal(result.nodes.length, result.count);
  assert.equal(harness.createdNodes.length, result.count, "one disclaimer per variant");
  // original banner is untouched
  assert.equal(banner.children.length, originalChildCount);
  // each duplicate is to the right of the original and parented correctly
  for (const node of result.nodes) {
    assert.equal(node.parent, parent);
    assert.ok(node.x > banner.x);
  }
});

test("createAllDisclaimerVariants refuses a banner with no insertable parent and creates nothing", async () => {
  const { figma, harness } = makeFakeFigma();
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 300,
    height: 250,
    parent: { type: "PAGE" },
  });
  banner.parent = { type: "PAGE" };

  await withFakeFigma(figma, () => {
    assert.throws(
      () => features.createAllDisclaimerVariants({ bannerFrame: banner, addTarget: "body" }),
      /продублировать/
    );
  });
  assert.equal(harness.createdNodes.length, 0);
});
