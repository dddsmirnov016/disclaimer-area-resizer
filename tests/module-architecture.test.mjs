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
    "src/core/copy.ts",
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

test("generated copy module exports typed copy for bundled modules", async () => {
  const generated = await readFile("src/generatedCopy.ts", "utf8");
  const yaml = await readFile("copy/ru.yml", "utf8");

  assert.match(generated, /export const COPY = \{/);
  assert.match(generated, /export type CopyTree/);
  assert.match(yaml, /ui:/);
  assert.match(yaml, /plugin:/);
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
  assert.match(slotRule[0], /min-height:\s*80px/);
  assert.match(uiHtml, /\.info-box/);
  assert.match(uiHtml, /id="infoMsg"/);
  assert.match(uiHtml, /function showInfo/);
  assert.match(uiHtml, /feedbackTone === 'info'/);
});

test("visible Russian copy avoids technical wording", async () => {
  const visibleCopySources = [
    "copy/ru.yml",
    "src/ui.html",
  ];
  const forbiddenFragments = [
    "disclaimer-слой",
    "не поддерживает resize",
    "(locked)",
    "SVG-ассет",
    "выбранного пресета",
    "У пресета",
    "Не удалось применить изменения:",
    "This property cannot",
    "cannot be overridden",
    "set_constraints",
  ];

  for (const file of visibleCopySources) {
    const source = await readFile(file, "utf8");
    for (const fragment of forbiddenFragments) {
      assert.ok(
        !source.includes(fragment),
        `${file} should not expose "${fragment}"`
      );
    }
  }
});

test("new generated disclaimer layers use Russian naming", async () => {
  const source = await readFile("src/figma/disclaimerNodes.ts", "utf8");

  assert.match(source, /node\.name = "Дисклеймер — " \+ assetGroupKey/);
  assert.match(source, /node\.name\.startsWith\("Disclaimer — "\)/);
});
