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
  assert.equal(presets.getTargetPercent("finance_custom_10", null), 10);
});

test("getTargetPercent returns null for unknown preset keys", () => {
  assert.equal(presets.getTargetPercent("does-not-exist", null), null);
  assert.equal(presets.getTargetPercent("", null), null);
  assert.equal(presets.getTargetPercent("МедицинаЭмодзи😀", null), null);
});

test("getPresetAndAssetGroup resolves a preset to its asset group", () => {
  const resolved = presets.getPresetAndAssetGroup("medicine_video_7");
  assert.ok(resolved);
  assert.equal(resolved.preset.percent, 7);
  assert.equal(resolved.assetGroupKey, presets.ASSET_MEDICINE);
});

test("getPresetAndAssetGroup returns null for unknown preset keys", () => {
  assert.equal(presets.getPresetAndAssetGroup("nope"), null);
});

test("pickBestAssetVariant picks the widest variant for a very horizontal target area", () => {
  const variant = presets.pickBestAssetVariant(presets.ASSET_NOT_MEDICINE, 572, 28);
  assert.equal(variant.key, "bad-572-28");
});

test("pickBestAssetVariant picks the ultra-wide variant for an ultra-wide target area", () => {
  const variant = presets.pickBestAssetVariant(presets.ASSET_NOT_MEDICINE, 1600, 40);
  assert.equal(variant.key, "bad-1000-28");
});

test("pickBestAssetVariant picks the least-wide variant for a near-square target area", () => {
  const variant = presets.pickBestAssetVariant(presets.ASSET_NOT_MEDICINE, 60, 60);
  assert.equal(variant.key, "bad-193-47");
});

test("pickBestAssetVariant picks the middle variant for a moderately wide target area", () => {
  const variant = presets.pickBestAssetVariant(presets.ASSET_NOT_MEDICINE, 260, 57);
  assert.equal(variant.key, "bad-260-57");
});

test("pickBestAssetVariant falls back to the first variant for an empty target area", () => {
  const variant = presets.pickBestAssetVariant(presets.ASSET_MEDICINE, 0, 0);
  assert.ok(variant.key.startsWith("med-"));
});

test("getAssetGroupVariants returns every SVG variant registered for a group", () => {
  const variants = presets.getAssetGroupVariants(presets.ASSET_BANKRUPTCY);
  assert.equal(variants.length, 4);
  assert.ok(variants.every((variant) => variant.key.startsWith("bancrupt-")));
});

test("getAssetGroupVariants returns an empty list for an unknown group", () => {
  assert.deepEqual(presets.getAssetGroupVariants("unknown-group"), []);
});

test("DISCLAIMER_PRESETS contains exactly 4 entries", () => {
  const keys = Object.keys(presets.DISCLAIMER_PRESETS);
  assert.equal(keys.length, 4);
  assert.ok(keys.includes("bad_static_10"));
  assert.ok(keys.includes("medicine_video_7"));
  assert.ok(keys.includes("finance_credit_5"));
  assert.ok(keys.includes("finance_custom_10"));
});

test("create-all entries are unique per SVG asset and carry a numeric percent", () => {
  const entries = presets.getPrimaryPresetEntriesByAsset();
  const assetKeys = entries.map((entry) => entry.asset.key);

  assert.equal(entries.length, 4);
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

// ── detectPresetKeyForDisclaimer ────────────────────────────────────────────

test("detectPresetKeyForDisclaimer trusts an exact stored preset key over everything else", () => {
  const result = presets.detectPresetKeyForDisclaimer({
    storedPresetKey: "medicine_video_7",
    storedAssetKey: "irrelevant",
    nodeName: "irrelevant name",
    currentPercent: 999,
  });
  assert.equal(result, "medicine_video_7");
});

test("detectPresetKeyForDisclaimer ignores an unknown/stale stored preset key", () => {
  const result = presets.detectPresetKeyForDisclaimer({
    storedPresetKey: "preset_removed_in_a_later_version",
    storedAssetKey: presets.ASSET_CREDIT,
    nodeName: "",
    currentPercent: 10,
  });
  assert.equal(result, "finance_credit_5");
});

test("detectPresetKeyForDisclaimer resolves a single preset per stored asset key", () => {
  const result = presets.detectPresetKeyForDisclaimer({
    storedPresetKey: "",
    storedAssetKey: presets.ASSET_BANKRUPTCY,
    nodeName: "",
    currentPercent: null,
  });
  assert.equal(result, "finance_custom_10");
});

test("detectPresetKeyForDisclaimer resolves medicine asset to medicine_video_7", () => {
  const result = presets.detectPresetKeyForDisclaimer({
    storedPresetKey: "",
    storedAssetKey: presets.ASSET_MEDICINE,
    nodeName: "",
    currentPercent: 7,
  });
  assert.equal(result, "medicine_video_7");
});

test("detectPresetKeyForDisclaimer resolves not-medicine asset to bad_static_10", () => {
  const result = presets.detectPresetKeyForDisclaimer({
    storedPresetKey: "",
    storedAssetKey: presets.ASSET_NOT_MEDICINE,
    nodeName: "",
    currentPercent: 10,
  });
  assert.equal(result, "bad_static_10");
});

test("detectPresetKeyForDisclaimer falls back to matching the asset by node name", () => {
  const result = presets.detectPresetKeyForDisclaimer({
    storedPresetKey: "",
    storedAssetKey: "",
    nodeName: "Слой: Не является лекарством (копия)",
    currentPercent: 10,
  });
  assert.equal(result, "bad_static_10");
});

test("detectPresetKeyForDisclaimer returns null when nothing can be inferred", () => {
  assert.equal(
    presets.detectPresetKeyForDisclaimer({
      storedPresetKey: "",
      storedAssetKey: "",
      nodeName: "",
      currentPercent: null,
    }),
    null
  );
  assert.equal(
    presets.detectPresetKeyForDisclaimer({
      storedPresetKey: "",
      storedAssetKey: "",
      nodeName: "случайное имя слоя 😀",
      currentPercent: null,
    }),
    null
  );
  assert.equal(
    presets.detectPresetKeyForDisclaimer({
      storedPresetKey: "",
      storedAssetKey: "unknown-asset-key",
      nodeName: "",
      currentPercent: null,
    }),
    null
  );
});
