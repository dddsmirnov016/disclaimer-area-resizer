import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Absolute path to a source module, JSON-quoted for inlining into a TS entry. */
export function modulePath(relativePath) {
  return JSON.stringify(path.join(process.cwd(), relativePath));
}

/**
 * Bundle an inline TypeScript source string with esbuild and import it as ESM.
 * Mirrors the harness used by the legacy behavior tests so source modules can
 * be exercised in plain Node without a Figma runtime.
 */
export async function bundleAndImport(source) {
  const { build } = await import("esbuild");
  const tempRoot = await mkdtemp(path.join(tmpdir(), "disclaimer-test-"));
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

let cachedPluginUrl = null;

/**
 * Bundle `src/plugin.ts` (the sandbox entry) once and return a file URL that
 * callers can dynamically import after installing a fake `figma` global.
 */
export async function bundlePluginEntry() {
  if (cachedPluginUrl) return cachedPluginUrl;

  const { build } = await import("esbuild");
  const tempRoot = await mkdtemp(path.join(tmpdir(), "disclaimer-plugin-"));
  const outputFile = path.join(tempRoot, `plugin-${Date.now()}.mjs`);

  await build({
    entryPoints: [path.join(process.cwd(), "src/plugin.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: outputFile,
    absWorkingDir: process.cwd(),
    logLevel: "silent",
  });

  cachedPluginUrl = pathToFileURL(outputFile).href;
  return cachedPluginUrl;
}

let pluginLoadCount = 0;

/**
 * Load a fresh instance of the bundled `plugin.ts` against the given fake
 * `figma`. A cache-busting query string forces re-evaluation so each scenario
 * gets clean module state (re-running `showUI`, `sendState`, and re-registering
 * the message handler). Returns the captured message handler so the test can
 * drive UI → core messages.
 */
export async function loadPlugin(figma, html = "<html></html>") {
  const url = await bundlePluginEntry();
  globalThis.figma = figma;
  globalThis.__html__ = html;
  pluginLoadCount += 1;
  await import(`${url}?v=${pluginLoadCount}`);

  return {
    /** Deliver a raw message as if posted from the UI iframe. */
    sendFromUi(message) {
      const handler = figma.__harness.uiHandlers.message;
      if (typeof handler !== "function") {
        throw new Error("plugin did not register a UI message handler");
      }
      handler(message);
    },
    /** Trigger a Figma `selectionchange` event. */
    fireSelectionChange() {
      const handler = figma.__harness.documentHandlers.selectionchange;
      if (typeof handler === "function") handler();
    },
  };
}
