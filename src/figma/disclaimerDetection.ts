import { ASSET_GROUP_KEYS } from "../core/presets";
import {
  buildBannerDisclaimerIndex,
  type BannerDisclaimerIndex,
  type BannerIndex,
} from "./bannerIndex";
import {
  isResizable,
  type BannerFrame,
  type ResizableNode,
} from "./nodeGuards";
import {
  PLUGIN_DATA_ASSET_KEY,
  PLUGIN_DATA_NAMESPACE,
} from "./pluginData";
import {
  getAbsoluteBounds,
  getIntersectionBounds,
  intersectionArea,
  visitDescendants,
} from "./traversal";

export {
  PLUGIN_DATA_ASSET_KEY,
  PLUGIN_DATA_NAMESPACE,
  PLUGIN_DATA_PRESET_KEY,
} from "./pluginData";
export type { BannerDisclaimerIndex } from "./bannerIndex";
export { buildBannerDisclaimerIndex } from "./bannerIndex";

const HEURISTIC_DISCLAIMER_NAME_RE =
  /disclaimer|дисклеймер|legal|warning|предупрежд|противопоказан|лекарств|условия кредита|займ|банкротств/i;
const MIN_BANNER_SELECTION_AREA_RATIO = 0.4;
const MIN_PRIMARY_IMAGE_AREA_RATIO = 0.25;

export function hasHeuristicDisclaimerName(node: BaseNode): boolean {
  return HEURISTIC_DISCLAIMER_NAME_RE.test(node.name);
}

export function isMatchingDisclaimer(
  node: SceneNode,
  assetKey: string
): boolean {
  return (
    node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY) ===
      assetKey || node.name.includes(assetKey)
  );
}

export function isPluginGeneratedDisclaimer(
  node: SceneNode,
  assetKey: string
): boolean {
  return (
    node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY) ===
      assetKey || node.name.startsWith("Disclaimer — ")
  );
}

export function isPluginCreatedDisclaimerCandidate(node: SceneNode): boolean {
  return (
    Boolean(
      node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY)
    ) || node.name.startsWith("Disclaimer — ")
  );
}

function getIndex(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): BannerDisclaimerIndex {
  return index || buildBannerDisclaimerIndex(bannerFrame);
}

function getSingleCandidate(
  candidates: readonly ResizableNode[]
): ResizableNode | null {
  return candidates.length === 1 ? candidates[0] : null;
}

