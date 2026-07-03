import { round2 } from "../core/geometry";
import { formatCopy, getCopy } from "../core/copy";
import { DISCLAIMER_PRESETS, detectPresetKeyForDisclaimer } from "../core/presets";
import {
  findBannerFrame,
  isTopLevelFrame,
  nodeHasAutoLayout,
} from "../figma/bannerDetection";
import {
  bannerHasDisclaimerCandidates,
  findContainingDisclaimerForSelection,
  findDetectedDisclaimerForBannerSelection,
  isProbableBannerSelectionFrame,
  PLUGIN_DATA_ASSET_KEY,
  PLUGIN_DATA_NAMESPACE,
  PLUGIN_DATA_PRESET_KEY,
} from "../figma/disclaimerNodes";
import { isFrameLike, isResizable } from "../figma/nodeGuards";
import type { BannerFrame, ResizableNode } from "../figma/nodeGuards";
import type { PluginState } from "../ui/messages";

export const BANNER_DISCLAIMER_DETECTION_ERROR = getCopy(
  "plugin.errors.bannerDisclaimerDetection"
);

function buildDetectionInfoState(): PluginState {
  return {
    type: "invalid",
    error: BANNER_DISCLAIMER_DETECTION_ERROR,
    feedbackTone: "info",
    presets: DISCLAIMER_PRESETS,
  };
}

function buildAddMissingState(bannerFrame: BannerFrame): PluginState {
  return {
    type: "ready",
    info: {
      mode: "add-missing",
      disclaimerName: null,
      disclaimerWidth: null,
      disclaimerHeight: null,
      bannerName: bannerFrame.name,
      bannerWidth: round2(bannerFrame.width),
      bannerHeight: round2(bannerFrame.height),
      currentPercent: null,
      detectedPresetKey: null,
      isText: false,
      hasAutoLayout: nodeHasAutoLayout(bannerFrame),
    },
    presets: DISCLAIMER_PRESETS,
  };
}

/**
 * For a frame the user selected as a banner, decide between offering to add a
 * disclaimer (none present) and asking to pick one manually (present but
 * ambiguous / not auto-resolvable).
 */
function buildBannerWithoutResolvedDisclaimerState(
  bannerFrame: BannerFrame
): PluginState {
  return bannerHasDisclaimerCandidates(bannerFrame)
    ? buildDetectionInfoState()
    : buildAddMissingState(bannerFrame);
}

function buildResizeState(
  disclaimerNode: ResizableNode,
  bannerFrame: BannerFrame
): PluginState {
  const disclaimerArea = disclaimerNode.width * disclaimerNode.height;
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const currentPercent = round2((disclaimerArea / bannerArea) * 100);

  const detectedPresetKey = detectPresetKeyForDisclaimer({
    storedPresetKey: disclaimerNode.getSharedPluginData(
      PLUGIN_DATA_NAMESPACE,
      PLUGIN_DATA_PRESET_KEY
    ),
    storedAssetKey: disclaimerNode.getSharedPluginData(
      PLUGIN_DATA_NAMESPACE,
      PLUGIN_DATA_ASSET_KEY
    ),
    nodeName: disclaimerNode.name,
    currentPercent,
  });

  return {
    type: "ready",
    info: {
      mode: "resize-existing",
      disclaimerName: disclaimerNode.name,
      disclaimerWidth: round2(disclaimerNode.width),
      disclaimerHeight: round2(disclaimerNode.height),
      bannerName: bannerFrame.name,
      bannerWidth: round2(bannerFrame.width),
      bannerHeight: round2(bannerFrame.height),
      currentPercent,
      detectedPresetKey,
      isText: disclaimerNode.type === "TEXT",
      hasAutoLayout: nodeHasAutoLayout(disclaimerNode),
    },
    presets: DISCLAIMER_PRESETS,
  };
}

export function buildState(selection: readonly SceneNode[]): PluginState {
  if (selection.length !== 1) {
    return {
      type: selection.length === 0 ? "no-selection" : "invalid",
      error:
        selection.length === 0
          ? getCopy("plugin.errors.selectOneLayer")
          : getCopy("plugin.errors.selectOnlyOneLayer"),
      presets: DISCLAIMER_PRESETS,
    };
  }

  const sceneNode = selection[0];

  if (isTopLevelFrame(sceneNode)) {
    if (sceneNode.locked) {
      return {
        type: "invalid",
        error: getCopy("plugin.errors.bannerLocked"),
        presets: DISCLAIMER_PRESETS,
      };
    }

    if (sceneNode.width <= 0 || sceneNode.height <= 0) {
      return {
        type: "invalid",
        error: formatCopy("plugin.errors.bannerSizeZero", {
          width: sceneNode.width,
          height: sceneNode.height,
        }),
        presets: DISCLAIMER_PRESETS,
      };
    }

    const detectedDisclaimer = findDetectedDisclaimerForBannerSelection(
      sceneNode,
      null
    );

    if (!detectedDisclaimer) {
      return buildBannerWithoutResolvedDisclaimerState(sceneNode);
    }

    return buildResizeState(detectedDisclaimer, sceneNode);
  }

  if (!isResizable(sceneNode)) {
    return {
      type: "invalid",
      error: getCopy("plugin.errors.layerNotResizable"),
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.locked) {
    return {
      type: "invalid",
      error: getCopy("plugin.errors.layerLocked"),
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.width <= 0 || sceneNode.height <= 0) {
    return {
      type: "invalid",
      error: formatCopy("plugin.errors.disclaimerSizeZero", {
        width: sceneNode.width,
        height: sceneNode.height,
      }),
      presets: DISCLAIMER_PRESETS,
    };
  }

  const containingBannerFrame = isFrameLike(sceneNode)
    ? findBannerFrame(sceneNode)
    : null;

  if (isFrameLike(sceneNode)) {
    const detectedDisclaimer = findDetectedDisclaimerForBannerSelection(
      sceneNode,
      containingBannerFrame
    );

    if (detectedDisclaimer) {
      const bannerFrame = containingBannerFrame || sceneNode;
      if (bannerFrame.width <= 0 || bannerFrame.height <= 0) {
        return {
          type: "invalid",
          error: formatCopy("plugin.errors.bannerSizeZero", {
            width: bannerFrame.width,
            height: bannerFrame.height,
          }),
          presets: DISCLAIMER_PRESETS,
        };
      }
      return buildResizeState(detectedDisclaimer, bannerFrame);
    }

    if (isProbableBannerSelectionFrame(sceneNode, containingBannerFrame)) {
      return buildBannerWithoutResolvedDisclaimerState(sceneNode);
    }
  }

  const bannerFrame = containingBannerFrame || findBannerFrame(sceneNode);

  if (bannerFrame) {
    const containingDisclaimer = findContainingDisclaimerForSelection(
      sceneNode,
      bannerFrame
    );

    if (containingDisclaimer) {
      return buildResizeState(containingDisclaimer, bannerFrame);
    }
  }

  if (!bannerFrame) {
    return {
      type: "invalid",
      error: getCopy("plugin.errors.selectDisclaimerOrBanner"),
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (bannerFrame.width <= 0 || bannerFrame.height <= 0) {
    return {
      type: "invalid",
      error: formatCopy("plugin.errors.bannerSizeZero", {
        width: bannerFrame.width,
        height: bannerFrame.height,
      }),
      presets: DISCLAIMER_PRESETS,
    };
  }

  return buildResizeState(sceneNode, bannerFrame);
}
