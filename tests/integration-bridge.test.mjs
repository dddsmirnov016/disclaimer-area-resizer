import assert from "node:assert/strict";
import test from "node:test";

import { loadPlugin } from "./helpers/bundle.mjs";
import { linkTree, makeFakeFigma, makeFakeNode } from "./helpers/fakeFigma.mjs";

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
  presetKey: "medicine_static_5",
  customPercent: null,
  direction: "height",
  onlyEnlarge: false,
  addTarget: "body",
  createAll: false,
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

test("happy path: apply-resize resizes the disclaimer and reports success", async () => {
  const { figma, harness, disclaimer } = makeResizeScenario();
  const plugin = await loadPlugin(figma);

  plugin.sendFromUi({ ...APPLY_BASE });

  const success = harness.postedMessages.filter((m) => m.type === "success");
  assert.equal(success.length, 1);
  assert.match(success[0].message, /Применено:/);
  assert.equal(harness.notifications.length, 1);
  // disclaimer height changed to hit ~5% of 660×82
  assert.ok(Math.abs((disclaimer.width * disclaimer.height) / (660 * 82) * 100 - 5) < 0.1);
  assert.equal(harness.closed, false);
});

test("validation error: custom preset without a percent surfaces a friendly error and no side effects", async () => {
  const { figma, harness } = makeResizeScenario();
  const plugin = await loadPlugin(figma);
  const notificationsBefore = harness.notifications.length;

  plugin.sendFromUi({ ...APPLY_BASE, presetKey: "custom", customPercent: null });

  const errors = harness.postedMessages.filter((m) => m.type === "error");
  assert.equal(errors.at(-1).message, "Укажите процент больше 0 и не больше 100.");
  assert.equal(harness.postedMessages.some((m) => m.type === "success"), false);
  assert.equal(harness.notifications.length, notificationsBefore);
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

test("selecting a banner without a disclaimer yields info feedback (current product behavior)", async () => {
  const banner = makeFakeNode({
    name: "Banner",
    type: "FRAME",
    width: 660,
    height: 82,
    parent: { type: "PAGE" },
    children: [],
  });
  banner.parent = { type: "PAGE" };
  const { figma, harness } = makeFakeFigma({ selection: [banner] });
  const plugin = await loadPlugin(figma);

  const state = harness.postedMessages.at(-1);
  assert.equal(state.type, "invalid");
  assert.equal(state.feedbackTone, "info");

  // applying anyway must not mutate the document
  plugin.sendFromUi({ ...APPLY_BASE });
  assert.equal(harness.createdNodes.length, 0);
  assert.equal(harness.notifications.length, 0);
});
