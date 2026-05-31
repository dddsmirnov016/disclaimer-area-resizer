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
