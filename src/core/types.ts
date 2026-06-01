import type { DisclaimerAsset } from "../generatedDisclaimerAssets";

export type { DisclaimerAsset };

export type ResizeDirection = "height" | "width" | "proportional";
export type AddTarget = "body" | "image";
export type SelectionMode = "resize-existing" | "add-missing";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisclaimerPreset {
  label: string;
  percent: number | null;
  assetKey: string;
}

export interface PresetAssetEntry {
  presetKey: string;
  preset: DisclaimerPreset;
  asset: DisclaimerAsset;
}

export interface ResizeOutcome<TNode> {
  node: TNode;
  actualPercent: number;
}
