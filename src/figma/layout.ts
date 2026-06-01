import type { ResizeDirection } from "../core/types";
import type { AutoLayoutFrame } from "./nodeGuards";

export function getAutoLayoutPadding(node: AutoLayoutFrame): {
  left: number;
  right: number;
  bottom: number;
} {
  return {
    left: Math.max(0, node.paddingLeft || 0),
    right: Math.max(0, node.paddingRight || 0),
    bottom: Math.max(0, node.paddingBottom || 0),
  };
}

export function setLayoutSizingFixed(
  node: SceneNode,
  direction: ResizeDirection
): void {
  if ("layoutSizingVertical" in node && "layoutSizingHorizontal" in node) {
    type AutoLayoutChild = SceneNode & {
      layoutSizingVertical: "FIXED" | "HUG" | "FILL";
      layoutSizingHorizontal: "FIXED" | "HUG" | "FILL";
    };
    const lNode = node as AutoLayoutChild;
    if (
      (direction === "height" || direction === "proportional") &&
      lNode.layoutSizingVertical === "HUG"
    ) {
      lNode.layoutSizingVertical = "FIXED";
    }
    if (
      (direction === "width" || direction === "proportional") &&
      lNode.layoutSizingHorizontal === "HUG"
    ) {
      lNode.layoutSizingHorizontal = "FIXED";
    }
  }
}

export function setLayoutPositioning(
  node: SceneNode,
  value: "AUTO" | "ABSOLUTE"
): void {
  if ("layoutPositioning" in node) {
    (node as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning = value;
  }
}

export function setAbsolutePositioningIfParentHasAutoLayout(
  node: SceneNode,
  parent: BaseNode
): void {
  if (
    "layoutPositioning" in node &&
    (parent.type === "FRAME" ||
      parent.type === "COMPONENT" ||
      parent.type === "INSTANCE") &&
    (parent as FrameNode).layoutMode !== "NONE"
  ) {
    (node as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning = "ABSOLUTE";
  }
}

export function copyLayoutChildSettings(
  source: SceneNode,
  target: SceneNode
): void {
  if ("layoutSizingVertical" in source && "layoutSizingVertical" in target) {
    (
      target as SceneNode & { layoutSizingVertical: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingVertical = (
      source as SceneNode & { layoutSizingVertical: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingVertical;
  }

  if ("layoutSizingHorizontal" in source && "layoutSizingHorizontal" in target) {
    (
      target as SceneNode & { layoutSizingHorizontal: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingHorizontal = (
      source as SceneNode & { layoutSizingHorizontal: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingHorizontal;
  }

  if ("layoutGrow" in source && "layoutGrow" in target) {
    (target as SceneNode & { layoutGrow: number }).layoutGrow = (
      source as SceneNode & { layoutGrow: number }
    ).layoutGrow;
  }

  if ("layoutAlign" in source && "layoutAlign" in target) {
    type AutoLayoutAlign = "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT";
    (target as SceneNode & { layoutAlign: AutoLayoutAlign }).layoutAlign = (
      source as SceneNode & { layoutAlign: AutoLayoutAlign }
    ).layoutAlign;
  }

  if ("layoutPositioning" in source && "layoutPositioning" in target) {
    (target as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning = (
      source as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" }
    ).layoutPositioning;
  }

  if ("constraints" in source && "constraints" in target) {
    (target as SceneNode & { constraints: Constraints }).constraints = (
      source as SceneNode & { constraints: Constraints }
    ).constraints;
  }
}

export function shouldPreserveManualPosition(
  parent: BaseNode,
  child: SceneNode
): boolean {
  const parentHasAutoLayout =
    (parent.type === "FRAME" ||
      parent.type === "COMPONENT" ||
      parent.type === "INSTANCE") &&
    (parent as FrameNode).layoutMode !== "NONE";
  const childIsAutoLayoutChild =
    "layoutPositioning" in child &&
    (child as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning === "AUTO";

  return !parentHasAutoLayout || !childIsAutoLayoutChild;
}
