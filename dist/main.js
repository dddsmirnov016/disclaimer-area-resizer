"use strict";
/// <reference types="@figma/plugin-typings" />
const DISCLAIMER_PRESETS = {
    medicine_video_7: {
        label: "Медицина — 7% / ТВ, видео или по ТЗ",
        percent: 7,
    },
    medicine_static_5: {
        label: "Медицина — 5% / статичный баннер, прочие способы",
        percent: 5,
    },
    bad_static_10: {
        label: "БАД — 10% / статичный баннер, прочие способы",
        percent: 10,
    },
    bad_video_7: {
        label: "БАД — 7% / ТВ, видео",
        percent: 7,
    },
    finance_credit_5: {
        label: "Финансы / кредит, займ — 5%",
        percent: 5,
    },
    finance_custom_10: {
        label: "Финансы — 10% / кастом по ТЗ клиента",
        percent: 10,
    },
    energy_7: {
        label: "Энергетические напитки — 7%",
        percent: 7,
    },
    custom: {
        label: "Кастомный процент",
        percent: null,
    },
};
function isResizable(node) {
    return ("width" in node &&
        "height" in node &&
        "resizeWithoutConstraints" in node &&
        typeof node
            .resizeWithoutConstraints === "function");
}
function nodeHasAutoLayout(node) {
    let current = node;
    while (current.type !== "PAGE" && current.type !== "DOCUMENT") {
        if ((current.type === "FRAME" ||
            current.type === "COMPONENT" ||
            current.type === "INSTANCE") &&
            current.layoutMode !== "NONE") {
            return true;
        }
        if (!current.parent)
            break;
        current = current.parent;
    }
    return false;
}
function findBannerFrame(node) {
    let result = null;
    let current = node.parent;
    while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
        if (current.type === "FRAME" ||
            current.type === "COMPONENT" ||
            current.type === "INSTANCE") {
            const f = current;
            if (f.width > 0 && f.height > 0) {
                result = f;
            }
        }
        current = current.parent;
    }
    return result;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function calcNewDimensions(selW, selH, bannerW, bannerH, targetPercent, direction) {
    const bannerArea = bannerW * bannerH;
    const targetArea = (bannerArea * targetPercent) / 100;
    const MIN = 0.01;
    if (direction === "height") {
        const newHeight = Math.max(MIN, targetArea / selW);
        return { newWidth: selW, newHeight };
    }
    else if (direction === "width") {
        const newWidth = Math.max(MIN, targetArea / selH);
        return { newWidth, newHeight: selH };
    }
    else {
        const disclaimerArea = selW * selH;
        const scale = Math.sqrt(targetArea / disclaimerArea);
        return {
            newWidth: Math.max(MIN, selW * scale),
            newHeight: Math.max(MIN, selH * scale),
        };
    }
}
function buildState() {
    const sel = figma.currentPage.selection;
    if (sel.length !== 1) {
        return {
            type: sel.length === 0 ? "no-selection" : "invalid",
            error: sel.length === 0
                ? "Выберите один disclaimer-слой"
                : "Выберите ровно один слой",
            presets: DISCLAIMER_PRESETS,
        };
    }
    const sceneNode = sel[0];
    if (!isResizable(sceneNode)) {
        return {
            type: "invalid",
            error: `Тип слоя "${sceneNode.type}" не поддерживает изменение размера`,
            presets: DISCLAIMER_PRESETS,
        };
    }
    if (sceneNode.locked) {
        return {
            type: "invalid",
            error: "Слой заблокирован (locked). Разблокируйте и попробуйте снова",
            presets: DISCLAIMER_PRESETS,
        };
    }
    if (sceneNode.width <= 0 || sceneNode.height <= 0) {
        return {
            type: "invalid",
            error: `Некорректные размеры disclaimer: ${sceneNode.width}×${sceneNode.height}`,
            presets: DISCLAIMER_PRESETS,
        };
    }
    const bannerFrame = findBannerFrame(sceneNode);
    if (!bannerFrame) {
        return {
            type: "invalid",
            error: "Выделите disclaimer внутри баннерного фрейма",
            presets: DISCLAIMER_PRESETS,
        };
    }
    if (bannerFrame.width <= 0 || bannerFrame.height <= 0) {
        return {
            type: "invalid",
            error: `Некорректные размеры баннера: ${bannerFrame.width}×${bannerFrame.height}`,
            presets: DISCLAIMER_PRESETS,
        };
    }
    const disclaimerArea = sceneNode.width * sceneNode.height;
    const bannerArea = bannerFrame.width * bannerFrame.height;
    const currentPercent = (disclaimerArea / bannerArea) * 100;
    return {
        type: "ready",
        info: {
            disclaimerName: sceneNode.name,
            disclaimerWidth: round2(sceneNode.width),
            disclaimerHeight: round2(sceneNode.height),
            bannerName: bannerFrame.name,
            bannerWidth: round2(bannerFrame.width),
            bannerHeight: round2(bannerFrame.height),
            currentPercent: round2(currentPercent),
            isText: sceneNode.type === "TEXT",
            hasAutoLayout: nodeHasAutoLayout(sceneNode),
        },
        presets: DISCLAIMER_PRESETS,
    };
}
// ─── Plugin entrypoint ─────────────────────────────────────────────────────
figma.showUI(__html__, { width: 432, height: 632 });
function sendState() {
    figma.ui.postMessage(buildState());
}
sendState();
figma.on("selectionchange", () => {
    sendState();
});
figma.ui.on("message", (msg) => {
    try {
        if (msg.type === "request-state") {
            sendState();
            return;
        }
        if (msg.type === "resize") {
            figma.ui.resize(msg.width, msg.height);
            return;
        }
        if (msg.type === "apply-resize") {
            const state = buildState();
            if (state.type !== "ready" || !state.info) {
                figma.ui.postMessage({
                    type: "error",
                    message: state.error !== undefined ? state.error : "Нет выбранного слоя",
                });
                return;
            }
            let targetPercent;
            if (msg.presetKey === "custom") {
                if (msg.customPercent === null ||
                    msg.customPercent <= 0 ||
                    msg.customPercent > 100) {
                    figma.ui.postMessage({
                        type: "error",
                        message: "Укажите корректный процент (0–100)",
                    });
                    return;
                }
                targetPercent = msg.customPercent;
            }
            else {
                const preset = DISCLAIMER_PRESETS[msg.presetKey];
                if (!preset || preset.percent === null) {
                    figma.ui.postMessage({ type: "error", message: "Неизвестный пресет" });
                    return;
                }
                targetPercent = preset.percent;
            }
            if (msg.onlyEnlarge && state.info.currentPercent >= targetPercent) {
                figma.ui.postMessage({
                    type: "success",
                    message: "Уже достаточно: " + round2(state.info.currentPercent) + "% из " + targetPercent + "%",
                });
                return;
            }
            const sel = figma.currentPage.selection;
            if (sel.length !== 1) {
                figma.ui.postMessage({
                    type: "error",
                    message: "Выбор изменился. Повторите.",
                });
                return;
            }
            const node = sel[0];
            if (!isResizable(node)) {
                figma.ui.postMessage({
                    type: "error",
                    message: "Слой не поддерживает resize",
                });
                return;
            }
            const { newWidth, newHeight } = calcNewDimensions(state.info.disclaimerWidth, state.info.disclaimerHeight, state.info.bannerWidth, state.info.bannerHeight, targetPercent, msg.direction);
            // Для TextNode: отключаем авто-ресайз текста, иначе Figma сразу пересчитает высоту
            if (node.type === "TEXT") {
                const textNode = node;
                if (textNode.textAutoResize !== "NONE") {
                    textNode.textAutoResize = "NONE";
                }
            }
            // Для auto-layout children: переключаем нужные оси с HUG на FIXED,
            // иначе resizeWithoutConstraints не имеет эффекта
            if ("layoutSizingVertical" in node && "layoutSizingHorizontal" in node) {
                const lNode = node;
                if ((msg.direction === "height" || msg.direction === "proportional") &&
                    lNode.layoutSizingVertical === "HUG") {
                    lNode.layoutSizingVertical = "FIXED";
                }
                if ((msg.direction === "width" || msg.direction === "proportional") &&
                    lNode.layoutSizingHorizontal === "HUG") {
                    lNode.layoutSizingHorizontal = "FIXED";
                }
            }
            node.resizeWithoutConstraints(newWidth, newHeight);
            const actualArea = node.width * node.height;
            const bannerArea = state.info.bannerWidth * state.info.bannerHeight;
            const actualPercent = round2((actualArea / bannerArea) * 100);
            const resultMessage = "Применено: " + round2(node.width) + "×" + round2(node.height) + " px — " +
                actualPercent + "% площади баннера";
            figma.notify(resultMessage, { timeout: 4000 });
            // Шлём success ПЕРЕД sendState, чтобы UI его не затёр
            figma.ui.postMessage({ type: "success", message: resultMessage });
            // Обновляем отображаемые размеры в панели после того как success уже показан
            sendState();
            return;
        }
    }
    catch (err) {
        figma.ui.postMessage({
            type: "error",
            message: "Ошибка: " + String(err),
        });
    }
});
