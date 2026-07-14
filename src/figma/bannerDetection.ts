import type { Bounds } from "../core/types";
import { buildBannerIndex, type BannerIndex } from "./bannerIndex";
import {
  isFrameLike,
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

export function findBodyContainer(
  bannerFrame: BannerFrame,
  index?: BannerIndex
): AutoLayoutFrame | null {
  return (index ?? buildBannerIndex(bannerFrame)).bodyContainer;
}

export function findMainImageNode(
  bannerFrame: BannerFrame,
  index?: BannerIndex
): { node: ResizableNode; bounds: Bounds } | null {
  return (index ?? buildBannerIndex(bannerFrame)).mainImage;
}
