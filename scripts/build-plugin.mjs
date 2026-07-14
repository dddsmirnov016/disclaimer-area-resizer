import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import * as esbuild from "esbuild";

import { generateCopy } from "./generate-copy.mjs";
import { generateDisclaimerAssets } from "./generate-disclaimer-assets.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const ENTRY_FILE = path.join(ROOT_DIR, "src", "plugin.ts");
const UI_ENTRY_FILE = path.join(ROOT_DIR, "src", "ui", "app.ts");
const UI_HTML_FILE = path.join(ROOT_DIR, "src", "ui.html");
const OUT_FILE = path.join(DIST_DIR, "main.js");
const isWatch = process.argv.includes("--watch");

const UI_SCRIPT_START_MARKER = "<!-- @generated-ui-script:start -->";
const UI_SCRIPT_END_MARKER = "<!-- @generated-ui-script:end -->";

async function typeCheck() {
  const tscBin = path.join(
    ROOT_DIR,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc"
  );

  await execFileAsync(tscBin, ["-p", "tsconfig.json"], {
    cwd: ROOT_DIR,
    maxBuffer: 1024 * 1024 * 8,
  });
}

function getPluginBuildOptions() {
  return {
    entryPoints: [ENTRY_FILE],
    outfile: OUT_FILE,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2017",
    legalComments: "none",
    logLevel: "info",
  };
}

function getUiBuildOptions() {
  return {
    entryPoints: [UI_ENTRY_FILE],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2017",
    legalComments: "none",
    logLevel: "silent",
  };
}

async function injectUiScript(scriptSource) {
  const html = await readFile(UI_HTML_FILE, "utf8");
  const startIndex = html.indexOf(UI_SCRIPT_START_MARKER);
  const endIndex = html.indexOf(UI_SCRIPT_END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(
      `Missing UI script markers in ${path.relative(ROOT_DIR, UI_HTML_FILE)}. ` +
        `Expected ${UI_SCRIPT_START_MARKER} and ${UI_SCRIPT_END_MARKER}.`
    );
  }

  const scriptBlock = `<script>\n${scriptSource}\n</script>`;
  const before = html.slice(0, startIndex + UI_SCRIPT_START_MARKER.length);
  const after = html.slice(endIndex);
  const nextHtml = `${before}\n${scriptBlock}\n${after}`;

  if (nextHtml !== html) {
    await writeFile(UI_HTML_FILE, nextHtml, "utf8");
  }
}

async function buildUiScript() {
  const result = await esbuild.build({
    ...getUiBuildOptions(),
    write: false,
  });
  const scriptSource = result.outputFiles[0]?.text;

  if (!scriptSource) {
    throw new Error("UI bundle produced no output");
  }

  await injectUiScript(scriptSource);
}

async function buildOnce() {
  await generateDisclaimerAssets();
  await generateCopy();
  await typeCheck();
  await mkdir(DIST_DIR, { recursive: true });
  await buildUiScript();
  await esbuild.build(getPluginBuildOptions());
}

if (isWatch) {
  await generateDisclaimerAssets();
  await generateCopy();
  await typeCheck();
  await mkdir(DIST_DIR, { recursive: true });
  await buildUiScript();
  const context = await esbuild.context(getPluginBuildOptions());
  await context.watch();
  console.log("Watching src/plugin.ts and imported modules...");
} else {
  await buildOnce();
}
