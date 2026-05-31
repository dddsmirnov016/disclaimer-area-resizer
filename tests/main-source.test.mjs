import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("generated SVG disclaimer resize respects child constraints", async () => {
  const mainSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const helperMatch = mainSource.match(
    /function resizeSvgNodeToFrame[\s\S]*?\n}\n/
  );

  assert.ok(helperMatch, "expected a dedicated SVG resize helper");
  assert.match(helperMatch[0], /\.resize\(/);
  assert.doesNotMatch(helperMatch[0], /resizeWithoutConstraints/);
});

test("image overlay mode targets the largest visible image fill", async () => {
  const mainSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const helperMatch = mainSource.match(/function findMainImageNode[\s\S]*?\n}\n/);

  assert.ok(helperMatch, "expected largest-image detection helper");
  assert.match(helperMatch[0], /hasImageFill/);
  assert.match(helperMatch[0], /isVisibleInHierarchy/);
  assert.match(helperMatch[0], /intersectionArea/);
  assert.doesNotMatch(helperMatch[0], /containsImageFill/);
  assert.doesNotMatch(helperMatch[0], /isLikelyImageName/);
});

test("image overlay mode only sets absolute layout positioning inside auto-layout parents", async () => {
  const mainSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const helperMatch = mainSource.match(
    /function setAbsolutePositioningIfParentHasAutoLayout[\s\S]*?\n}\n/
  );

  assert.ok(helperMatch, "expected guarded absolute-positioning helper");
  assert.match(helperMatch[0], /layoutMode !== "NONE"/);
  assert.match(helperMatch[0], /layoutPositioning = "ABSOLUTE"/);
});

test("banner image overlay mode reuses an existing matching disclaimer", async () => {
  const mainSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const existingBranchMatch = mainSource.match(
    /if \(existingDisclaimer\) \{[\s\S]*?\n        \}/
  );

  assert.ok(existingBranchMatch, "expected existing-disclaimer branch");
  assert.match(existingBranchMatch[0], /msg\.addTarget === "image"/);
  assert.match(existingBranchMatch[0], /placeDisclaimerOverImage/);
});
