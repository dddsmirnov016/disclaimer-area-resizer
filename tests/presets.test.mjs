import assert from "node:assert/strict";
import test from "node:test";

import { bundleAndImport, modulePath } from "./helpers/bundle.mjs";

const presets = await bundleAndImport(`
  export * from ${modulePath("src/core/presets.ts")};
`);

test("getTargetPercent returns the fixed percent for known presets", () => {
  assert.equal(presets.getTargetPercent("medicine_video_7", null), 7);
  assert.equal(presets.getTargetPercent("bad_static_10", null), 10);
  assert.equal(presets.getTargetPercent("finance_credit_5", null), 10);
});

test("getTargetPercent validates the custom percent boundaries", () => {
  assert.equal(presets.getTargetPercent("custom", 7.5), 7.5);
  assert.equal(presets.getTargetPercent("custom", 0.01), 0.01);
  assert.equal(presets.getTargetPercent("custom", 100), 100);

  assert.equal(presets.getTargetPercent("custom", 0), null);
  assert.equal(presets.getTargetPercent("custom", -5), null);
  assert.equal(presets.getTargetPercent("custom", 100.01), null);
  assert.equal(presets.getTargetPercent("custom", null), null);
});

test("getTargetPercent rejects non-finite custom values", () => {
  assert.equal(presets.getTargetPercent("custom", Number.NaN), null);
  assert.equal(presets.getTargetPercent("custom", Infinity), null);
  assert.equal(presets.getTargetPercent("custom", -Infinity), null);
});

test("getTargetPercent returns null for unknown preset keys", () => {
  assert.equal(presets.getTargetPercent("does-not-exist", null), null);
  assert.equal(presets.getTargetPercent("", null), null);
  assert.equal(presets.getTargetPercent("МедицинаЭмодзи😀", null), null);
});

test("getPresetAndAsset resolves a preset to a concrete SVG asset", () => {
  const resolved = presets.getPresetAndAsset("medicine_video_7");
  assert.ok(resolved);
  assert.equal(resolved.preset.percent, 7);
  assert.equal(typeof resolved.asset.svg, "string");
  assert.ok(resolved.asset.svg.length > 0);
});

test("getPresetAndAsset returns null for unknown preset keys", () => {
  assert.equal(presets.getPresetAndAsset("nope"), null);
});

test("create-all entries are unique per SVG asset and carry a numeric percent", () => {
  const entries = presets.getPrimaryPresetEntriesByAsset();
  const assetKeys = entries.map((entry) => entry.asset.key);

  assert.ok(entries.length > 0);
  assert.equal(new Set(assetKeys).size, assetKeys.length);
  for (const entry of entries) {
    assert.equal(typeof entry.preset.percent, "number");
    assert.ok(entry.preset.percent > 0);
  }
});

test("preset labels are non-empty Cyrillic strings", () => {
  for (const [key, preset] of Object.entries(presets.DISCLAIMER_PRESETS)) {
    assert.ok(preset.label.length > 0, `${key} has a label`);
    assert.match(preset.label, /[А-Яа-яЁё]/, `${key} label is Russian`);
  }
});
