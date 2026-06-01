import type { Bounds } from "../core/types";
import { hasChildren, type NodeWithSize } from "./nodeGuards";

export function visitDescendants(
  root: BaseNode,
  visitor: (node: SceneNode) => void
): void {
  if (!hasChildren(root)) return;

  for (const child of root.children) {
    visitor(child);
    visitDescendants(child, visitor);
  }
}

export function isVisibleInHierarchy(node: SceneNode, root: BaseNode): boolean {
  let current: BaseNode | null = node;

  while (current) {
    if ("visible" in current && !(current as SceneNode).visible) {
      return false;
    }
    if (current === root) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

export function getAbsoluteBounds(node: NodeWithSize): Bounds {
  const box = node.absoluteBoundingBox;

  if (box) {
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  }

  return {
    x: node.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2],
    width: node.width,
    height: node.height,
  };
}

export function getIntersectionBounds(a: Bounds, b: Bounds): Bounds | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return null;

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

export function intersectionArea(bounds: Bounds | null): number {
  return bounds ? bounds.width * bounds.height : 0;
}

export function getRelativeBoundsFromAbsolute(
  bounds: Bounds,
  ancestor: NodeWithSize
): Bounds {
  const ancestorBounds = getAbsoluteBounds(ancestor);

  return {
    x: bounds.x - ancestorBounds.x,
    y: bounds.y - ancestorBounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}
