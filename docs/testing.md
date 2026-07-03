# Testing Guide

This project ships an automated test suite plus a manual QA checklist for the
parts that can only be verified inside the real Figma renderer.

## Running tests

```bash
npm test            # run every tests/*.test.mjs once
npm run test:watch  # re-run on change
npm run test:ui     # only the jsdom UI behavior tests
npm run test:coverage  # run with Node's built-in coverage reporter
npm run typecheck   # tsc -p tsconfig.json (no emit)
npm run qa          # typecheck + test + build (the local quality gate)
```

The whole suite runs with **one command** (`npm test`) and finishes in well
under a second. No network, no real Figma session, fully deterministic.

## Test levels

| File | What it covers |
| --- | --- |
| `tests/geometry.test.mjs` | Pure math: area/dimension calculations, rounding, boundaries, `NaN`/`Infinity`/negative inputs. |
| `tests/presets.test.mjs` | Preset → percent/asset resolution, unknown keys, asset-group detection. Covers all 4 active presets (БАД/Медицина/Кредит/Банкротство). |
| `tests/message-contract.test.mjs` | Runtime validation of every UI↔core message: each type, unknown types, missing/wrong-typed/extra fields, backward-compatible payloads. |
| `tests/figma-adapter.test.mjs` | Selection → UI state and feature functions against a typed fake Figma layer (empty/single/multi selection, locked/zero-size/unsupported nodes, rollback on failure). |
| `tests/integration-bridge.test.mjs` | The real bundled `plugin.ts` driven through a fake `postMessage` bus end to end (happy path, validation error, Figma API error, double-click, ordering, stale state, ignored junk). |
| `tests/ui-behavior.test.mjs` | The real `src/ui.html` in jsdom: first run, form fill, submit/validation, button/feedback states, keyboard/focus, a11y, resilience to unknown responses. |
| `tests/security.test.mjs` | No `eval`/`new Function`, no network, no stray `console.*`, manifest `networkAccess`, validated inbound messages. |
| `tests/core-behavior.test.mjs` | Pre-existing detailed behavior tests (kept). |
| `tests/module-architecture.test.mjs`, `tests/generate-disclaimer-assets.test.mjs` | Structural / asset-generation invariants. |

## How the Figma mock works

`tests/helpers/fakeFigma.mjs` provides a small, hand-written fake of only the
Figma Plugin API surface the plugin touches:

- `makeFakeNode(overrides)` — a scene node with `width/height/x/y`, `locked`,
  `visible`, `children`, `resize`/`resizeWithoutConstraints`, shared plugin
  data, `appendChild`/`insertChild`/`remove`/`clone`, and computed
  `absoluteTransform`/`absoluteBoundingBox`.
- `makeFakeFigma(options)` — a `figma` global plus a `harness` that records
  posted messages, notifications, created nodes, resize calls and close calls.
- `withFakeFigma(figma, fn)` — installs the fake on `globalThis` for the
  duration of `fn` (feature functions call `figma.createNodeFromSvg`).
- `loadPlugin(figma)` (in `tests/helpers/bundle.mjs`) — bundles the real
  `src/plugin.ts` and re-evaluates it against a fresh fake `figma`, returning a
  driver to send UI messages and fire `selectionchange`.

`tests/helpers/uiHarness.mjs` loads the real `src/ui.html` into jsdom, stubs
`parent.postMessage` to capture outbound messages, and exposes `send()` to
simulate messages coming back from the sandbox.

## The message contract

Shared message types live in `src/ui/messages.ts`
(`UiMessage` = UI→core, `PluginMessage` = core→UI). Inbound messages are
validated at runtime by `src/ui/messageValidation.ts`:

- `parseUiMessage(input)` returns a normalized `UiMessage` or `null`.
- Unknown types and malformed payloads are rejected (the plugin ignores them).
- Missing optional fields fall back to safe defaults (backward compatible);
  extra/unknown fields are ignored (forward compatible).

## Adding new tests

1. Pure logic in `src/core/**` → add a case in `geometry`/`presets` tests
   (import via `bundleAndImport`).
2. Anything touching node objects → build nodes with `makeFakeNode` and call the
   bundled function directly.
3. Anything touching the global `figma` → wrap in `withFakeFigma` or use
   `loadPlugin`.
4. UI behavior → use `mountUi()` and assert on what the user sees
   (text/visibility/enabled), never on internal variables.
5. New message types → extend `messages.ts` + `messageValidation.ts` and add a
   contract test for the happy path **and** the malformed cases.

## Coverage note

`npm run test:coverage` uses Node's built-in coverage. Because source modules
are bundled to temporary files before import (to run TypeScript without an
emit step), the reporter attributes lines to those temp bundles rather than to
`src/**`. Treat the numbers as a smoke signal; the meaningful guarantees are the
explicit assertions per level. No hard coverage threshold is enforced to avoid a
misleading or flaky gate.

## What is automated vs manual

Automated tests cover all logic that can run outside Figma. Anything that
depends on the real renderer (SVG import fidelity, auto-layout reflow,
undo/redo, Desktop vs Web) is verified with `docs/manual-qa-checklist.md`.

## Known limitations

- No true in-Figma E2E (the sandbox + iframe cannot be hosted headlessly in a
  stable way). Playwright was intentionally not added; jsdom covers UI behavior.
- Coverage is not source-mapped (see above).
- `buildState` returns `add-missing` for a banner with no disclaimer,
  `resize-existing` for one detected disclaimer, and a manual-pick info message
  when disclaimers are ambiguous. All three paths are covered by tests.
