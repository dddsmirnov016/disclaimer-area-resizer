import assert from "node:assert/strict";
import test from "node:test";

import { buildSamplePresets, loadCopyModule } from "./helpers/copy.mjs";
import {
  mountUi,
  readyAddMissingState,
  readyResizeState,
} from "./helpers/uiHarness.mjs";

let copy;
let presets;

test.before(async () => {
  const mod = await loadCopyModule();
  copy = mod.COPY;
  presets = buildSamplePresets(copy);
});

function isVisible(box) {
  return box.classList.contains("visible");
}

// jsdom objects come from a different realm than the test, so normalize to a
// plain Node-realm object before deep comparison.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("first run only requests state and keeps Apply disabled", async () => {
  const ui = await mountUi();
  assert.deepEqual(plain(ui.outgoing), [{ type: "request-state" }, { type: "resize", width: 384, height: 776 }]);
  assert.equal(ui.elements.applyBtn.disabled, true);
  ui.close();
});

test("no-selection state mutes metrics and disables Apply", async () => {
  const ui = await mountUi();
  ui.send({ type: "no-selection", presets, error: copy.plugin.errors.selectLayer });

  assert.equal(ui.elements.applyBtn.disabled, true);
  assert.equal(ui.elements.applyBtn.textContent, copy.ui.buttons.apply);
  assert.equal(ui.elements.percentVal.textContent, "—");
  ui.close();
});

test("invalid error state shows the error box; info tone shows the info box", async () => {
  const ui = await mountUi();

  ui.send({ type: "invalid", presets, error: copy.plugin.errors.selectLayer });
  assert.equal(isVisible(ui.elements.errorBox), true);
  assert.equal(ui.elements.errorBox.textContent, copy.plugin.errors.selectLayer);
  assert.equal(isVisible(ui.elements.infoMsg), false);

  ui.send({
    type: "invalid",
    presets,
    error: copy.ui.fallbacks.disclaimerNotFound,
    feedbackTone: "info",
  });
  assert.equal(isVisible(ui.elements.infoMsg), true);
  assert.equal(isVisible(ui.elements.errorBox), false);
  ui.close();
});

test("ready resize state fills metrics and enables Apply", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets));

  assert.equal(ui.elements.applyBtn.disabled, false);
  assert.equal(ui.elements.applyBtn.textContent, copy.ui.buttons.apply);
  assert.equal(ui.elements.percentVal.textContent.includes("%"), true);
  const discW = ui.elements.disclaimerVal.querySelector('[data-part="w"]').textContent;
  assert.equal(discW, "200");
  ui.close();
});

test("add-missing state relabels Apply and toggles to Создать with create-all", async () => {
  const ui = await mountUi();
  ui.send(readyAddMissingState(presets));

  assert.equal(ui.elements.applyBtn.textContent, copy.ui.buttons.add);
  assert.equal(ui.elements.addToImageInput.disabled, false);
  assert.equal(ui.elements.createAllInput.disabled, false);

  ui.elements.createAllInput.checked = true;
  ui.elements.createAllInput.dispatchEvent(new ui.window.Event("change"));
  assert.equal(ui.elements.applyBtn.textContent, copy.ui.buttons.create);
  ui.close();
});

test("resize-existing state disables the add-target checkboxes", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets));

  assert.equal(ui.elements.addToImageInput.disabled, true);
  assert.equal(ui.elements.createAllInput.disabled, true);
  ui.close();
});

test("submitting a ready add-missing form posts a well-formed apply-resize", async () => {
  const ui = await mountUi();
  ui.send(readyAddMissingState(presets));

  ui.elements.presetSelect.value = "medicine_video_7";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));
  ui.elements.addToImageInput.checked = true;
  ui.elements.applyBtn.click();

  const msg = ui.outgoingOfType("apply-resize").at(-1);
  assert.deepEqual(plain(msg), {
    type: "apply-resize",
    presetKey: "medicine_video_7",
    customPercent: null,
    direction: "height",
    onlyEnlarge: false,
    addTarget: "image",
    createAll: false,
  });
  // button enters a loading state
  assert.equal(ui.elements.applyBtn.disabled, true);
  assert.equal(ui.elements.applyBtn.textContent, copy.ui.buttons.applying);
  ui.close();
});

test("success response re-enables Apply and shows the success box", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets));
  ui.elements.applyBtn.click();

  ui.send({ type: "success", message: "Применено: 200×18,94 px — 7 % площади баннера" });

  assert.equal(isVisible(ui.elements.successMsg), true);
  assert.equal(ui.elements.applyBtn.disabled, false);
  ui.close();
});

test("error response re-enables Apply and shows the error box", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets));
  ui.elements.applyBtn.click();

  ui.send({ type: "error", message: "Слой заблокирован." });

  assert.equal(isVisible(ui.elements.errorBox), true);
  assert.equal(ui.elements.applyBtn.disabled, false);
  ui.close();
});

