# State Module

## Responsibilities

`state/` converts the current Figma selection into the serializable state consumed by the UI.

- `selectionState.ts` classifies the selection as empty, invalid, resize-existing, or add-missing.
- It attaches banner/disclaimer sizes, current area percentage, lock errors, and preset metadata.

## Safe-change rules

- Keep this module side-effect free; it should inspect nodes, not mutate them.
- Preserve the `PluginState` wire shape defined in `src/ui/messages.ts`.
- Update UI behavior and tests together when adding a new selection mode or state field.
- Keep validation errors specific enough for designers to fix the selected layer quickly.
