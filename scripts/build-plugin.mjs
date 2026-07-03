import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
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
const OUT_FILE = path.join(DIST_DIR, "main.js");
const isWatch = process.argv.includes("--watch");

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

function getBuildOptions() {
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

async function buildOnce() {
  await generateDisclaimerAssets();
  await generateCopy();
  await typeCheck();
  await mkdir(DIST_DIR, { recursive: true });
  await esbuild.build(getBuildOptions());
}

if (isWatch) {
  await generateDisclaimerAssets();
  await generateCopy();
  await typeCheck();
  await mkdir(DIST_DIR, { recursive: true });
  const context = await esbuild.context(getBuildOptions());
  await context.watch();
  console.log("Watching src/plugin.ts and imported modules...");
} else {
  await buildOnce();
}
