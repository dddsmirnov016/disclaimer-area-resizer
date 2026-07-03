import { bundleAndImport, modulePath } from "./bundle.mjs";

let copyModulePromise = null;

export function loadCopyModule() {
  if (!copyModulePromise) {
    copyModulePromise = bundleAndImport(`
      export { COPY } from ${modulePath("src/generatedCopy.ts")};
      export { getCopy, formatCopy, pluralizeVariantWord } from ${modulePath("src/core/copy.ts")};
    `);
  }
  return copyModulePromise;
}

export function buildSamplePresets(copy) {
  return {
    bad_static_10: {
      label: copy.presets.bad_static_10,
      percent: 10,
      assetKey: "not-medicine",
    },
    medicine_video_7: {
      label: copy.presets.medicine_video_7,
      percent: 7,
      assetKey: "medicine",
    },
    finance_credit_5: {
      label: copy.presets.finance_credit_5,
      percent: 10,
      assetKey: "credit",
    },
    finance_custom_10: {
      label: copy.presets.finance_custom_10,
      percent: 10,
      assetKey: "bankruptcy",
    },
  };
}
