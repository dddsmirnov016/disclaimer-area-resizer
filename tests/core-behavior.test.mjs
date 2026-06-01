import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

function modulePath(relativePath) {
  return JSON.stringify(path.join(process.cwd(), relativePath));
}

async function bundleAndImport(source) {
  const { build } = await import("esbuild");
  const tempRoot = await mkdtemp(path.join(tmpdir(), "disclaimer-core-"));
  const entryFile = path.join(tempRoot, "entry.ts");
  const outputFile = path.join(tempRoot, "entry.mjs");

  await writeFile(entryFile, source, "utf8");
  await build({
    entryPoints: [entryFile],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: outputFile,
    absWorkingDir: process.cwd(),
    logLevel: "silent",
  });

  return import(pathToFileURL(outputFile).href);
}

test("geometry helpers preserve target area for width-based disclaimer frames", async () => {
  const mod = await bundleAndImport(`
    import { calcAreaWithWidth } from ${modulePath("src/core/geometry.ts")};
    export const value = calcAreaWithWidth(660, 82, 7, 200);
  `);

  assert.equal(mod.value.newWidth, 200);
  assert.equal(Math.round(mod.value.newHeight * 1000) / 1000, 18.942);
});

test("image overlay geometry is centered on media bounds and pinned to the bottom", async () => {
  const mod = await bundleAndImport(`
    import { calcImageOverlayFrame } from ${modulePath("src/core/geometry.ts")};
    export const value = calcImageOverlayFrame(660, 82, 7, {
      x: 440,
      y: 0,
      width: 220,
      height: 82,
    });
  `);

  assert.equal(mod.value.width, 204);
  assert.equal(mod.value.x, 448);
  assert.equal(Math.round(mod.value.y * 1000) / 1000, 61.429);
});

test("preset helpers return one primary create-all entry per unique SVG asset", async () => {
  const mod = await bundleAndImport(`
    import { getPrimaryPresetEntriesByAsset } from ${modulePath("src/core/presets.ts")};
    export const entries = getPrimaryPresetEntriesByAsset().map((entry) => ({
      presetKey: entry.presetKey,
      assetKey: entry.asset.key,
      percent: entry.preset.percent,
    }));
  `);

  assert.deepEqual(
    mod.entries.map((entry) => entry.presetKey),
    [
      "medicine_video_7",
      "bad_static_10",
      "finance_credit_5",
      "finance_custom_10",
    ]
  );
  assert.equal(new Set(mod.entries.map((entry) => entry.assetKey)).size, 4);
});

test("figma disclaimer helpers resize generated SVGs with resize instead of resizeWithoutConstraints", async () => {
  const source = await readFile("src/figma/disclaimerNodes.ts", "utf8");
  const helper = source.match(/function resizeSvgNodeToFrame[\s\S]*?\n}\n/);

  assert.ok(helper, "expected resizeSvgNodeToFrame helper");
  assert.match(helper[0], /\.resize\(/);
  assert.doesNotMatch(helper[0], /resizeWithoutConstraints/);
});

test("create-all variants remove known disclaimers before inserting new ones", async () => {
  const source = await readFile("src/features/createAllVariants.ts", "utf8");

  assert.match(source, /removeKnownDisclaimers/);
  assert.match(source, /addTarget === "image"/);
  assert.match(source, /addDisclaimerToImage/);
  assert.match(source, /addDisclaimerToBody/);
});
