# Core Modules

## Responsibilities

`core/` contains pure TypeScript domain logic with no dependency on the Figma plugin runtime.

- `types.ts` defines shared domain interfaces and wire-facing type aliases.
- `geometry.ts` calculates target disclaimer dimensions, area percentages, and image-overlay frames.
- `presets.ts` owns legal disclaimer presets and the mapping from preset keys to generated SVG assets.

## Safe-change rules

- Keep these modules free of `figma`, `SceneNode`, and DOM globals.
- Add tests in `tests/core-behavior.test.mjs` before changing geometry or preset ordering.
- Preserve preset keys because the UI sends them over `postMessage`.
- Preserve asset keys because generated SVG records and shared plugin data use them as stable identifiers.
