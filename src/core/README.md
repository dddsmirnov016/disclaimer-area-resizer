# Core Modules

## Responsibilities

`core/` contains pure TypeScript domain logic with no dependency on the Figma plugin runtime.

- `types.ts` defines shared domain interfaces and wire-facing type aliases.
- `geometry.ts` calculates target disclaimer dimensions, area percentages, and image-overlay frames.
- `presets.ts` owns legal disclaimer presets, the mapping from preset keys to disclaimer asset groups, and `pickBestAssetVariant`, which picks the SVG variant of a group whose width:height ratio best fits a target area.

## Safe-change rules

- Keep these modules free of `figma`, `SceneNode`, and DOM globals.
- Add tests in `tests/core-behavior.test.mjs` and `tests/presets.test.mjs` before changing geometry, preset ordering, or variant selection.
- Preserve preset keys because the UI sends them over `postMessage`.
- Preserve asset group keys (the `ASSET_*` constants) because shared plugin data and node names use them as stable identifiers; the concrete SVG variant within a group is chosen dynamically and is not a stable identifier.
- SVG variants within a group must share the group's filename prefix (`svg/<prefix>-<width>-<height>.svg`); `pickBestAssetVariant` discovers them by prefix, not by an explicit list.
