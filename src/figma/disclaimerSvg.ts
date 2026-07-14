import { getCopy } from "../core/copy";
import type { ResizableNode } from "./nodeGuards";
import { visitDescendants } from "./traversal";

/**
 * Make a generated SVG node stretchable: clip overflow and switch every
 * descendant to SCALE constraints so a root resize deforms the artwork
 * uniformly instead of leaving children pinned to their original positions.
 */
export function prepareSvgNodeForDeformation(node: SceneNode): void {
  if ("clipsContent" in node) {
    try {
      (node as SceneNode & { clipsContent: boolean }).clipsContent = true;
    } catch {
      // Existing SVGs can contain read-only descendants; root resize is still useful.
    }
  }

  visitDescendants(node, (child) => {
    if ("constraints" in child) {
      try {
        (child as SceneNode & { constraints: Constraints }).constraints = {
          horizontal: "SCALE",
          vertical: "SCALE",
        };
      } catch {
        // Keep best-effort preparation from blocking editable root layers.
      }
    }
  });
}

export function resizeSvgNodeToFrame(
  node: ResizableNode,
  width: number,
  height: number
): void {
  prepareSvgNodeForDeformation(node);

  if (!("resize" in node) || typeof node.resize !== "function") {
    throw new Error(getCopy("plugin.errors.disclaimerChangeFailed"));
  }

  (node as ResizableNode & { resize: (w: number, h: number) => void }).resize(
    width,
    height
  );
}
