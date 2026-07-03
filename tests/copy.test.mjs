import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { generateCopy } from "../scripts/generate-copy.mjs";
import { loadCopyModule } from "./helpers/copy.mjs";

test("copy generator writes generatedCopy.ts and injects UI_COPY into ui.html", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "copy-generator-"));
  try {
    const copyFile = path.join(tempDir, "ru.yml");
    const outputFile = path.join(tempDir, "src", "generatedCopy.ts");
    const uiFile = path.join(tempDir, "src", "ui.html");
    const sourceCopy = await readFile("copy/ru.yml", "utf8");

    await mkdir(path.dirname(uiFile), { recursive: true });
    await writeFile(copyFile, sourceCopy, "utf8");
    await writeFile(
      uiFile,
      [
        "<!doctype html>",
        "<html>",
        "<head>",
        "<!-- @generated-copy:start -->",
        "<!-- @generated-copy:end -->",
        "</head>",
        "<body></body>",
        "</html>",
        "",
      ].join("\n"),
      "utf8"
    );

    const result = await generateCopy({ copyFile, outputFile, uiFile });
    const generated = await readFile(result.outputFile, "utf8");
    const uiHtml = await readFile(result.uiFile, "utf8");

    assert.equal(result.outputFile, outputFile);
    assert.equal(result.uiFile, uiFile);
    assert.match(generated, /export const COPY = \{/);
    assert.match(generated, /"locale": "ru"/);
    assert.match(uiHtml, /window\.UI_COPY = \{/);
    assert.match(uiHtml, /<!-- @generated-copy:start -->/);
    assert.match(uiHtml, /<!-- @generated-copy:end -->/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("getCopy and formatCopy resolve YAML strings and templates", async () => {
  const { getCopy, formatCopy, pluralizeVariantWord } = await loadCopyModule();
  const applied = getCopy("plugin.actions.applied");

  assert.equal(getCopy("ui.buttons.apply"), "Применить");
  assert.equal(
    formatCopy("plugin.messages.resizeResult", {
      action: applied,
      width: "200",
      height: "19",
      percent: "7\u00a0%",
    }),
    `${applied}: 200×19\u00a0px — 7\u00a0% площади баннера`
  );
  assert.equal(pluralizeVariantWord(1), "вариант");
  assert.equal(pluralizeVariantWord(3), "варианта");
  assert.equal(pluralizeVariantWord(11), "вариантов");
});

test("required copy keys exist for UI and plugin flows", async () => {
  const { COPY } = await loadCopyModule();

  assert.equal(typeof COPY.ui.title, "string");
  assert.equal(typeof COPY.ui.buttons.applying, "string");
  assert.equal(typeof COPY.plugin.errors.bannerDisclaimerDetection, "string");
  assert.equal(typeof COPY.presets.medicine_video_7, "string");
});
