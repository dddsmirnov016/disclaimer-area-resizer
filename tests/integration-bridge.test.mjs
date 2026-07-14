import assert from "node:assert/strict";
import test from "node:test";

import { loadPlugin } from "./helpers/bundle.mjs";
import { loadCopyModule } from "./helpers/copy.mjs";
import { linkTree, makeFakeFigma, makeFakeNode } from "./helpers/fakeFigma.mjs";

const copyMod = await loadCopyModule();

// These tests boot the *real* bundled `src/plugin.ts` against a fake Figma
// sandbox and drive the UI → core message bridge end to end:
// UI message → plugin handler → fake figma side effect → response message.

function makeResizeScenario(disclaimerOverrides = {}) {
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

  const { figma, harness } = makeFakeFigma({ selection: [disclaimer] });
  return { figma, harness, banner, disclaimer };
}

const APPLY_BASE = {
  type: "apply-resize",
  presetKey: "medicine_video_7",
  addTarget: "body",
  createAll: false,
  expectedNodeId: null,
};

function typesOf(harness) {
  return harness.postedMessages.map((m) => m.type);
}

test("startup posts an initial ready state for a detected disclaimer", async () => {
  const { figma, harness } = makeResizeScenario();
  await loadPlugin(figma);

  const initial = harness.postedMessages.at(-1);
  assert.equal(initial.type, "ready");
  assert.equal(initial.info.mode, "resize-existing");
  assert.equal(harness.closed, false);
});

test("a disclaimer marked by an earlier apply is re-detected with its preset on the next state refresh", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE, presetKey: "bad_static_10" });

  const finalState = harness.postedMessages.filter((m) => m.type === "ready").at(-1);
  assert.equal(finalState.info.detectedPresetKey, "bad_static_10");
});

test("a plain layer with no plugin data and no matching name has no detected preset", async () => {
  const { figma, harness } = makeResizeScenario();
  await loadPlugin(figma);

  const initial = harness.postedMessages.at(-1);
  assert.equal(initial.info.detectedPresetKey, null);
});

test("happy path: apply-resize resizes the disclaimer and reports success", async () => {
  const { figma, harness, disclaimer } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE });

  const success = harness.postedMessages.filter((m) => m.type === "success");
  assert.equal(success.length, 1);
  assert.match(success[0].message, new RegExp(`^${copyMod.getCopy("plugin.actions.applied")}:`));
  assert.equal(harness.notifications.length, 1);
  // disclaimer height changed to hit ~7% of 660×82
  assert.ok(Math.abs((disclaimer.width * disclaimer.height) / (660 * 82) * 100 - 7) < 0.1);
  assert.equal(harness.closed, false);
});

test("unknown preset key produces an error and never creates nodes", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE, presetKey: "totally-unknown" });

  assert.equal(harness.postedMessages.at(-1).type, "error");
  assert.equal(harness.createdNodes.length, 0);
  assert.equal(harness.notifications.length, 0);
});

test("Figma API errors are mapped to a safe message, not leaked verbatim", async () => {
  const { figma, harness, disclaimer } = makeResizeScenario({
    type: "VECTOR",
    name: "disclaimer vector",
  });
  disclaimer.resize = () => {
    throw new Error("TypeError: in_an_instance set_constraints internal 0xDEADBEEF");
  };
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE });

  const error = harness.postedMessages.filter((m) => m.type === "error").at(-1);
  assert.ok(error, "an error was posted");
  // raw token / hex must not leak to the UI
  assert.equal(/0xDEADBEEF|TypeError/.test(error.message), false);
  assert.match(error.message, /[А-Яа-яЁё]/);
  assert.equal(harness.postedMessages.some((m) => m.type === "success"), false);
});

test("double apply (double-click) is handled twice without crashing", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE });
  plugin.sendFromUi({ ...APPLY_BASE });

  const success = harness.postedMessages.filter((m) => m.type === "success");
  assert.equal(success.length, 2);
  assert.equal(harness.notifications.length, 2);
});

test("rapid request-state then apply-resize stay ordered and consistent", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ type: "request-state" });
  plugin.sendFromUi({ ...APPLY_BASE });

  assert.ok(harness.postedMessages.some((m) => m.type === "success"));
  // last message after a successful apply is a refreshed state snapshot
  assert.equal(harness.postedMessages.at(-1).type, "ready");
});

test("stale flow: a selection change after success drives the UI back to no-selection", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE });
  assert.ok(harness.postedMessages.some((m) => m.type === "success"));

  figma.currentPage.selection = [];
  plugin.fireSelectionChange();

  assert.equal(harness.postedMessages.at(-1).type, "no-selection");
});

