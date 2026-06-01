# Agent Guide

This repository contains the Figma plugin **Disclaimer Area Resizer**. The plugin resizes existing disclaimer layers, adds missing SVG disclaimers, and can duplicate a selected banner into variants for every unique SVG disclaimer asset.

## Repository And Release Workflow

| Item | Value |
| --- | --- |
| Remote | `origin` |
| Default branch | `main` |
| Local owner path | `/Users/dddsmirnov/Documents/Dev/disclaimer-area-resizer` |
| Figma entrypoint | `dist/main.js` |
| Figma UI | `src/ui.html` |

After code changes:

```bash
npm run build
npm test
node --check dist/main.js
git add .
git commit -m "short change summary"
git push origin main
```

Do not force-push, amend unrelated commits, commit secrets, or revert user changes unless the user explicitly asks.

## Source Architecture

`src/plugin.ts` is the bundled plugin entrypoint. It wires Figma events, UI messages, success/error reporting, and delegates all behavior to focused modules.

| Path | Responsibility |
| --- | --- |
| `src/core/` | Pure domain logic: shared types, area geometry, presets, preset-to-SVG mapping. |
| `src/figma/` | Figma Plugin API helpers: guards, traversal, layout, banner detection, disclaimer node operations. |
| `src/features/` | User workflows: resize existing, add missing, create all variants. |
| `src/state/` | Selection-to-UI state serialization. |
| `src/ui/` | TypeScript message contracts for `src/ui.html`. |
| `src/generatedDisclaimerAssets.ts` | Generated SVG registry; never edit by hand. |

Each source folder has a local `README.md` with responsibilities and safe-change rules. Read the relevant folder doc before editing that area.

`src/main.ts` is only a compatibility shim for older references. Production builds bundle `src/plugin.ts`.

## Build Pipeline

`npm run build` runs `scripts/build-plugin.mjs`, which:

1. regenerates `src/generatedDisclaimerAssets.ts` from `svg/`;
2. runs TypeScript type checking with `tsc -p tsconfig.json`;
3. bundles `src/plugin.ts` to `dist/main.js` with `esbuild`.

`npm run watch` runs the same build script in watch mode for TypeScript imports. If SVG files change, run `npm run build` to regenerate the asset module.

Commit `dist/main.js` after any runtime logic change. Commit `src/generatedDisclaimerAssets.ts` after any SVG or asset generator change.

## Figma API Safety Rules

- Keep `manifest.json` pointed at `dist/main.js` and `src/ui.html`.
- Keep `documentAccess: "dynamic-page"` and avoid assumptions about pages that are not currently loaded.
- Guard node capabilities with helpers from `src/figma/nodeGuards.ts` before reading or writing type-specific fields.
- Only set `layoutPositioning = "ABSOLUTE"` through the guarded layout helper.
- Use `figma.createNodeFromSvg` for generated disclaimers and mark them with shared plugin data.
- Preserve shared plugin data namespace and keys: `disclaimerAreaResizer`, `assetKey`, `presetKey`.
- Do not introduce network access; the manifest currently allows no domains.

## Adding Or Changing Presets And SVG Assets

SVG files live in `svg/`. Figma plugins cannot read local files at runtime, so SVGs are embedded at build time.

To add or update an SVG:

1. Add or edit the file in `svg/`.
2. Run `npm run build`.
3. Verify `src/generatedDisclaimerAssets.ts` changed as expected.
4. Map the asset in `src/core/presets.ts` if a preset should use it.

Current mapping:

| Presets | SVG asset |
| --- | --- |
| `medicine_video_7`, `medicine_static_5`, `custom` | `Есть противопоказания...svg` |
| `bad_static_10`, `bad_video_7`, `energy_7` | `Не является лекарством.svg` |
| `finance_credit_5` | `Изучите все условия кредита...svg` |
| `finance_custom_10` | `Банкротство влечёт...svg` |

## Behavior Notes

- Existing disclaimer selection: resize that layer to the selected preset area.
- Banner selection without a matching disclaimer: create the mapped SVG disclaimer.
- `Поверх картинки` unchecked: insert into the detected body/text auto-layout container.
- `Поверх картинки` checked: place at the bottom of the largest visible image-fill area.
- `Создать все типы` checked: duplicate the original banner to the right and add one disclaimer variant per unique SVG asset.
- Create-all mode must not mutate the original banner.

## Testing Expectations

Use TDD for behavior changes. Prefer pure tests for `src/core/` and source-invariant tests for Figma runtime behavior that cannot run outside Figma.

Required checks before commit:

```bash
npm run build
npm test
node --check dist/main.js
git diff --check
```

Manual Figma smoke tests after runtime changes:

- resize an existing disclaimer;
- add a missing body disclaimer;
- add a missing image-overlay disclaimer;
- create all variants from a selected banner;
- test horizontal image-left/image-right and vertical image-top layouts.

## Local Figma Setup

1. Figma Desktop -> **Plugins -> Development -> Import plugin from manifest...**
2. Select `manifest.json` from the repository root.
3. Run **Plugins -> Development -> Disclaimer Area Resizer**.

After changing runtime or UI files, rebuild and restart the plugin in Figma.
