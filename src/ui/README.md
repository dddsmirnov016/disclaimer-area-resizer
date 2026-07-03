# UI Message Module

## Responsibilities

`ui/` contains TypeScript definitions for messages exchanged between `src/ui.html` and the plugin runtime.

- `messages.ts` defines the UI-to-plugin commands and the plugin state payload.
- `src/ui.html` remains the actual Figma UI document and is not bundled.

User-visible strings are **not** edited in this folder. They live in [`copy/ru.yml`](../../copy/ru.yml) and are injected into `src/ui.html` as `window.UI_COPY` at build time.

## Safe-change rules

- Keep message `type` string literals stable unless both `src/ui.html` and `src/plugin.ts` are updated together.
- Keep the UI file self-contained; no network, external scripts, or runtime bundling.
- Preserve the fixed feedback slot so the action button does not jump when errors appear.
- Add a state/message test before changing wire payloads.
- To change labels, buttons, or fallback copy, edit `copy/ru.yml` and run `npm run build`. Static labels in HTML use `data-copy="…"` paths relative to `UI_COPY.ui`.