test("unknown/malformed UI messages are ignored safely", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);
  const before = harness.postedMessages.length;

  plugin.sendFromUi({ type: "launch-missiles", payload: 1 });
  plugin.sendFromUi("not-an-object");
  plugin.sendFromUi(null);
  plugin.sendFromUi({ type: "apply-resize" }); // missing presetKey → invalid

  assert.equal(harness.postedMessages.length, before, "no responses for invalid input");
  assert.equal(harness.closed, false);
});

test("resize message forwards width/height to figma.ui.resize", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ type: "resize", width: 432, height: 856 });

  assert.deepEqual(harness.resizeCalls.at(-1), { width: 432, height: 856 });
});

function bannerWithBodyContainer() {
  const text = makeFakeNode({ name: "copy", type: "TEXT", width: 600, height: 20 });
  const body = makeFakeNode({
    name: "body",
    type: "FRAME",
    width: 620,
    height: 60,
    x: 20,
    y: 10,
    layoutMode: "VERTICAL",
    children: [text],
  });
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    layoutMode: "NONE",
    children: [body],
  });
  // A real, insertable page so the banner is top-level yet cloneable.
  const page = makeFakeNode({ name: "Page 1", type: "PAGE", children: [banner] });
  linkTree(page);
  return banner;
}

function nativeAdInLayoutFrame() {
  const image = makeFakeNode({
    id: "10:1148",
    name: "Image",
    type: "RECTANGLE",
    width: 195,
    height: 195,
    fills: [{ type: "IMAGE" }],
  });
  const headline = makeFakeNode({
    id: "10:1151",
    name: "Получи до 3000 ₽ на карту ВТБ",
    type: "TEXT",
    width: 175,
    height: 30,
    x: 8,
    y: 205.38,
  });
  const ad = makeFakeNode({
    id: "10:1147",
    name: "AD",
    type: "FRAME",
    width: 195,
    height: 325,
    x: 16,
    y: 209.62,
    children: [image, headline],
  });
  const layoutFrame = makeFakeNode({
    id: "7:9",
    name: "Page 5",
    type: "FRAME",
    width: 500,
    height: 830,
    children: [ad],
  });
  const page = makeFakeNode({
    name: "Drafts",
    type: "PAGE",
    children: [layoutFrame],
  });
  linkTree(page);
  return { ad, layoutFrame };
}

function ordinaryNestedContentFrame() {
  const text = makeFakeNode({
    name: "Copy",
    type: "TEXT",
    width: 320,
    height: 40,
  });
  const body = makeFakeNode({
    name: "Body",
    type: "FRAME",
    width: 350,
    height: 300,
    x: 25,
    y: 25,
    layoutMode: "VERTICAL",
    children: [text],
  });
  const contentFrame = makeFakeNode({
    name: "Content",
    type: "FRAME",
    width: 400,
    height: 500,
    children: [body],
  });
  const layoutFrame = makeFakeNode({
    name: "Layout",
    type: "FRAME",
    width: 500,
    height: 830,
    children: [contentFrame],
  });
  const page = makeFakeNode({
    name: "Drafts",
    type: "PAGE",
    children: [layoutFrame],
  });
  linkTree(page);
  return { contentFrame, layoutFrame, body };
}

test("selecting a banner without a disclaimer offers the add-missing flow", async () => {
  const banner = bannerWithBodyContainer();
  const { figma, harness } = makeFakeFigma({ selection: [banner] });
  await loadPlugin(figma);

  const state = harness.postedMessages.at(-1);
  assert.equal(state.type, "ready");
  assert.equal(state.info.mode, "add-missing");
});

test("add-missing happy path: apply creates a disclaimer in the body and reports success", async () => {
  const banner = bannerWithBodyContainer();
  const { figma, harness } = makeFakeFigma({ selection: [banner] });
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE, presetKey: "medicine_video_7", addTarget: "body" });

  const success = harness.postedMessages.filter((m) => m.type === "success");
  assert.equal(success.length, 1);
  assert.match(success[0].message, new RegExp(`^${copyMod.getCopy("plugin.actions.added")}:`));
  assert.equal(harness.createdNodes.length, 1);
  assert.equal(harness.notifications.length, 1);
});

