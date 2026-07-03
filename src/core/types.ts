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
  /** Identifies the disclaimer asset group (e.g. `ASSET_MEDICINE`); the
   * concrete SVG variant within that group is picked at resize/creation time
   * based on the target area's aspect ratio (see `pickBestAssetVariant`). */
  assetKey: string;
}

/** A lightweight reference to an asset group, used where only its identity
 * (for matching/labeling) is needed, not a concrete SVG. */
export interface DisclaimerAssetRef {
  key: string;
  label: string;
}

export interface PresetAssetEntry {
  presetKey: string;
  preset: DisclaimerPreset;
  asset: DisclaimerAssetRef;
}

export interface ResizeOutcome<TNode> {
  node: TNode;
  actualPercent: number;
}
