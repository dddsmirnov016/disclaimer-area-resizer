import type { Bounds, ResizeDirection } from "./types";

export const IMAGE_OVERLAY_HORIZONTAL_INSET = 8;
export const IMAGE_OVERLAY_BOTTOM_INSET = 2;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcNewDimensions(
  selW: number,
  selH: number,
  bannerW: number,
  bannerH: number,
  targetPercent: number,
  direction: ResizeDirection
): { newWidth: number; newHeight: number } {
  const bannerArea = bannerW * bannerH;
  const targetArea = (bannerArea * targetPercent) / 100;
  const minDimension = 0.01;

  if (direction === "height") {
    const newHeight = Math.max(minDimension, targetArea / selW);
    return { newWidth: selW, newHeight };
  }

  if (direction === "width") {
    const newWidth = Math.max(minDimension, targetArea / selH);
    return { newWidth, newHeight: selH };
  }

  const disclaimerArea = selW * selH;
  const scale = Math.sqrt(targetArea / disclaimerArea);

  return {
    newWidth: Math.max(minDimension, selW * scale),
    newHeight: Math.max(minDimension, selH * scale),
  };
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