test("adding a BAD disclaimer to a nested native ad uses the ad area for size and status", async () => {
  const { ad } = nativeAdInLayoutFrame();
  const { figma, harness } = makeFakeFigma({ selection: [ad] });
  const plugin = await loadPlugin(figma);

  const initialState = harness.postedMessages.at(-1);
  assert.equal(initialState.type, "ready");
  assert.equal(initialState.info.mode, "add-missing");
  assert.equal(initialState.info.bannerWidth, 195);
  assert.equal(initialState.info.bannerHeight, 325);

  plugin.sendFromUi({
    ...APPLY_BASE,
    presetKey: "bad_static_10",
    addTarget: "body",
  });

  const disclaimer = harness.createdNodes.at(-1);
  assert.ok(disclaimer, "a disclaimer is created");
  assert.equal(disclaimer.parent, ad);
  const actualAdPercent =
    ((disclaimer.width * disclaimer.height) / (ad.width * ad.height)) * 100;
  assert.ok(Math.abs(actualAdPercent - 10) < 0.1);

  const finalState = harness.postedMessages
    .filter((message) => message.type === "ready")
    .at(-1);
  assert.equal(finalState.info.mode, "resize-existing");
  assert.equal(finalState.info.bannerWidth, 195);
  assert.equal(finalState.info.bannerHeight, 325);
  assert.equal(finalState.info.currentPercent, 10);

  const success = harness.postedMessages
    .filter((message) => message.type === "success")
    .at(-1);
  assert.match(success.message, /10\s?%/);

  const nestedVector = makeFakeNode({
    name: "BAD glyph",
    type: "VECTOR",
    width: 20,
    height: 5,
  });
  disclaimer.appendChild(nestedVector);
  figma.currentPage.selection = [nestedVector];
  plugin.sendFromUi({ type: "request-state" });

  const nestedSelectionState = harness.postedMessages
    .filter((message) => message.type === "ready")
    .at(-1);
  assert.equal(nestedSelectionState.info.mode, "resize-existing");
  assert.equal(nestedSelectionState.info.bannerWidth, 195);
  assert.equal(nestedSelectionState.info.bannerHeight, 325);
  assert.equal(nestedSelectionState.info.currentPercent, 10);

  plugin.sendFromUi({
    ...APPLY_BASE,
    presetKey: "bad_static_10",
    addTarget: "body",
  });

  const reappliedDisclaimer = figma.currentPage.selection[0];
  const reappliedPercent =
    ((reappliedDisclaimer.width * reappliedDisclaimer.height) /
      (ad.width * ad.height)) *
    100;
  assert.ok(Math.abs(reappliedPercent - 10) < 0.1);
});

test("an ordinary nested content frame keeps the outer layout area basis", async () => {
  const { contentFrame, layoutFrame, body } = ordinaryNestedContentFrame();
  const { figma, harness } = makeFakeFigma({ selection: [contentFrame] });
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({
    ...APPLY_BASE,
    presetKey: "bad_static_10",
    addTarget: "body",
  });

  const disclaimer = harness.createdNodes.at(-1);
  assert.ok(disclaimer, "a disclaimer is created");
  assert.equal(disclaimer.parent, body);

  const actualOuterPercent =
    ((disclaimer.width * disclaimer.height) /
      (layoutFrame.width * layoutFrame.height)) *
    100;
  assert.ok(Math.abs(actualOuterPercent - 10) < 0.1);

  const finalState = harness.postedMessages
    .filter((message) => message.type === "ready")
    .at(-1);
  assert.equal(finalState.info.mode, "resize-existing");
  assert.equal(finalState.info.bannerWidth, 500);
  assert.equal(finalState.info.bannerHeight, 830);
  assert.equal(finalState.info.currentPercent, 10);
});

test("add-missing with no text container falls back to the banner and adds a disclaimer", async () => {
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    layoutMode: "NONE",
    parent: { type: "PAGE" },
    children: [],
  });
  banner.parent = { type: "PAGE" };
  const { figma, harness } = makeFakeFigma({ selection: [banner] });
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE, presetKey: "medicine_video_7", addTarget: "body" });

  const success = harness.postedMessages.filter((m) => m.type === "success").at(-1);
  assert.ok(success, "a success message is posted");
  assert.equal(harness.postedMessages.some((m) => m.type === "error"), false);
  // exactly one disclaimer is created and kept (not removed) inside the banner
  assert.equal(harness.createdNodes.length, 1);
  assert.equal(harness.createdNodes.every((n) => n.removed), false);
  assert.equal(banner.children.length, 1);
  assert.equal(banner.children[0], harness.createdNodes[0]);
  assert.equal(harness.notifications.length, 1);
});

test("add-missing create-all duplicates the banner per unique asset", async () => {
  const banner = bannerWithBodyContainer();
  const { figma, harness } = makeFakeFigma({ selection: [banner] });
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({
    ...APPLY_BASE,
    presetKey: "medicine_video_7",
    addTarget: "body",
    createAll: true,
  });

  const success = harness.postedMessages.filter((m) => m.type === "success").at(-1);
  assert.ok(success, "a success message is posted");
  assert.match(success.message, /Создали/);
  assert.ok(harness.createdNodes.length >= 1);
});
