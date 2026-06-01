import { DISCLAIMER_ASSETS } from "../generatedDisclaimerAssets";
import type { DisclaimerAsset, DisclaimerPreset, PresetAssetEntry } from "./types";

export const ASSET_MEDICINE =
  "Есть противопоказания. Посоветуйтесь с врачом . Возможен вред здоровью и бесплодие.";
export const ASSET_NOT_MEDICINE = "Не является лекарством";
export const ASSET_CREDIT =
  "Изучите все условия кредита (займа) на сайте в соответствующем разделе. Оценивайте свои финансовые возможности и риски";
export const ASSET_BANKRUPTCY =
  "Банкротство влечёт негативные последствия, в том числе ограничения на получение кредита и повторное банкротство в течение пяти лет";

export const DISCLAIMER_PRESETS: Record<string, DisclaimerPreset> = {
  medicine_video_7: {
    label: "Медицина — 7 %: ТВ, видео или по ТЗ",
    percent: 7,
    assetKey: ASSET_MEDICINE,
  },
  medicine_static_5: {
    label: "Медицина — 5 %: статичный баннер и другие форматы",
    percent: 5,
    assetKey: ASSET_MEDICINE,
  },
  bad_static_10: {
    label: "БАД — 10 %: статичный баннер и другие форматы",
    percent: 10,
    assetKey: ASSET_NOT_MEDICINE,
  },
  bad_video_7: {
    label: "БАД — 7 %: ТВ и видео",
    percent: 7,
    assetKey: ASSET_NOT_MEDICINE,
  },
  finance_credit_5: {
    label: "Финансы: кредит или заём — 10 %",
    percent: 10,
    assetKey: ASSET_CREDIT,
  },
  finance_custom_10: {
    label: "Финансы: банкротство — 10 %",
    percent: 10,
    assetKey: ASSET_BANKRUPTCY,
  },
  energy_7: {
    label: "Энергетические напитки — 7 %",
    percent: 7,
    assetKey: ASSET_NOT_MEDICINE,
  },
  custom: {
    label: "Свой процент",
    percent: null,
    assetKey: ASSET_MEDICINE,
  },
};

export function getTargetPercent(
  presetKey: string,
  customPercent: number | null
): number | null {
  if (presetKey === "custom") {
    if (
      customPercent === null ||
      !Number.isFinite(customPercent) ||
      customPercent <= 0 ||
      customPercent > 100
    ) {
      return null;
    }
    return customPercent;
  }

  const preset = DISCLAIMER_PRESETS[presetKey];
  return preset && preset.percent !== null ? preset.percent : null;
}

export function getPresetAndAsset(presetKey: string): {
  preset: DisclaimerPreset;
  asset: DisclaimerAsset;
} | null {
  const preset = DISCLAIMER_PRESETS[presetKey];
  if (!preset) return null;

  const asset = DISCLAIMER_ASSETS[preset.assetKey];
  if (!asset) return null;

  return { preset, asset };
}

export function getPrimaryPresetEntriesByAsset(): PresetAssetEntry[] {
  const seenAssetKeys: Record<string, boolean> = {};
  const entries: PresetAssetEntry[] = [];

  for (const presetKey of Object.keys(DISCLAIMER_PRESETS)) {
    const preset = DISCLAIMER_PRESETS[presetKey];
    if (!preset || preset.percent === null) continue;

    const asset = DISCLAIMER_ASSETS[preset.assetKey];
    if (!asset || seenAssetKeys[asset.key]) continue;

    seenAssetKeys[asset.key] = true;
    entries.push({ presetKey, preset, asset });
  }

  return entries;
}
