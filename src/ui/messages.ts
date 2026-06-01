import type {
  AddTarget,
  DisclaimerPreset,
  ResizeDirection,
  SelectionMode,
} from "../core/types";

export type {
  AddTarget,
  DisclaimerAsset,
  DisclaimerPreset,
  PresetAssetEntry,
  ResizeDirection,
  SelectionMode,
} from "../core/types";

export interface SelectionInfo {
  mode: SelectionMode;
  disclaimerName: string | null;
  disclaimerWidth: number | null;
  disclaimerHeight: number | null;
  bannerName: string;
  bannerWidth: number;
  bannerHeight: number;
  currentPercent: number | null;
  isText: boolean;
  hasAutoLayout: boolean;
}

export interface PluginState {
  type: "no-selection" | "invalid" | "ready";
  error?: string;
  feedbackTone?: "error" | "info";
  info?: SelectionInfo;
  presets: Record<string, DisclaimerPreset>;
}

export interface ApplyResizeMessage {
  type: "apply-resize";
  presetKey: string;
  customPercent: number | null;
  direction: ResizeDirection;
  onlyEnlarge: boolean;
  addTarget: AddTarget;
  createAll: boolean;
}

export interface RequestStateMessage {
  type: "request-state";
}

export interface ResizeMessage {
  type: "resize";
  width: number;
  height: number;
}

export type UiMessage = ApplyResizeMessage | RequestStateMessage | ResizeMessage;
