# Figma Runtime Modules

## Responsibilities

`figma/` isolates direct interaction with the Figma Plugin API.

- `nodeGuards.ts` provides capability checks for node operations.
- `traversal.ts` walks node trees and converts absolute/relative geometry.
- `layout.ts` contains auto-layout, constraints, and child sizing helpers.
- `bannerDetection.ts` finds banner frames, body containers, and the primary image area.
- `disclaimerNodes.ts` creates, marks, finds, resizes, replaces, and removes disclaimer nodes.

## Safe-change rules

- Guard Figma node capabilities with `in` checks or type guards before reading or writing properties.
- Keep `layoutPositioning = "ABSOLUTE"` guarded by parent auto-layout checks.
- Do not rename shared plugin data keys without a migration plan.
- Keep generated SVG resizing on `resize(...)`; `resizeWithoutConstraints(...)` does not deform SVG children.
- Prefer helper functions here over direct Figma API access in feature modules.
- `createDisclaimerNode`/`replaceGeneratedDisclaimerNode` take an already-resolved concrete SVG `variant` (from `pickBestAssetVariant` in `core/presets.ts`) plus the `assetGroupKey` used for naming and shared plugin data; they never choose a variant themselves.
- Matching helpers (`isMatchingDisclaimer`, `isPluginGeneratedDisclaimer`, `isKnownDisclaimerNode`) compare against the asset **group** key/label, not a specific SVG variant, so switching between a group's variants never breaks detection.
