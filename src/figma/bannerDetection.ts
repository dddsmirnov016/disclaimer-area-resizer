import type { Bounds } from "../core/types";
import {
  getAbsoluteBounds,
  getIntersectionBounds,
  intersectionArea,
  isVisibleInHierarchy,
  visitDescendants,
} from "./traversal";
import {
  isFrameLike,
  isResizable,
  type AutoLayoutFrame,
  type BannerFrame,
  type ResizableNode,
} from "./nodeGuards";

export function findBannerFrame(node: SceneNode): BannerFrame | null {
  let result: BannerFrame | null = null;
  let current: BaseNode | null = node.parent;

  while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if (
      current.type === "FRAME" ||
      current.type === "COMPONENT" ||
      current.type === "INSTANCE"
    ) {
      const frame = current as BannerFrame;
      if (frame.width > 0 && frame.height > 0) {
        result = frame;
      }
    }
    current = current.parent;
  }

  return result;
}

export function isTopLevelFrame(node: SceneNode): node is BannerFrame {
  return isFrameLike(node) && findBannerFrame(node) === null;
}

export function nodeHasAutoLayout(node: SceneNode): boolean {
  let current: BaseNode = node;
  while (current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if (
      (current.type === "FRAME" ||
        current.type === "COMPONENT" ||
        current.type === "INSTANCE") &&
      (current as FrameNode).layoutMode !== "NONE"
    ) {
      return true;
    }
    if (!current.parent) break;
    current = current.parent;
  }
  return false;
}

function countTextDescendants(node: BaseNode): number {
  let count = 0;
  visitDescendants(node, (child) => {
    if (child.type === "TEXT") count += 1;
  });
  return count;
}

function normalizedName(node: BaseNode): string {
  return node.name.toLowerCase();
}

function isLikelyBodyName(node: BaseNode): boolean {
  return /body|copy|text|content|текст|контент|описание|оффер/.test(
    normalizedName(node)
  );
}

function hasImageFill(node: SceneNode): boolean {
  if (!("fills" in node)) return false;
  const fills = (node as { fills: readonly Paint[] | PluginAPI["mixed"] })
    .fills;
  return Array.isArray(fills) && fills.some((paint) => paint.type === "IMAGE");
}

export function findBodyContainer(
  bannerFrame: BannerFrame
): AutoLayoutFrame | null {
  let bestNode: AutoLayoutFrame | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const consider = (node: SceneNode): void => {
    if (!isFrameLike(node) || node.layoutMode !== "VERTICAL") return;

    const textCount = countTextDescendants(node);
    if (textCount === 0) return;

    const areaRatio =
      bannerFrame.width > 0 && bannerFrame.height > 0
        ? (node.width * node.height) / (bannerFrame.width * bannerFrame.height)
        : 1;
    const score =
      textCount * 20 +
      (isLikelyBodyName(node) ? 100 : 0) -
      areaRatio * 10 -
      (node === bannerFrame ? 50 : 0);

    if (score > bestScore) {
      bestNode = node;
      bestScore = score;
    }
  };

  consider(bannerFrame);
  visitDescendants(bannerFrame, consider);

  return bestNode;
}

export function findMainImageNode(
  bannerFrame: BannerFrame
): { node: ResizableNode; bounds: Bounds } | null {
  let best: { node: ResizableNode; bounds: Bounds } | null = null;
  let bestArea = 0;
  const bannerBounds = getAbsoluteBounds(bannerFrame);

  const consider = (node: SceneNode): void => {
    if (!isResizable(node)) return;
    if (!hasImageFill(node)) return;
    if (!isVisibleInHierarchy(node, bannerFrame)) return;

    const visibleBounds = getIntersectionBounds(
      getAbsoluteBounds(node),
      bannerBounds
    );
    const area = intersectionArea(visibleBounds);

    if (!visibleBounds || area <= 0) return;

    if (area > bestArea) {
      best = { node, bounds: visibleBounds };
      bestArea = area;
    }
  };

  consider(bannerFrame);
  visitDescendants(bannerFrame, consider);

  return best;
}
