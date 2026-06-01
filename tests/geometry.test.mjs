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

test("calcNewDimensions preserves target area for each direction", () => {
  const banner = { w: 660, h: 82, pct: 7 };
  const target = (banner.w * banner.h * banner.pct) / 100;

  const byHeight = geom.calcNewDimensions(200, 20, banner.w, banner.h, 7, "height");
  assert.equal(byHeight.newWidth, 200);
  assert.ok(Math.abs(area(byHeight) - target) < 1e-6);

  const byWidth = geom.calcNewDimensions(200, 20, banner.w, banner.h, 7, "width");
  assert.equal(byWidth.newHeight, 20);
  assert.ok(Math.abs(area(byWidth) - target) < 1e-6);

  const proportional = geom.calcNewDimensions(200, 20, banner.w, banner.h, 7, "proportional");
  assert.ok(Math.abs(area(proportional) - target) < 1e-6);
  // proportional keeps the aspect ratio
  assert.ok(Math.abs(proportional.newWidth / proportional.newHeight - 200 / 20) < 1e-9);
});

test("calcNewDimensions clamps zero/negative targets to the minimum dimension", () => {
  const zero = geom.calcNewDimensions(200, 20, 660, 82, 0, "height");
  assert.equal(zero.newHeight, MIN_DIMENSION);

  const negative = geom.calcNewDimensions(200, 20, 660, 82, -50, "height");
  assert.equal(negative.newHeight, MIN_DIMENSION);

  const negativeWidth = geom.calcNewDimensions(200, 20, 660, 82, -50, "width");
  assert.equal(negativeWidth.newWidth, MIN_DIMENSION);
});

test("calcNewDimensions propagates non-finite inputs without throwing", () => {
  const nan = geom.calcNewDimensions(200, 20, 660, 82, Number.NaN, "height");
  assert.ok(Number.isNaN(nan.newHeight));

  const infinite = geom.calcNewDimensions(200, 20, 660, 82, Infinity, "height");
  assert.equal(infinite.newHeight, Infinity);

  // division by zero selected size yields a non-finite size, not a throw
  const zeroSel = geom.calcNewDimensions(0, 20, 660, 82, 7, "height");
  assert.equal(zeroSel.newHeight, Infinity);
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
