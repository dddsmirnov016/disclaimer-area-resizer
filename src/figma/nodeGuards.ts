export type BannerFrame = FrameNode | ComponentNode | InstanceNode;
export type AutoLayoutFrame = BannerFrame;
export type ResizableNode = SceneNode & {
  width: number;
  height: number;
  resize?: (w: number, h: number) => void;
  resizeWithoutConstraints?: (w: number, h: number) => void;
};
export type NodeWithSize = SceneNode & { width: number; height: number };
export type NodeWithChildren = BaseNode & { children: readonly SceneNode[] };
export type NodeWithMutableChildren = NodeWithChildren & {
  appendChild: (child: SceneNode) => void;
  insertChild: (index: number, child: SceneNode) => void;
};

export function isResizable(node: SceneNode): node is ResizableNode {
  return (
    "width" in node &&
    "height" in node &&
    (("resize" in node &&
      typeof (node as unknown as { resize: unknown }).resize === "function") ||
      ("resizeWithoutConstraints" in node &&
        typeof (node as unknown as { resizeWithoutConstraints: unknown })
          .resizeWithoutConstraints === "function"))
  );
}

export function isFrameLike(node: SceneNode): node is BannerFrame {
  return (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  );
}

export function hasChildren(node: BaseNode): node is NodeWithChildren {
  return "children" in node;
}

export function canInsertChildren(
  node: BaseNode | null
): node is NodeWithMutableChildren {
  return Boolean(node && "children" in node && "insertChild" in node);
}

export function isLocked(node: SceneNode): boolean {
  return node.locked === true;
}

export function hasNonZeroSize(node: NodeWithSize): boolean {
  return node.width > 0 && node.height > 0;
}

/**
 * Whether the node still belongs to the document. A stale selection reference
 * can point at a node the user already deleted; mutating it would throw a raw
 * Figma error instead of a friendly message.
 */
export function isAttached(node: SceneNode): boolean {
  return !node.removed;
}

/**
 * Whether the node lives inside a component instance. Instance internals
 * cannot be resized or re-parented, so features must refuse them upfront
 * with a clear message instead of surfacing a raw Figma override error.
 */
export function isInsideInstance(node: SceneNode): boolean {
  let current: BaseNode | null = node.parent;

  while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if (current.type === "INSTANCE") {
      return true;
    }
    current = current.parent;
  }

  return false;
}
