# Figma Runtime Modules

## Responsibilities

`figma/` isolates direct interaction with the Figma Plugin API.

- `nodeGuards.ts` provides capability checks for node operations.
- `pluginData.ts` holds shared plugin-data namespace and key constants.
- `traversal.ts` walks node trees and converts absolute/relative geometry.
- `layout.ts` contains auto-layout, constraints, and child sizing helpers.
- `bannerIndex.ts` builds a single-pass banner index: disclaimer candidates, body container, and visible image areas (including the main image).
- `bannerDetection.ts` finds banner frames and reads body/image targets from the banner index.
- `disclaimerDetection.ts` resolves disclaimer candidates from the banner index and answers selection queries.
- `disclaimerMutation.ts` creates, marks, replaces, and removes disclaimer nodes.
- `disclaimerSvg.ts` prepares and resizes generated SVG disclaimer layers.

## Safe-change rules

- Guard Figma node capabilities with `in` checks or type guards before reading or writing properties.
- Keep `layoutPositioning = "ABSOLUTE"` guarded by parent auto-layout checks.
- Do not rename shared plugin data keys without a migration plan.
- Keep generated SVG resizing on `resize(...)`; `resizeWithoutConstraints(...)` does not deform SVG children.
- Prefer helper functions here over direct Figma API access in feature modules.
- Build `bannerIndex` once per banner per selection refresh and pass it to detection helpers instead of re-walking the subtree.
- `createDisclaimerNode`/`replaceGeneratedDisclaimerNode` take an already-resolved concrete SVG `variant` (from `pickBestAssetVariant` in `core/presets.ts`) plus the `assetGroupKey` used for naming and shared plugin data; they never choose a variant themselves.
- Matching helpers (`isMatchingDisclaimer`, `isPluginGeneratedDisclaimer`, `isKnownDisclaimerNode`) compare against the asset **group** key/label, not a specific SVG variant, so switching between a group's variants never breaks detection.