test("UI ignores an unknown response type without throwing or changing Apply", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets));
  const before = ui.elements.applyBtn.textContent;

  ui.send({ type: "from-the-future", payload: { weird: true } });

  assert.equal(ui.elements.applyBtn.textContent, before);
  assert.equal(ui.elements.applyBtn.disabled, false);
  ui.close();
});

test("long unicode/emoji/Cyrillic error text is rendered verbatim", async () => {
  const ui = await mountUi();
  const long = "Ошибка: " + "очень длинный текст 😀 ".repeat(40);
  ui.send({ type: "error", message: long });

  assert.equal(ui.elements.errorBox.textContent, long);
  ui.close();
});

test("percent color turns red when the current share is below the target", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets)); // currentPercent 7

  // target 7 == current 7 → not below → green
  ui.elements.presetSelect.value = "medicine_video_7";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));
  assert.equal(ui.elements.percentVal.classList.contains("green"), true);

  // target 10 > current 7 → red
  ui.elements.presetSelect.value = "bad_static_10";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));
  assert.equal(ui.elements.percentVal.classList.contains("red"), true);
  ui.close();
});

test("a detected preset auto-selects the matching option in the dropdown", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets, { detectedPresetKey: "bad_static_10" }));

  assert.equal(ui.elements.presetSelect.value, "bad_static_10");
  ui.close();
});

test("no detected preset leaves the dropdown at its current/default value", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets, { detectedPresetKey: null }));

  // first option in presets insertion order is bad_static_10
  assert.equal(ui.elements.presetSelect.value, "bad_static_10");
  ui.close();
});

test("an unknown detected preset key is ignored instead of breaking the select", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets, { detectedPresetKey: "not-a-real-preset" }));

  assert.equal(ui.elements.presetSelect.value, "bad_static_10");
  ui.close();
});

test("re-rendering the same detected node does not override the user's own preset choice", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets, { detectedPresetKey: "bad_static_10" }));
  assert.equal(ui.elements.presetSelect.value, "bad_static_10");

  // user picks a different preset manually
  ui.elements.presetSelect.value = "medicine_video_7";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));

  // the sandbox re-sends state for the exact same node; detected preset must not clobber choice
  ui.send(readyResizeState(presets, { detectedPresetKey: "bad_static_10" }));

  assert.equal(ui.elements.presetSelect.value, "medicine_video_7");
  ui.close();
});

test("selecting a genuinely different disclaimer re-applies its own detected preset", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets, {
    disclaimerName: "A",
    detectedPresetKey: "bad_static_10",
  }));
  assert.equal(ui.elements.presetSelect.value, "bad_static_10");

  ui.elements.presetSelect.value = "medicine_video_7";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));

  // a different node (different name/size) is now selected
  ui.send(readyResizeState(presets, {
    disclaimerName: "B",
    disclaimerWidth: 150,
    detectedPresetKey: "bad_static_10",
  }));

  assert.equal(ui.elements.presetSelect.value, "bad_static_10");
  ui.close();
});

test("custom dropdown menu items match the presets and selecting one updates the hidden select", async () => {
  const ui = await mountUi();
  ui.send(readyAddMissingState(presets));

  const items = ui.elements.presetMenu.querySelectorAll(".select-menu-item");
  assert.equal(items.length, 4);

  const medicineItem = [...items].find(
    (item) => item.querySelector(".select-menu-item-text").textContent === copy.presets.medicine_video_7
  );
  assert.ok(medicineItem, "medicine preset item exists");
  medicineItem.click();

  assert.equal(ui.elements.presetSelect.value, "medicine_video_7");
  ui.close();
});

test("trigger text reflects the currently selected preset label", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(presets, { detectedPresetKey: "finance_credit_5" }));

  const triggerText = ui.document.getElementById("presetTriggerText");
  assert.equal(triggerText.textContent, copy.presets.finance_credit_5);
  ui.close();
});

test("accessibility smoke: document is in Russian and every control has a label/name", async () => {
  const ui = await mountUi();
  ui.send(readyAddMissingState(presets));

  assert.equal(ui.document.documentElement.lang, "ru");
  assert.equal(ui.document.title, copy.ui.title);

  // every checkbox is associated with a <label for>
  const controls = ui.document.querySelectorAll("input[type=checkbox]");
  assert.ok(controls.length >= 2);
  for (const control of controls) {
    const label = ui.document.querySelector(`label[for="${control.id}"]`);
    assert.ok(label, `control #${control.id} has a <label for>`);
    assert.ok(label.textContent.trim().length > 0);
  }

  // the primary action is a real focusable button
  ui.elements.applyBtn.focus();
  assert.equal(ui.document.activeElement, ui.elements.applyBtn);
  ui.close();
});