function nodeContainsSelection(
  container: SceneNode,
  selectedNode: SceneNode
): boolean {
  let current: BaseNode | null = selectedNode;

  while (current) {
    if (current === container) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function findSingleCandidateContainingSelection(
  selectedNode: SceneNode,
  candidates: readonly ResizableNode[]
): ResizableNode | null {
  return getSingleCandidate(
    candidates.filter(
      (candidate) =>
        nodeContainsSelection(candidate, selectedNode) ||
        nodeContainsSelection(selectedNode, candidate)
    )
  );
}

export function findContainingDisclaimerForSelection(
  selectedNode: SceneNode,
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  const bannerIndex = getIndex(bannerFrame, index);
  const pluginCandidate = findSingleCandidateContainingSelection(
    selectedNode,
    bannerIndex.pluginDisclaimers
  );

  if (pluginCandidate) {
    return pluginCandidate;
  }

  return findSingleCandidateContainingSelection(
    selectedNode,
    bannerIndex.heuristicDisclaimers
  );
}

export function findDetectedDisclaimer(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  const bannerIndex = getIndex(bannerFrame, index);

  if (bannerIndex.pluginDisclaimers.length > 0) {
    return getSingleCandidate(bannerIndex.pluginDisclaimers);
  }

  return getSingleCandidate(bannerIndex.heuristicDisclaimers);
}

export function findPluginCreatedDisclaimer(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  return getSingleCandidate(getIndex(bannerFrame, index).pluginDisclaimers);
}

export function findHeuristicDisclaimer(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  return getSingleCandidate(getIndex(bannerFrame, index).heuristicDisclaimers);
}

/**
 * Whether the banner contains any disclaimer-like node at all (plugin-created
 * or matched by heuristic), regardless of whether a single one can be resolved.
 * Lets callers tell "no disclaimer → offer to add one" apart from "disclaimers
 * exist but are ambiguous → ask to pick manually".
 */
export function bannerHasDisclaimerCandidates(
  bannerFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): boolean {
  const bannerIndex = getIndex(bannerFrame, index);
  return (
    bannerIndex.pluginDisclaimers.length > 0 ||
    bannerIndex.heuristicDisclaimers.length > 0
  );
}

export function isImageLedBannerFrame(
  selectedFrame: BannerFrame,
  index?: BannerDisclaimerIndex
): boolean {
  const selectedFrameIndex = index || buildBannerDisclaimerIndex(selectedFrame);
  if (!("mainImage" in selectedFrameIndex)) return false;

  const mainImage = (selectedFrameIndex as BannerIndex).mainImage;
  if (!mainImage || mainImage.node === selectedFrame) return false;

  const selectedArea = selectedFrame.width * selectedFrame.height;
  if (selectedArea <= 0) return false;

  const imageArea = mainImage.bounds.width * mainImage.bounds.height;
  return imageArea / selectedArea >= MIN_PRIMARY_IMAGE_AREA_RATIO;
}

/**
 * Resolves the frame whose area should be used for an already-detected
 * disclaimer. Native ads can sit inside a larger layout frame, so using the
 * outermost ancestor would make both the created size and displayed percent
 * internally consistent but visibly wrong.
 *
 * The supplied index is built once for the selected frame, or for the fallback
 * banner when the selection is one of its descendants. Its image list is then
 * reused while walking only the disclaimer's ancestor chain, avoiding a full
 * subtree scan for every ancestor.
 */
export function resolveDisclaimerAreaBannerFrame(
  disclaimerNode: SceneNode,
  fallbackBannerFrame: BannerFrame,
  index?: BannerIndex
): BannerFrame {
  const bannerIndex = index || buildBannerDisclaimerIndex(fallbackBannerFrame);
  let current: BaseNode | null = disclaimerNode.parent;

  while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if (
      current.type === "FRAME" ||
      current.type === "COMPONENT" ||
      current.type === "INSTANCE"
    ) {
      const frame = current as BannerFrame;
      const frameArea = frame.width * frame.height;
      const frameBounds = getAbsoluteBounds(frame);
      const hasPrimaryImage =
        frameArea > 0 &&
        bannerIndex.visibleImages.some(
          (image) =>
            image.node !== frame &&
            nodeContainsSelection(frame, image.node) &&
            intersectionArea(
              getIntersectionBounds(image.bounds, frameBounds)
            ) /
              frameArea >=
              MIN_PRIMARY_IMAGE_AREA_RATIO
        );

      if (hasPrimaryImage) {
        return frame;
      }
    }

    if (current === fallbackBannerFrame) {
      break;
    }
    current = current.parent;
  }

  return fallbackBannerFrame;
}

export function isProbableBannerSelectionFrame(
  selectedFrame: BannerFrame,
  containingBannerFrame: BannerFrame | null,
  index?: BannerDisclaimerIndex
): boolean {
  if (isPluginCreatedDisclaimerCandidate(selectedFrame)) {
    return false;
  }

  // A disclaimer-like NAME alone must not disqualify a frame from being a
  // banner. "Создать все варианты" names each duplicate after the asset label
  // (e.g. "Ad Container — Не является лекарством"), which matches the heuristic
  // keyword list. Treat the frame as the disclaimer itself only when it has
  // such a name AND holds no disclaimer inside it.
  if (
    hasHeuristicDisclaimerName(selectedFrame) &&
    !bannerHasDisclaimerCandidates(selectedFrame, index)
  ) {
    return false;
  }

  if (!containingBannerFrame) {
    return true;
  }

  const containingArea = containingBannerFrame.width * containingBannerFrame.height;
  if (containingArea <= 0) return false;

  const selectedArea = selectedFrame.width * selectedFrame.height;
  return (
    selectedArea / containingArea >= MIN_BANNER_SELECTION_AREA_RATIO ||
    isImageLedBannerFrame(selectedFrame, index)
  );
}

export function findDetectedDisclaimerForBannerSelection(
  selectedFrame: BannerFrame,
  containingBannerFrame: BannerFrame | null,
  index?: BannerDisclaimerIndex
): ResizableNode | null {
  const selectedFrameIndex = getIndex(selectedFrame, index);

  if (
    !isProbableBannerSelectionFrame(
      selectedFrame,
      containingBannerFrame,
      selectedFrameIndex
    )
  ) {
    return null;
  }

  return findDetectedDisclaimer(selectedFrame, selectedFrameIndex);
}

export function findMatchingDisclaimer(
  bannerFrame: BannerFrame,
  assetKey: string
): ResizableNode | null {
  let result: ResizableNode | null = null;

  visitDescendants(bannerFrame, (node) => {
    if (!result && isResizable(node) && isMatchingDisclaimer(node, assetKey)) {
      result = node;
    }
  });

  return result;
}

export function isKnownDisclaimerNode(node: SceneNode): boolean {
  if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY)) {
    return true;
  }

  if (node.name.startsWith("Disclaimer — ")) {
    return true;
  }

  return ASSET_GROUP_KEYS.some((assetGroupKey) => node.name.includes(assetGroupKey));
}
