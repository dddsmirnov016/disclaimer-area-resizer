# Feature Modules

## Responsibilities

`features/` contains user-visible workflows.

- `resizeExisting.ts` resizes an existing disclaimer layer to the requested target area.
- `addMissing.ts` creates a missing SVG disclaimer in the body area or over the primary image.
- `createAllVariants.ts` duplicates the selected banner and creates one variant per unique SVG asset.

## Safe-change rules

- Keep feature modules small orchestration layers; put reusable Figma API details in `figma/`.
- Preserve Russian UI-facing error messages unless the user asks for copy changes.
- Do not mutate the original banner in create-all mode; only duplicate banners should receive new disclaimers.
- Roll back partially created nodes when a multi-step operation throws.
- Add regression tests before changing insertion, resize, or duplicate behavior.
