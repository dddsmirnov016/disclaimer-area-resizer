import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function walk(dir, predicate, acc) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, predicate, acc);
    } else if (predicate(full)) {
      acc.push(full);
    }
  }
  return acc;
}

async function readAll(extraFiles = []) {
  const files = await walk("src", (f) => f.endsWith(".ts") || f.endsWith(".html"), []);
  for (const file of extraFiles) {
    try {
      await stat(file);
      files.push(file);
    } catch {
      // optional file (e.g. dist not built yet)
    }
  }
  const out = {};
  for (const file of files) out[file] = await readFile(file, "utf8");
  return out;
}

test("source and bundle contain no eval / new Function", async () => {
  const sources = await readAll(["dist/main.js"]);
  for (const [file, content] of Object.entries(sources)) {
    assert.equal(/\beval\s*\(/.test(content), false, `${file} uses eval()`);
    assert.equal(/new\s+Function\s*\(/.test(content), false, `${file} uses new Function`);
  }
});

test("plugin performs no network access (manifest + code)", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  assert.deepEqual(manifest.networkAccess.allowedDomains, ["none"]);

  const sources = await readAll();
  for (const [file, content] of Object.entries(sources)) {
    assert.equal(/\bfetch\s*\(/.test(content), false, `${file} calls fetch`);
    assert.equal(/XMLHttpRequest/.test(content), false, `${file} uses XMLHttpRequest`);
    assert.equal(/new\s+WebSocket/.test(content), false, `${file} opens a WebSocket`);
    assert.equal(/https?:\/\/(?!www\.w3\.org)/.test(content), false, `${file} references an external URL`);
  }
});

test("no stray console logging that could leak data in shipped code", async () => {
  const sources = await readAll();
  for (const [file, content] of Object.entries(sources)) {
    assert.equal(/console\.(log|debug|info)\s*\(/.test(content), false, `${file} logs to console`);
  }
});

test("the UI posts only to its parent and never trusts unvalidated messages blindly", async () => {
  const ui = await readFile("src/ui.html", "utf8");
  // outbound is scoped to the plugin parent
  assert.match(ui, /parent\.postMessage\(/);
  // inbound is read via the pluginMessage envelope and dispatched on a type allowlist
  assert.match(ui, /evt\.data && evt\.data\.pluginMessage/);
  assert.match(ui, /msg\.type === 'no-selection' \|\| msg\.type === 'invalid' \|\| msg\.type === 'ready'/);
});

test("inbound plugin messages are validated before handling", async () => {
  const plugin = await readFile("src/plugin.ts", "utf8");
  assert.match(plugin, /parseUiMessage\(rawMessage\)/);
  assert.match(plugin, /if \(!msg\)/);
});
