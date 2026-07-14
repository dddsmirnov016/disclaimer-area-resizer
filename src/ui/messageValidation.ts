import type {
  AddTarget,
  ApplyResizeMessage,
  PluginMessage,
  ResizeMessage,
  UiMessage,
} from "./messages";

const ADD_TARGETS: readonly AddTarget[] = ["body", "image"];
const UI_MESSAGE_TYPES = ["apply-resize", "request-state", "resize"] as const;
const PLUGIN_MESSAGE_TYPES = [
  "no-selection",
  "invalid",
  "ready",
  "success",
  "error",
] as const;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isFiniteNumber(input: unknown): input is number {
  return typeof input === "number" && Number.isFinite(input);
}

function asBoolean(input: unknown, fallback: boolean): boolean {
  return typeof input === "boolean" ? input : fallback;
}

function asAddTarget(input: unknown): AddTarget {
  return ADD_TARGETS.includes(input as AddTarget)
    ? (input as AddTarget)
    : "body";
}

function parseApplyResize(
  input: Record<string, unknown>
): ApplyResizeMessage | null {
  if (typeof input.presetKey !== "string") return null;

  return {
    type: "apply-resize",
    presetKey: input.presetKey,
    addTarget: asAddTarget(input.addTarget),
    createAll: asBoolean(input.createAll, false),
    expectedNodeId:
      typeof input.expectedNodeId === "string" ? input.expectedNodeId : null,
  };
}

function parseResize(input: Record<string, unknown>): ResizeMessage | null {
  if (!isFiniteNumber(input.width) || !isFiniteNumber(input.height)) {
    return null;
  }
  if (input.width <= 0 || input.height <= 0) return null;

  return { type: "resize", width: input.width, height: input.height };
}

/**
 * Strictly validate and normalize an inbound message from the UI iframe.
 * Returns a typed {@link UiMessage} or `null` for anything unknown or
 * malformed. Extra/unknown fields are ignored (forward compatible); missing
 * optional fields fall back to safe defaults (backward compatible).
 */
export function parseUiMessage(input: unknown): UiMessage | null {
  if (!isRecord(input)) return null;

  switch (input.type) {
    case "request-state":
      return { type: "request-state" };
    case "resize":
      return parseResize(input);
    case "apply-resize":
      return parseApplyResize(input);
    default:
      return null;
  }
}

export function isUiMessage(input: unknown): input is UiMessage {
  return parseUiMessage(input) !== null;
}

export function isUiMessageType(value: unknown): value is UiMessage["type"] {
  return (
    typeof value === "string" &&
    (UI_MESSAGE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Validate an outbound message from the plugin sandbox to the UI. Used by
 * contract tests to guarantee the sandbox never posts a shape the UI cannot
 * render.
 */
export function isPluginMessage(input: unknown): input is PluginMessage {
  if (!isRecord(input)) return false;

  switch (input.type) {
    case "success":
    case "error":
      return typeof input.message === "string";
    case "no-selection":
    case "invalid":
    case "ready":
      return isRecord(input.presets);
    default:
      return false;
  }
}

export function isPluginMessageType(value: unknown): value is PluginMessage["type"] {
  return (
    typeof value === "string" &&
    (PLUGIN_MESSAGE_TYPES as readonly string[]).includes(value)
  );
}
