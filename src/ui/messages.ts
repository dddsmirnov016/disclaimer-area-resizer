import type {
  AddTarget,
  DisclaimerPreset,
  SelectionMode,
} from "../core/types";

export type {
  AddTarget,
  DisclaimerAsset,
  DisclaimerPreset,
  PresetAssetEntry,
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
  /**
   * Best-effort guess of which preset key an already-detected disclaimer
   * matches (by stored plugin data or by name/percent heuristics). `null`
   * when no confident guess is available. Always `null` in `add-missing` mode.
   */
  detectedPresetKey: string | null;
  isText: boolean;
  hasAutoLayout: boolean;
}

export interface PluginState {
  type: "no-selection" | "invalid" | "ready";
  error?: string;
  feedbackTone?: "error" | "info";
  info?: SelectionInfo;
  presets: Record<string, DisclaimerPreset>;
  /**
   * Id of the single selected node this state was computed for (`null` when
   * the selection is empty or multiple). The UI echoes it back on apply so
   * the plugin can refuse to act if the selection changed in between.
   */
  selectionId?: string | null;
}

export interface ApplyResizeMessage {
  type: "apply-resize";
  presetKey: string;
  addTarget: AddTarget;
  createAll: boolean;
  /**
   * `selectionId` from the state the UI rendered when the user clicked Apply.
   * `null` when unknown (older UI builds); the plugin then skips the check.
   */
  expectedNodeId: string | null;
}

export interface RequestStateMessage {
  type: "request-state";
}

export interface ResizeMessage {
  type: "resize";
  width: number;
  height: number;
}

/** Messages the UI iframe sends to the plugin sandbox. */
export type UiMessage = ApplyResizeMessage | RequestStateMessage | ResizeMessage;

export type UiMessageType = UiMessage["type"];

export interface SuccessMessage {
  type: "success";
  message: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type StateMessage = PluginState & {
  type: "no-selection" | "invalid" | "ready";
};

/** Messages the plugin sandbox posts back to the UI iframe. */
export type PluginMessage = StateMessage | SuccessMessage | ErrorMessage;

export type PluginMessageType = PluginMessage["type"];
