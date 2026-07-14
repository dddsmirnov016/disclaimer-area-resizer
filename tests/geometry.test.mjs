import assert from "node:assert/strict";
import test from "node:test";

import { bundleAndImport, modulePath } from "./helpers/bundle.mjs";

const geom = await bundleAndImport(
  `export * from ${modulePath("src/core/geometry.ts")};`
);

const MIN_DIMENSION = 0.01;

function area(dim) {
  return dim.newWidth * dim.newHeight;
}

test("round2 rounds to two decimals across signs and magnitudes", () => {
  assert.equal(geom.round2(1.234), 1.23);
  assert.equal(geom.round2(7.126), 7.13);
  assert.equal(geom.round2(-3.456), -3.46);
  assert.equal(geom.round2(0), 0);
  assert.equal(geom.round2(99.999), 100);
  assert.equal(geom.round2(123456.781), 123456.78);
});

test("calcHeightForTargetArea preserves width and hits the target banner area", () => {
  const banner = { w: 660, h: 82, pct: 7 };
  const target = (banner.w * banner.h * banner.pct) / 100;

  const result = geom.calcHeightForTargetArea(200, banner.w, banner.h, 7);
  assert.equal(result.newWidth, 200);
  assert.ok(Math.abs(area(result) - target) < 1e-6);
});

test("calcHeightForTargetArea propagates a zero width without throwing", () => {
  const zeroWidth = geom.calcHeightForTargetArea(0, 660, 82, 7);
  assert.equal(zeroWidth.newWidth, 0);
  assert.equal(zeroWidth.newHeight, Infinity);
});

test("calcAreaWithWidth preserves area and clamps non-positive width", () => {
  const ok = geom.calcAreaWithWidth(660, 82, 7, 200);
  assert.equal(ok.newWidth, 200);
  assert.equal(Math.round(ok.newHeight * 1000) / 1000, 18.942);

  const clampedZero = geom.calcAreaWithWidth(660, 82, 7, 0);
  assert.equal(clampedZero.newWidth, MIN_DIMENSION);

  const clampedNegative = geom.calcAreaWithWidth(660, 82, 7, -123);
  assert.equal(clampedNegative.newWidth, MIN_DIMENSION);
});

test("calcImageOverlayFrame centers on media and pins to its bottom", () => {
  const frame = geom.calcImageOverlayFrame(660, 82, 7, {
    x: 440,
    y: 0,
    width: 220,
    height: 82,
  });
  assert.equal(frame.width, 204);
  assert.equal(frame.x, 448);
  assert.equal(Math.round(frame.y * 1000) / 1000, 61.429);
});

test("calcImageOverlayFrame survives media smaller than the insets", () => {
  const tiny = geom.calcImageOverlayFrame(660, 82, 7, {
    x: 0,
    y: 0,
    width: 4,
    height: 2,
  });
  assert.ok(tiny.width >= MIN_DIMENSION);
  assert.ok(tiny.height >= MIN_DIMENSION);
  assert.ok(Number.isFinite(tiny.x));
  assert.ok(Number.isFinite(tiny.y));
});

test("calcActualPercent reports the area share and exposes degenerate banners", () => {
  assert.equal(geom.calcActualPercent(660 * 82 * 0.07, 660, 82), 7);
  assert.equal(geom.calcActualPercent(0, 660, 82), 0);
  assert.ok(!Number.isFinite(geom.calcActualPercent(100, 0, 0)));
});
