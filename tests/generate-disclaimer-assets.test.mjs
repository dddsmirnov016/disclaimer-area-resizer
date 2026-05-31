import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildAssetModule,
  normalizeSvgPaint,
  readSvgAssets,
} from "../scripts/generate-disclaimer-assets.mjs";

test("readSvgAssets reads SVG metadata from a source directory", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "disclaimer-assets-"));
  const svgDir = path.join(tempRoot, "svg");

  try {
    await mkdir(svgDir);
    await writeFile(
      path.join(svgDir, "Sample disclaimer.svg"),
      '<svg width="210" height="12" viewBox="0 0 210 12" xmlns="http://www.w3.org/2000/svg"><path d="M0 0H210V12H0Z"/></svg>',
      "utf8"
    );

    const assets = await readSvgAssets(svgDir);

    assert.equal(assets.length, 1);
    assert.deepEqual(
      {
        key: assets[0].key,
        label: assets[0].label,
        filename: assets[0].filename,
        width: assets[0].width,
        height: assets[0].height,
      },
      {
        key: "Sample disclaimer",
        label: "Sample disclaimer",
        filename: "Sample disclaimer.svg",
        width: 210,
        height: 12,
      }
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("normalizeSvgPaint converts white disclaimer fills to 30 percent black", () => {
  const svg =
    '<svg width="20" height="4"><path fill="white" d="M0 0H10V4H0Z"/><path style="fill:#FFFFFF;fill-opacity:1;" d="M10 0H20V4H10Z"/></svg>';

  const normalized = normalizeSvgPaint(svg);

  assert.doesNotMatch(normalized, /fill=["']white["']/i);
  assert.doesNotMatch(normalized, /fill:\s*#fff(?:fff)?/i);
  assert.doesNotMatch(normalized, /fill-opacity:\s*1/i);
  assert.match(normalized, /fill="black"/);
  assert.match(normalized, /fill-opacity="0\.3"|fill-opacity:\s*0\.3/i);
});

test("buildAssetModule emits a typed TypeScript asset registry", async () => {
  const moduleText = buildAssetModule([
    {
      key: "Sample disclaimer",
      label: "Sample disclaimer",
      filename: "Sample disclaimer.svg",
      svg: '<svg width="10" height="2"><text>Quote "ok"</text></svg>',
      width: 10,
      height: 2,
    },
  ]);

  assert.match(moduleText, /interface DisclaimerAsset/);
  assert.match(moduleText, /const DISCLAIMER_ASSETS/);
  assert.doesNotMatch(moduleText, /export\s+/);
  assert.match(moduleText, /"Sample disclaimer"/);
  assert.match(moduleText, /Quote \\"ok\\"/);

  const outputFile = path.join(
    await mkdtemp(path.join(tmpdir(), "disclaimer-module-")),
    "generatedDisclaimerAssets.ts"
  );

  await writeFile(outputFile, moduleText, "utf8");
  const written = await readFile(outputFile, "utf8");
  assert.equal(written, moduleText);
});
