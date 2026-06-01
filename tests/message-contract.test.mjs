import assert from "node:assert/strict";
import test from "node:test";

import { bundleAndImport, modulePath } from "./helpers/bundle.mjs";

const v = await bundleAndImport(`
  export * from ${modulePath("src/ui/messageValidation.ts")};
`);

// ── Inbound (UI → plugin) ───────────────────────────────────────────────────

test("parseUiMessage accepts request-state", () => {
  assert.deepEqual(v.parseUiMessage({ type: "request-state" }), {
    type: "request-state",
  });
});

test("parseUiMessage accepts and normalizes a full apply-resize", () => {
  const result = v.parseUiMessage({
    type: "apply-resize",
    presetKey: "medicine_video_7",
    customPercent: null,
    direction: "width",
    onlyEnlarge: true,
    addTarget: "image",
    createAll: true,
  });
  assert.deepEqual(result, {
    type: "apply-resize",
    presetKey: "medicine_video_7",
    customPercent: null,
    direction: "width",
    onlyEnlarge: true,
    addTarget: "image",
    createAll: true,
  });
});

test("parseUiMessage fills safe defaults for missing optional fields (backward compatible)", () => {
  const result = v.parseUiMessage({
    type: "apply-resize",
    presetKey: "custom",
  });
  assert.deepEqual(result, {
    type: "apply-resize",
    presetKey: "custom",
    customPercent: null,
    direction: "height",
    onlyEnlarge: false,
    addTarget: "body",
    createAll: false,
  });
});

test("parseUiMessage coerces a legacy numeric-string customPercent", () => {
  const result = v.parseUiMessage({
    type: "apply-resize",
    presetKey: "custom",
    customPercent: "7,5",
  });
  assert.equal(result.customPercent, 7.5);
});

test("parseUiMessage falls back to safe enum values for unknown enums", () => {
  const result = v.parseUiMessage({
    type: "apply-resize",
    presetKey: "custom",
    direction: "diagonal",
    addTarget: "sky",
  });
  assert.equal(result.direction, "height");
  assert.equal(result.addTarget, "body");
});

test("parseUiMessage ignores unknown/extra fields (forward compatible)", () => {
  const result = v.parseUiMessage({
    type: "apply-resize",
    presetKey: "custom",
    futureFlag: true,
    nested: { a: 1 },
  });
  assert.equal("futureFlag" in result, false);
  assert.equal("nested" in result, false);
});

test("parseUiMessage rejects apply-resize without a string presetKey", () => {
  assert.equal(v.parseUiMessage({ type: "apply-resize" }), null);
  assert.equal(v.parseUiMessage({ type: "apply-resize", presetKey: 7 }), null);
  assert.equal(v.parseUiMessage({ type: "apply-resize", presetKey: null }), null);
});

test("parseUiMessage validates resize bounds and types", () => {
  assert.deepEqual(v.parseUiMessage({ type: "resize", width: 432, height: 776 }), {
    type: "resize",
    width: 432,
    height: 776,
  });
  assert.equal(v.parseUiMessage({ type: "resize", width: 432 }), null);
  assert.equal(v.parseUiMessage({ type: "resize", width: "432", height: 776 }), null);
  assert.equal(v.parseUiMessage({ type: "resize", width: 0, height: 776 }), null);
  assert.equal(v.parseUiMessage({ type: "resize", width: -5, height: 776 }), null);
  assert.equal(v.parseUiMessage({ type: "resize", width: NaN, height: 776 }), null);
  assert.equal(v.parseUiMessage({ type: "resize", width: Infinity, height: 776 }), null);
});

test("parseUiMessage rejects unknown types and non-objects", () => {
  assert.equal(v.parseUiMessage({ type: "launch-missiles" }), null);
  assert.equal(v.parseUiMessage({}), null);
  assert.equal(v.parseUiMessage(null), null);
  assert.equal(v.parseUiMessage(undefined), null);
  assert.equal(v.parseUiMessage(42), null);
  assert.equal(v.parseUiMessage("apply-resize"), null);
  assert.equal(v.parseUiMessage([{ type: "request-state" }]), null);
});

test("isUiMessage mirrors parseUiMessage", () => {
  assert.equal(v.isUiMessage({ type: "request-state" }), true);
  assert.equal(v.isUiMessage({ type: "nope" }), false);
});

// ── Outbound (plugin → UI) ──────────────────────────────────────────────────

test("isPluginMessage accepts the shapes the UI can render", () => {
  assert.equal(v.isPluginMessage({ type: "success", message: "ok" }), true);
  assert.equal(v.isPluginMessage({ type: "error", message: "bad" }), true);
  assert.equal(v.isPluginMessage({ type: "no-selection", presets: {} }), true);
  assert.equal(v.isPluginMessage({ type: "invalid", presets: {}, error: "x" }), true);
  assert.equal(
    v.isPluginMessage({ type: "ready", presets: {}, info: { mode: "add-missing" } }),
    true
  );
});

test("isPluginMessage rejects malformed outbound messages", () => {
  assert.equal(v.isPluginMessage({ type: "success" }), false);
  assert.equal(v.isPluginMessage({ type: "error", message: 5 }), false);
  assert.equal(v.isPluginMessage({ type: "ready" }), false);
  assert.equal(v.isPluginMessage({ type: "weird", message: "x" }), false);
  assert.equal(v.isPluginMessage(null), false);
});

test("message-type guards classify known protocol types", () => {
  assert.equal(v.isUiMessageType("apply-resize"), true);
  assert.equal(v.isUiMessageType("error"), false);
  assert.equal(v.isPluginMessageType("ready"), true);
  assert.equal(v.isPluginMessageType("resize"), false);
});
