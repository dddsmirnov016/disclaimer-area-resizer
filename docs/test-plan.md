# Test Plan — Disclaimer Area Resizer

This document is the result of a read-only audit of the plugin and defines the
testing strategy that is implemented under `tests/`.

## 1. Stack audit

| Concern | Finding |
| --- | --- |
| Package manager | **npm** (`package-lock.json` present, no yarn/pnpm/bun lockfile) |
| Language | **TypeScript** (`strict: true`), source in `src/**/*.ts` |
| Bundler | **esbuild** (`scripts/build-plugin.mjs`, IIFE bundle to `dist/main.js`) |
| Type checker | `tsc -p tsconfig.json` (`noEmit`), run inside the build script |
| UI framework | **Vanilla** HTML + inline IIFE script in `src/ui.html` (no React/Vue/Svelte) |
| Test runner | **`node --test`** (Node built-in), tests in `tests/*.test.mjs` |
| DOM testing | **jsdom** (added as devDependency for UI behavior tests) |
| Figma typings | `@figma/plugin-typings` |
| Node version | 24.x locally; CI pins 20.x + 22.x |

### Figma plugin structure

| Part | File |
| --- | --- |
| Manifest | `manifest.json` (`main: dist/main.js`, `ui: src/ui.html`, `documentAccess: dynamic-page`, `networkAccess.allowedDomains: ["none"]`) |
| Plugin/main entry (sandbox) | `src/plugin.ts` |
| UI iframe entry | `src/ui.html` |
| Shared message types | `src/ui/messages.ts` |
| Runtime message validation | `src/ui/messageValidation.ts` (added) |
| Pure domain logic | `src/core/` (geometry, presets, types) |
| Figma API helpers | `src/figma/` (guards, traversal, layout, banner/disclaimer detection) |
| User workflows | `src/features/` (resize existing, add missing, create all variants) |
| Selection→UI state | `src/state/selectionState.ts` |
| Generated assets | `src/generatedDisclaimerAssets.ts` (do not hand-edit) |

## 2. Existing npm scripts / commands

- `npm run build` — generate assets → `tsc` typecheck → esbuild bundle.
- `npm test` — `node --test` over `tests/`.
- `npm run watch` — esbuild watch.
- `npm run generate:assets` — regenerate the SVG asset module.
- No ESLint/Prettier config is present (no lint setup to wire into CI).

## 3. Critical user scenarios

The plugin has **two** entry behaviors driven entirely by the current selection
plus a single `apply-resize` action from the UI.

**User input (UI):**

- Preset dropdown (`presetKey`) — 4 fixed presets: БАД (10%), Медицина (7%), Кредит или заём (10%), Банкротство (10%).
- `Поверх изображения` checkbox → `addTarget: "image" | "body"`.
- `Создать все варианты` checkbox → `createAll`.
- Apply button → posts `apply-resize`.

**Figma selection data used:**

- `figma.currentPage.selection` (0 / 1 / many nodes).
- Node `type`, `name`, `width`, `height`, `x/y`, `locked`, `visible`,
  `children`, `fills`, `layoutMode`, `absoluteTransform`/`absoluteBoundingBox`,
  shared plugin data (`disclaimerAreaResizer:assetKey|presetKey`).
- Ancestors to find the banner frame; descendants to find disclaimers/body/image.

**Messages UI ↔ plugin-core:**

- UI → core: `request-state`, `resize`, `apply-resize`.
- core → UI: state (`no-selection` | `invalid` | `ready`), `success`, `error`.

**Side effects (sandbox only):**

- Create SVG nodes (`figma.createNodeFromSvg`), resize/move nodes.
- Set/read shared plugin data; set selection; `figma.notify`.
- Clone the banner for "create all variants".
- No network, no `clientStorage`, no `closePlugin` in current code.

## 4. Test levels implemented

| Level | File | Runtime |
| --- | --- | --- |
| Pure unit — geometry | `tests/geometry.test.mjs` | none |
| Pure unit — presets | `tests/presets.test.mjs` | none |
| Message contract / validation | `tests/message-contract.test.mjs` | none |
| Figma adapter + selection state | `tests/figma-adapter.test.mjs` | fake `figma` |
| UI ↔ core integration (bus) | `tests/integration-bridge.test.mjs` | fake `figma` + bundled `plugin.ts` |
| UI behavior | `tests/ui-behavior.test.mjs` | jsdom on real `src/ui.html` |
| Existing behavior + architecture | `tests/core-behavior.test.mjs`, `tests/module-architecture.test.mjs`, `tests/generate-disclaimer-assets.test.mjs` | mixed |

## 5. What is automated vs manual

- **Automated:** pure logic, selection→state, message contract, the real
  `plugin.ts` message handler driven through a fake Figma sandbox, and the real
  `ui.html` driven in jsdom (form fill, validation, button/feedback states,
  keyboard, resilience to unknown responses).
- **Manual:** anything that requires the real Figma renderer (auto-layout
  reflow, SVG import fidelity, undo/redo, Desktop vs Web). Covered by
  `docs/manual-qa-checklist.md`.

## 6. Edge / negative cases targeted

Empty/`null`/`undefined` inputs, boundary percents (`0`, `0.01`, `100`,
`100.01`), `NaN`/`Infinity`/negative numbers, zero/negative node sizes, very
long strings, unicode/emoji/Cyrillic, unknown preset keys, unknown/malformed
message types, missing/wrong-typed/extra message fields, empty/single/multiple
selection, unsupported/locked node, missing banner, Figma API throwing,
double-submit and stale responses, and "no side effects before validation".

## 7. Tooling rationale

- **`node --test`** is kept as the single runner — it is already in use, zero
  added weight, deterministic and fast.
- **jsdom** is the one added devDependency: the UI is plain HTML/JS, so jsdom
  lets us exercise the *real* `ui.html` as the user sees it without a browser.
- **Playwright is intentionally not added.** A Figma plugin UI cannot run a
  meaningful end-to-end flow outside the Figma host, and a headless-browser
  download is heavy for what jsdom already covers deterministically. Real
  in-Figma verification is handled by the manual QA checklist.
