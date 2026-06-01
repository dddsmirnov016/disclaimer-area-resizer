export type BannerFrame = FrameNode | ComponentNode | InstanceNode;
export type AutoLayoutFrame = BannerFrame;
export type ResizableNode = SceneNode & {
  width: number;
  height: number;
  resizeWithoutConstraints: (w: number, h: number) => void;
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
    "resizeWithoutConstraints" in node &&
    typeof (node as unknown as { resizeWithoutConstraints: unknown })
      .resizeWithoutConstraints === "function"
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
