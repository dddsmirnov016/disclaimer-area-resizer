import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MODULE_READMES = [
  "src/core/README.md",
  "src/figma/README.md",
  "src/features/README.md",
  "src/state/README.md",
  "src/ui/README.md",
];

test("build pipeline uses esbuild entrypoint instead of TypeScript outFile", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const tsconfig = JSON.parse(await readFile("tsconfig.json", "utf8"));

  assert.equal(packageJson.scripts.build, "node scripts/build-plugin.mjs");
  assert.equal(packageJson.scripts.watch, "node scripts/build-plugin.mjs --watch");
  assert.ok(packageJson.devDependencies.esbuild);
  assert.equal(tsconfig.compilerOptions.module, "ESNext");
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.outFile, undefined);
});

test("source modules and agent documentation are present", async () => {
  const expectedFiles = [
    "src/plugin.ts",
    "src/core/geometry.ts",
    "src/core/presets.ts",
    "src/core/types.ts",
    "src/figma/nodeGuards.ts",
    "src/figma/traversal.ts",
    "src/figma/layout.ts",
    "src/figma/disclaimerNodes.ts",
    "src/figma/bannerDetection.ts",
    "src/features/resizeExisting.ts",
    "src/features/addMissing.ts",
    "src/features/createAllVariants.ts",
    "src/state/selectionState.ts",
    "src/ui/messages.ts",
    ...MODULE_READMES,
  ];

  for (const file of expectedFiles) {
    const source = await readFile(file, "utf8");
    assert.ok(source.length > 0, `${file} should not be empty`);
  }
});

test("module docs describe responsibilities and safe-change rules in English", async () => {
  for (const file of MODULE_READMES) {
    const source = await readFile(file, "utf8");

    assert.match(source, /Responsibilit(?:y|ies)/);
    assert.match(source, /Safe-change rules/);
  }
});

test("generated asset module exports typed assets for bundled modules", async () => {
  const generated = await readFile("src/generatedDisclaimerAssets.ts", "utf8");

  assert.match(generated, /export interface DisclaimerAsset/);
  assert.match(generated, /export const DISCLAIMER_ASSETS/);
  assert.match(generated, /export const DISCLAIMER_ASSET_LIST/);
});

test("UI renders undetected-disclaimer feedback as fixed-height info message", async () => {
  const uiHtml = await readFile("src/ui.html", "utf8");
  const slotRule = uiHtml.match(/\.feedback-slot\s*\{[\s\S]*?\}/);

  assert.ok(slotRule, "expected feedback slot CSS rule");
  assert.match(slotRule[0], /min-height:\s*152px/);
  assert.match(uiHtml, /\.info-box/);
  assert.match(uiHtml, /id="infoMsg"/);
  assert.match(uiHtml, /function showInfo/);
  assert.match(uiHtml, /feedbackTone === 'info'/);
});
