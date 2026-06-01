import assert from "node:assert/strict";
import test from "node:test";

import {
  mountUi,
  readyAddMissingState,
  readyResizeState,
  SAMPLE_PRESETS,
} from "./helpers/uiHarness.mjs";

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
  assert.deepEqual(plain(ui.outgoing), [{ type: "request-state" }]);
  assert.equal(ui.elements.applyBtn.disabled, true);
  ui.close();
});

test("no-selection state mutes metrics and disables Apply", async () => {
  const ui = await mountUi();
  ui.send({ type: "no-selection", presets: SAMPLE_PRESETS, error: "Выделите слой." });

  assert.equal(ui.elements.applyBtn.disabled, true);
  assert.equal(ui.elements.applyBtn.textContent, "Применить");
  assert.equal(ui.elements.percentVal.textContent, "—");
  ui.close();
});

test("invalid error state shows the error box; info tone shows the info box", async () => {
  const ui = await mountUi();

  ui.send({ type: "invalid", presets: SAMPLE_PRESETS, error: "Выделите слой." });
  assert.equal(isVisible(ui.elements.errorBox), true);
  assert.equal(ui.elements.errorBox.textContent, "Выделите слой.");
  assert.equal(isVisible(ui.elements.infoMsg), false);

  ui.send({
    type: "invalid",
    presets: SAMPLE_PRESETS,
    error: "Дисклеймер не найден.",
    feedbackTone: "info",
  });
  assert.equal(isVisible(ui.elements.infoMsg), true);
  assert.equal(isVisible(ui.elements.errorBox), false);
  ui.close();
});

test("ready resize state fills metrics and enables Apply", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));

  assert.equal(ui.elements.applyBtn.disabled, false);
  assert.equal(ui.elements.applyBtn.textContent, "Применить");
  assert.equal(ui.elements.percentVal.textContent.includes("%"), true);
  // banner width 660 is rendered with a thin-space thousands separator
  const bannerW = ui.elements.bannerVal.querySelector('[data-part="w"]').textContent;
  assert.equal(bannerW, "660");
  ui.close();
});

test("add-missing state relabels Apply and toggles to Создать with create-all", async () => {
  const ui = await mountUi();
  ui.send(readyAddMissingState(SAMPLE_PRESETS));

  assert.equal(ui.elements.applyBtn.textContent, "Добавить");
  assert.equal(ui.elements.addToImageInput.disabled, false);
  assert.equal(ui.elements.createAllInput.disabled, false);

  ui.elements.createAllInput.checked = true;
  ui.elements.createAllInput.dispatchEvent(new ui.window.Event("change"));
  assert.equal(ui.elements.applyBtn.textContent, "Создать");
  ui.close();
});

test("resize-existing state disables the add-target checkboxes", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));

  assert.equal(ui.elements.addToImageInput.disabled, true);
  assert.equal(ui.elements.createAllInput.disabled, true);
  ui.close();
});

test("choosing the custom preset reveals the percent field and resizes the window", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));

  ui.elements.presetSelect.value = "custom";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));

  assert.notEqual(ui.elements.customBlock.style.display, "none");
  const resize = ui.outgoingOfType("resize").at(-1);
  assert.equal(resize.height, 856);
  ui.close();
});

test("submitting a ready add-missing form posts a well-formed apply-resize", async () => {
  const ui = await mountUi();
  ui.send(readyAddMissingState(SAMPLE_PRESETS));

  ui.elements.presetSelect.value = "medicine_video_7";
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
  assert.equal(ui.elements.applyBtn.textContent, "Применяем…");
  ui.close();
});

test("custom percent: invalid input blocks submit and shows validation error", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));
  ui.elements.presetSelect.value = "custom";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));
  ui.elements.customInput.value = "";

  ui.elements.applyBtn.click();

  assert.equal(ui.outgoingOfType("apply-resize").length, 0, "no message sent");
  assert.equal(isVisible(ui.elements.errorBox), true);
  // button stays usable so the user can correct and retry (no infinite loading)
  assert.equal(ui.elements.applyBtn.disabled, false);
  ui.close();
});

test("custom percent: a valid number submits the parsed value", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));
  ui.elements.presetSelect.value = "custom";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));
  // type=number sanitizes locale commas, so a dot decimal is used here
  ui.elements.customInput.value = "7.5";

  ui.elements.applyBtn.click();

  const msg = ui.outgoingOfType("apply-resize").at(-1);
  assert.equal(msg.customPercent, 7.5);
  ui.close();
});

test("success response re-enables Apply and shows the success box", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));
  ui.elements.applyBtn.click();

  ui.send({ type: "success", message: "Применено: 200×18,94 px — 7 % площади баннера" });

  assert.equal(isVisible(ui.elements.successMsg), true);
  assert.equal(ui.elements.applyBtn.disabled, false);
  ui.close();
});

test("error response re-enables Apply and shows the error box", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));
  ui.elements.applyBtn.click();

  ui.send({ type: "error", message: "Слой заблокирован." });

  assert.equal(isVisible(ui.elements.errorBox), true);
  assert.equal(ui.elements.applyBtn.disabled, false);
  ui.close();
});

test("UI ignores an unknown response type without throwing or changing Apply", async () => {
  const ui = await mountUi();
  ui.send(readyResizeState(SAMPLE_PRESETS));
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
  ui.send(readyResizeState(SAMPLE_PRESETS)); // currentPercent 7

  // target 7 == current 7 → not below → green
  ui.elements.presetSelect.value = "medicine_video_7";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));
  assert.equal(ui.elements.percentVal.classList.contains("green"), true);

  // custom 10 > current 7 → red
  ui.elements.presetSelect.value = "custom";
  ui.elements.presetSelect.dispatchEvent(new ui.window.Event("change"));
  ui.elements.customInput.value = "10";
  ui.elements.customInput.dispatchEvent(new ui.window.Event("input"));
  assert.equal(ui.elements.percentVal.classList.contains("red"), true);
  ui.close();
});

test("accessibility smoke: document is in Russian and every control has a label/name", async () => {
  const ui = await mountUi();
  ui.send(readyAddMissingState(SAMPLE_PRESETS));

  assert.equal(ui.document.documentElement.lang, "ru");
  assert.ok(ui.document.title.length > 0);

  // every checkbox/select/number input is associated with a <label for>
  const controls = ui.document.querySelectorAll(
    "select, input[type=checkbox], input[type=number]"
  );
  assert.ok(controls.length >= 3);
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
