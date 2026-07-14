# UI Module

## Responsibilities

`ui/` contains the typed UI iframe code and message contracts shared with the plugin sandbox.

- `messages.ts` defines inbound/outbound message shapes and the plugin state payload.
- `messageValidation.ts` validates and normalizes messages at the plugin boundary.
- `app.ts` is the UI runtime: dropdown, metrics, feedback, and `postMessage` bridge. It is bundled into `src/ui.html` at build time.
- `src/ui.html` holds markup, styles, generated `window.UI_COPY`, and the injected UI script block.

User-visible strings are **not** edited in this folder. They live in [`copy/ru.yml`](../../copy/ru.yml) and are injected into `src/ui.html` as `window.UI_COPY` at build time.

## Safe-change rules

- Keep message `type` string literals stable unless both `src/ui/app.ts` and `src/plugin.ts` are updated together.
- Do not add network access or external scripts to the UI bundle.
- Preserve the fixed feedback slot so the action button does not jump when errors appear.
- Add a state/message test before changing wire payloads.
- To change labels, buttons, or fallback copy, edit `copy/ru.yml` and run `npm run build`. Static labels in HTML use `data-copy="…"` paths relative to `UI_COPY.ui`.
- Reuse number formatting from `src/core/format.ts`; do not duplicate locale helpers in the UI.
