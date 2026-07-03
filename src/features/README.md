# Feature Modules

## Responsibilities

`features/` contains user-visible workflows.

- `resizeExisting.ts` resizes an existing disclaimer layer to the requested target area, swapping in a better-fitting SVG variant when it needs to regenerate a plugin-created disclaimer.
- `addMissing.ts` creates a missing SVG disclaimer in the body area or over the primary image, picking the asset group's variant that best fits the computed target area before creating the node.
- `createAllVariants.ts` duplicates the selected banner and creates one variant per unique disclaimer asset group.

## Safe-change rules

- Keep feature modules small orchestration layers; put reusable Figma API details in `figma/`.
- Preserve Russian UI-facing error messages unless the user asks for copy changes.
- Do not mutate the original banner in create-all mode; only duplicate banners should receive new disclaimers.
- Roll back partially created nodes when a multi-step operation throws.
- Compute the target width/height (and pick the SVG variant via `pickBestAssetVariant`) before calling `createDisclaimerNode`, so validation errors (missing container/image) never leave orphan nodes behind.
- Add regression tests before changing insertion, resize, or duplicate behavior.
