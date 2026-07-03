# Manual QA Checklist — Disclaimer Area Resizer

Run this checklist in **Figma Desktop** and **Figma Web** after any runtime or
UI change. The automated suite covers logic and message contracts; this list
covers what only the real Figma renderer can validate.

Build first:

```bash
npm run qa
```

Then in Figma: **Plugins → Development → Import plugin from manifest…** and pick
`manifest.json`. Re-run the plugin after each rebuild.

## A. Install & launch

- [ ] Import the plugin from `manifest.json` without errors.
- [ ] Launch on an **empty file** — UI opens, no console errors, Apply disabled.
- [ ] Launch on a file with **one page**.
- [ ] Launch on a file with **multiple pages**; switch pages while open.

## B. Selection states

- [ ] **Empty selection** → metrics show "—", Apply disabled, prompt to select.
- [ ] **One supported disclaimer layer** inside a banner → metrics fill, current
      share shown, Apply enabled.
- [ ] **Select the banner frame** that contains a detected disclaimer → resizes
      the detected disclaimer.
- [ ] **Banner with no detectable disclaimer** → blue info message
      "Дисклеймер не найден…".
- [ ] **Multiple nodes selected** → "Выделите только один слой."
- [ ] **Unsupported node** (e.g. a connector/slice) → clear "нельзя изменить".
- [ ] **Locked layer / locked banner** → asks to unlock.
- [ ] **Hidden layer** in the tree does not get picked as the disclaimer.

## C. Core actions

- [ ] Preset dropdown shows the 4 active presets: БАД, Медицина, Кредит или
      заём, Банкротство.
- [ ] There is no custom percent input in the current UI.
- [ ] Resize an existing disclaimer to each preset; result matches the reported
      `width×height` and `%` and visually lands at the expected area.
- [ ] **Add to body** (`Поверх изображения` off) → disclaimer lands in the text
      container.
- [ ] **Add over image** (`Поверх изображения` on) → disclaimer pinned to the
      bottom of the largest image/video, centered.
- [ ] **Создать все варианты** → duplicates the banner to the right, one variant
      per unique disclaimer asset; the **original banner is untouched**.

## D. Layout variants

- [ ] Horizontal layout, **image on the left**.
- [ ] Horizontal layout, **image on the right**.
- [ ] Vertical layout, **image on top**.
- [ ] Banner inside an **auto-layout** parent (absolute positioning is applied).
- [ ] Banner inside a **plain frame** (manual x/y preserved).
- [ ] Disclaimer is an **instance / nested component** → friendly message about
      detaching, no crash.

## E. Robustness

- [ ] **Large document** (many frames / large banner) → no freeze, reasonable
      speed.
- [ ] **Undo** after an action restores the previous state cleanly.
- [ ] **Redo** re-applies.
- [ ] **Re-run** the plugin after closing — fresh state, no leftover artifacts.
- [ ] Trigger an error (e.g. resize a read-only instance layer) → friendly
      Russian message, UI not stuck in "Применяем…", document not corrupted.
- [ ] Rapidly double-click Apply → no duplicate/garbled result.

## F. Network / privacy

- [ ] Plugin works fully **offline** (manifest allows no domains; nothing should
      attempt a request).
- [ ] No tokens/secrets/user data appear in the dev console.

## G. Figma Web vs Desktop

- [ ] Repeat sections B–C in **Figma Web**.
- [ ] UI fonts/spacing/scroll look correct in both.
- [ ] UI layout and fonts look correct in both.

## H. Accessibility / keyboard

- [ ] Tab order: preset trigger → checkboxes → Apply.
- [ ] The preset can be changed with the keyboard.
- [ ] Apply can be triggered with Enter/Space when focused.
- [ ] Focus is visible on each control.
- [ ] Error/success/info text is readable (contrast) and not truncated for long
      Russian copy.

## Sign-off

- [ ] Desktop pass: __________  (date / name)
- [ ] Web pass: __________  (date / name)
