# Agent Guide

This repository contains the Figma plugin **Disclaimer Area Resizer**. The plugin resizes existing disclaimer layers, adds missing SVG disclaimers (auto-picking the best-fitting proportion for the target area), and can duplicate a selected banner into variants for every unique disclaimer asset group.

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
| `copy/ru.yml` | User-facing UI copy (labels, buttons, errors); edit by hand. |
| `src/generatedCopy.ts` | Generated copy module; never edit by hand. |

Each source folder has a local `README.md` with responsibilities and safe-change rules. Read the relevant folder doc before editing that area.

`src/main.ts` is only a compatibility shim for older references. Production builds bundle `src/plugin.ts`.

## Build Pipeline

`npm run build` runs `scripts/build-plugin.mjs`, which:

1. regenerates `src/generatedDisclaimerAssets.ts` from `svg/`;
2. regenerates `src/generatedCopy.ts` and injects `window.UI_COPY` into `src/ui.html` from `copy/ru.yml`;
3. runs TypeScript type checking with `tsc -p tsconfig.json`;
4. bundles `src/plugin.ts` to `dist/main.js` with `esbuild`.

`npm run watch` runs the same build script in watch mode for TypeScript imports. If SVG files change, run `npm run build` to regenerate the asset module.

Commit `dist/main.js` after any runtime logic change. Commit `src/generatedDisclaimerAssets.ts` after any SVG or asset generator change. Commit `src/generatedCopy.ts` and the injected `src/ui.html` copy block after any `copy/ru.yml` change.

## Editing UI Copy

User-visible strings (panel labels, button text, validation and success/error messages) live in [`copy/ru.yml`](../copy/ru.yml).

To change copy:

1. Edit `copy/ru.yml` (or ask an LLM to edit that file).
2. Run `npm run build` (or `npm run generate:copy` alone).
3. Restart the plugin in Figma.

Do not edit `src/generatedCopy.ts` or the `window.UI_COPY` block inside `src/ui.html` by hand. Runtime code reads strings through `src/core/copy.ts` (`getCopy`, `formatCopy`).

Template placeholders use `{name}` syntax, for example `{width}`, `{height}`, `{presetLabel}`.

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

Each preset maps to an **asset group**, not a single SVG. A group ships several SVG variants with different width:height ratios (filenames `<prefix>-<width>-<height>.svg`); the plugin picks the variant whose ratio is closest to the target area at resize/creation time (`pickBestAssetVariant` in `src/core/presets.ts`), so wide horizontal formats get a single-line variant and narrow/square formats get a more compact, multi-line variant. This keeps the embedded disclaimer text from being stretched.

Current mapping:

| Preset | Label (UI) | Asset group | SVG variants (`svg/<prefix>-*.svg`) |
| --- | --- | --- | --- |
| `medicine_video_7` | Медицина | "Есть противопоказания..." | `med-197-72`, `med-267-81`, `med-571-81`, `med-1000-56` |
| `bad_static_10` | БАД | "Не является лекарством" | `bad-193-47`, `bad-260-57`, `bad-572-28`, `bad-1000-28` |
| `finance_credit_5` | Кредит или заём | "Изучите все условия кредита..." | `credit-198-68`, `credit-265-69`, `credit-575-66`, `credit-1000-45` |
| `finance_custom_10` | Банкротство | "Банкротство влечёт..." | `bancrupt-197-95`, `bancrupt-266-76`, `bancrupt-578-69`, `bancrupt-1000-34` |

Each group now ships four ratio variants: three regular formats plus one ultra-wide variant (`<prefix>-1000-*`) that keeps the disclaimer text readable inside very wide horizontal areas.

Adding a new proportion variant to an existing group only requires dropping another `<prefix>-<width>-<height>.svg` file into `svg/` and running `npm run build`; no code changes are needed as long as the filename keeps the group's prefix.

## Behavior Notes

- Existing disclaimer selection: resize that layer to the selected preset area.
- Existing disclaimer selection also auto-selects the dropdown to the best-guess preset (`detectPresetKeyForDisclaimer` in `src/core/presets.ts`): trusts the stored `presetKey` shared plugin data first, otherwise infers from `assetKey`/layer name. Each asset group now maps to exactly one preset, so no percent-proximity logic is needed. The UI only re-applies the guess when the detected node identity actually changes, so it never clobbers an in-progress manual choice for the same node.
- Banner selection without a matching disclaimer: create the mapped SVG disclaimer, choosing the asset group's variant whose proportions best fit the target area (see "Adding Or Changing Presets And SVG Assets").
- `Поверх картинки` unchecked: insert into the detected body/text auto-layout container.
- `Поверх картинки` checked: place at the bottom of the largest visible image-fill area.
- `Создать все типы` checked: duplicate the original banner to the right and add one disclaimer variant per unique asset group.
- Create-all mode must not mutate the original banner.
- Resizing an existing plugin-generated disclaimer to a very different target area re-picks the best-fitting SVG variant for the new size and swaps it in (`replaceGeneratedDisclaimerNode`), instead of stretching the previously chosen variant.

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
