import type { Bounds } from "./types";

export const IMAGE_OVERLAY_HORIZONTAL_INSET = 8;
export const IMAGE_OVERLAY_BOTTOM_INSET = 2;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Keep the node's current width and stretch its height so its area becomes
 * `targetPercent` of the banner area. This is the only resize strategy the
 * plugin uses for existing disclaimers.
 */
export function calcHeightForTargetArea(
  width: number,
  bannerW: number,
  bannerH: number,
  targetPercent: number
): { newWidth: number; newHeight: number } {
  const targetArea = (bannerW * bannerH * targetPercent) / 100;
  const newHeight = Math.max(0.01, targetArea / width);
  return { newWidth: width, newHeight };
}

export function calcAreaWithWidth(
  bannerW: number,
  bannerH: number,
  targetPercent: number,
  width: number
): { newWidth: number; newHeight: number } {
  const targetArea = (bannerW * bannerH * targetPercent) / 100;
  const newWidth = Math.max(0.01, width);
  const newHeight = Math.max(0.01, targetArea / newWidth);
  return { newWidth, newHeight };
}

export function calcImageOverlayFrame(
  bannerW: number,
  bannerH: number,
  targetPercent: number,
  mediaBounds: Bounds
): Bounds {
  const horizontalInset = Math.min(
    IMAGE_OVERLAY_HORIZONTAL_INSET,
    Math.max(0, (mediaBounds.width - 0.01) / 2)
  );
  const bottomInset = Math.min(
    IMAGE_OVERLAY_BOTTOM_INSET,
    Math.max(0, mediaBounds.height)
  );
  const { newWidth, newHeight } = calcAreaWithWidth(
    bannerW,
    bannerH,
    targetPercent,
    mediaBounds.width - horizontalInset * 2
  );

  return {
    x: mediaBounds.x + (mediaBounds.width - newWidth) / 2,
    y: mediaBounds.y + mediaBounds.height - bottomInset - newHeight,
    width: newWidth,
    height: newHeight,
  };
}

export function calcActualPercent(
  nodeArea: number,
  bannerW: number,
  bannerH: number
): number {
  return round2((nodeArea / (bannerW * bannerH)) * 100);
}
