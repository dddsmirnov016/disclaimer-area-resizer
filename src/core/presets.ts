import { DISCLAIMER_ASSET_LIST } from "../generatedDisclaimerAssets";
import { getCopy, getPresetLabel } from "./copy";
import type { DisclaimerAsset, DisclaimerPreset, PresetAssetEntry } from "./types";

export const ASSET_MEDICINE =
  "Есть противопоказания. Посоветуйтесь с врачом . Возможен вред здоровью и бесплодие.";
export const ASSET_NOT_MEDICINE = "Не является лекарством";
export const ASSET_CREDIT =
  "Изучите все условия кредита (займа) на сайте в соответствующем разделе. Оценивайте свои финансовые возможности и риски";
export const ASSET_BANKRUPTCY =
  "Банкротство влечёт негативные последствия, в том числе ограничения на получение кредита и повторное банкротство в течение пяти лет";

const ASSET_GROUP_VARIANT_PREFIXES: Record<string, string> = {
  [ASSET_MEDICINE]: "med-",
  [ASSET_NOT_MEDICINE]: "bad-",
  [ASSET_CREDIT]: "credit-",
  [ASSET_BANKRUPTCY]: "bancrupt-",
};

export const ASSET_GROUP_KEYS: string[] = Object.keys(ASSET_GROUP_VARIANT_PREFIXES);

export function getAssetGroupVariants(assetGroupKey: string): DisclaimerAsset[] {
  const prefix = ASSET_GROUP_VARIANT_PREFIXES[assetGroupKey];
  if (!prefix) return [];
  return DISCLAIMER_ASSET_LIST.filter((asset) => asset.key.startsWith(prefix));
}

function hasAssetGroup(assetGroupKey: string): boolean {
  return getAssetGroupVariants(assetGroupKey).length > 0;
}

export function pickBestAssetVariant(
  assetGroupKey: string,
  targetWidth: number,
  targetHeight: number
): DisclaimerAsset {
  const variants = getAssetGroupVariants(assetGroupKey);

  if (variants.length === 0) {
    // Can only happen when the generated asset registry is out of sync with
    // the preset mapping (broken build); the message must still be Russian
    // because it surfaces in the UI.
    throw new Error(getCopy("plugin.errors.disclaimerAssetMissing"));
  }

  if (
    variants.length === 1 ||
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return variants[0];
  }

  const targetLogRatio = Math.log(targetWidth / targetHeight);
  let best = variants[0];
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const variant of variants) {
    const diff = Math.abs(Math.log(variant.width / variant.height) - targetLogRatio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = variant;
    }
  }

  return best;
}

export const DISCLAIMER_PRESETS: Record<string, DisclaimerPreset> = {
  bad_static_10: {
    label: getPresetLabel("bad_static_10"),
    percent: 10,
    assetKey: ASSET_NOT_MEDICINE,
  },
  medicine_video_7: {
    label: getPresetLabel("medicine_video_7"),
    percent: 7,
    assetKey: ASSET_MEDICINE,
  },
  finance_credit_5: {
    label: getPresetLabel("finance_credit_5"),
    percent: 10,
    assetKey: ASSET_CREDIT,
  },
  finance_custom_10: {
    label: getPresetLabel("finance_custom_10"),
    percent: 10,
    assetKey: ASSET_BANKRUPTCY,
  },
};
export function getTargetPercent(presetKey: string): number | null {
  const preset = DISCLAIMER_PRESETS[presetKey];
  return preset && preset.percent !== null ? preset.percent : null;
}

export function getPresetAndAssetGroup(presetKey: string): {
  preset: DisclaimerPreset;
  assetGroupKey: string;
} | null {
  const preset = DISCLAIMER_PRESETS[presetKey];
  if (!preset) return null;

  if (!hasAssetGroup(preset.assetKey)) return null;

  return { preset, assetGroupKey: preset.assetKey };
}

function findAssetKeyByNodeName(nodeName: string): string | null {
  const trimmedName = nodeName.trim();
  if (!trimmedName) return null;

  for (const assetGroupKey of ASSET_GROUP_KEYS) {
    if (trimmedName.includes(assetGroupKey)) return assetGroupKey;
  }

  return null;
}

/**
 * Best-effort guess of which preset an already-placed disclaimer belongs to,
 * used to pre-select the "Тип дисклеймера" dropdown when the plugin detects an
 * existing disclaimer. Prefers the exact preset key the plugin itself stored
 * when it created/resized the node; falls back to matching the disclaimer's
 * SVG asset by node name and, if several presets share that asset, to the
 * preset whose fixed percent is closest to the node's current area share.
 * Returns `null` when nothing can be inferred confidently.
 */
export function detectPresetKeyForDisclaimer(params: {
  storedPresetKey: string;
  storedAssetKey: string;
  nodeName: string;
  currentPercent: number | null;
}): string | null {
  const { storedPresetKey, storedAssetKey, nodeName, currentPercent } = params;

  if (storedPresetKey && DISCLAIMER_PRESETS[storedPresetKey]) {
    return storedPresetKey;
  }

  const assetKey = storedAssetKey || findAssetKeyByNodeName(nodeName);
  if (!assetKey) return null;

  const candidateKeys = Object.keys(DISCLAIMER_PRESETS).filter((key) => {
    const preset = DISCLAIMER_PRESETS[key];
    return preset.percent !== null && preset.assetKey === assetKey;
  });

  if (candidateKeys.length === 0) return null;
  if (candidateKeys.length === 1) return candidateKeys[0];

  if (currentPercent !== null && Number.isFinite(currentPercent)) {
    let closestKey = candidateKeys[0];
    let closestDiff = Number.POSITIVE_INFINITY;

    for (const key of candidateKeys) {
      const percent = DISCLAIMER_PRESETS[key].percent;
      const diff = percent === null ? Number.POSITIVE_INFINITY : Math.abs(percent - currentPercent);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestKey = key;
      }
    }

    return closestKey;
  }

  return candidateKeys[0];
}

export function getPrimaryPresetEntriesByAsset(): PresetAssetEntry[] {
  const seenAssetGroupKeys: Record<string, boolean> = {};
  const entries: PresetAssetEntry[] = [];

  for (const presetKey of Object.keys(DISCLAIMER_PRESETS)) {
    const preset = DISCLAIMER_PRESETS[presetKey];
    if (!preset || preset.percent === null) continue;

    const assetGroupKey = preset.assetKey;
    if (seenAssetGroupKeys[assetGroupKey] || !hasAssetGroup(assetGroupKey)) continue;

    seenAssetGroupKeys[assetGroupKey] = true;
    entries.push({
      presetKey,
      preset,
      asset: { key: assetGroupKey, label: assetGroupKey },
    });
  }

  return entries;
}
