import type { AddTarget } from "../core/types";
import { getPrimaryPresetEntriesByAsset } from "../core/presets";
import { removeKnownDisclaimers } from "../figma/disclaimerNodes";
import { setAbsolutePositioningIfParentHasAutoLayout } from "../figma/layout";
import { canInsertChildren, type BannerFrame } from "../figma/nodeGuards";
import { addDisclaimerToBody, addDisclaimerToImage } from "./addMissing";

export const DUPLICATE_VARIANT_GAP = 32;

export function cloneBannerFrame(bannerFrame: BannerFrame): BannerFrame {
  return bannerFrame.clone();
}

export function createAllDisclaimerVariants(params: {
  bannerFrame: BannerFrame;
  addTarget: AddTarget;
}): { nodes: BannerFrame[]; count: number } {
  const { bannerFrame, addTarget } = params;
  const parent = bannerFrame.parent;

  if (!canInsertChildren(parent)) {
    throw new Error("Не удалось найти родителя баннера для дублирования");
  }

  const entries = getPrimaryPresetEntriesByAsset();

  if (entries.length === 0) {
    throw new Error("Не найдено SVG-ассетов для создания вариантов");
  }

  const createdNodes: BannerFrame[] = [];

  try {
    entries.forEach((entry, index) => {
      const duplicate = cloneBannerFrame(bannerFrame);
      createdNodes.push(duplicate);

      if (duplicate.parent !== parent) {
        parent.appendChild(duplicate);
      }

      duplicate.name = `${bannerFrame.name} — ${entry.asset.label}`;
      setAbsolutePositioningIfParentHasAutoLayout(duplicate, parent);
      duplicate.x =
        bannerFrame.x +
        (bannerFrame.width + DUPLICATE_VARIANT_GAP) * (index + 1);
      duplicate.y = bannerFrame.y;
      removeKnownDisclaimers(duplicate);

      const targetPercent = entry.preset.percent;
      if (targetPercent === null) {
        throw new Error(`У пресета "${entry.preset.label}" нет процента`);
      }

      if (addTarget === "image") {
        addDisclaimerToImage({
          bannerFrame: duplicate,
          asset: entry.asset,
          presetKey: entry.presetKey,
          targetPercent,
        });
      } else {
        addDisclaimerToBody({
          bannerFrame: duplicate,
          asset: entry.asset,
          presetKey: entry.presetKey,
          targetPercent,
        });
      }
    });
  } catch (err) {
    for (const node of createdNodes) {
      node.remove();
    }
    throw err;
  }

  return { nodes: createdNodes, count: createdNodes.length };
}
