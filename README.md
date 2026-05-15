# Disclaimer Area Resizer — Figma Plugin

Figma-плагин для автоматического расчёта и изменения размера disclaimer-фрейма до нужного процента площади родительского баннера.

## Установка

### 1. Зависимости

```bash
cd disclaimer-area-resizer
npm install
```

### 2. Сборка

```bash
npm run build
```

Создастся файл `dist/main.js`.

### 3. Подключение в Figma

1. Откройте **Figma Desktop**.
2. Меню **Plugins → Development → Import plugin from manifest...**
3. Выберите файл `disclaimer-area-resizer/manifest.json`.
4. Плагин появится в **Plugins → Development → Disclaimer Area Resizer**.

### 4. Watch-режим (разработка)

```bash
npm run watch
```

Автоматическая пересборка при изменении `src/main.ts`.

---

## Как пользоваться

1. Откройте баннер в Figma.
2. Выделите **frame с дисклеймером** внутри баннера (не сам баннер).
3. Запустите плагин: **Plugins → Development → Disclaimer Area Resizer**.
4. Проверьте имя слоя и имя найденного баннера в панели плагина.
5. Выберите **тип дисклеймера** в первом выпадающем списке.
6. Выберите **направление изменения**: по высоте, ширине или пропорционально.
7. При необходимости включите/выключите «Только увеличивать, не уменьшать».
8. Проверьте **предпросмотр** новых размеров.
9. Нажмите **Применить**.

Как плагин находит баннер: он поднимается по цепочке родителей от выделенного слоя и берёт самый верхний фрейм перед страницей.

```
Page
  Banner 1080×1920   ← bannerFrame
    Content
      Disclaimer     ← выделите этот слой
```

---

## Формулы расчёта

```
bannerArea    = bannerWidth × bannerHeight
disclaimerArea = disclaimerWidth × disclaimerHeight
currentPercent = disclaimerArea / bannerArea × 100
targetArea    = bannerArea × targetPercent / 100
```

**Direction = height** (меняем только высоту):
```
newWidth  = disclaimerWidth  (без изменений)
newHeight = targetArea / disclaimerWidth
```

**Direction = width** (меняем только ширину):
```
newHeight = disclaimerHeight  (без изменений)
newWidth  = targetArea / disclaimerHeight
```

**Direction = proportional** (масштабируем равномерно):
```
scale     = √(targetArea / disclaimerArea)
newWidth  = disclaimerWidth × scale
newHeight = disclaimerHeight × scale
```

**Пример:**
- Баннер: 1000×1000 = 1 000 000 px²
- Disclaimer: 1000×40 = 40 000 px² = 4%
- Цель: 7% → targetArea = 70 000 px²
- Height:       1000 × 70
- Width:        1750 × 40
- Proportional: ≈ 1322.9 × 52.9

---

## Пресеты и их настройка

Пресеты находятся в `src/main.ts`, объект `DISCLAIMER_PRESETS`.

Чтобы изменить процент — отредактируйте поле `percent` нужного пресета и пересоберите плагин:

```typescript
const DISCLAIMER_PRESETS: Record<string, DisclaimerPreset> = {
  medicine_video_7: {
    label: "Медицина — 7% / ТВ, видео или по ТЗ",
    percent: 7, // ← изменить здесь
  },
  // ...
};
```

После изменения:
```bash
npm run build
```

Перезагрузка плагина в Figma происходит автоматически при следующем запуске.

---

## Текущие пресеты

| Ключ | Название | % |
|------|----------|---|
| `medicine_video_7` | Медицина — ТВ, видео | 7% |
| `medicine_static_5` | Медицина — статичный баннер | 5% |
| `bad_static_10` | БАД — статичный баннер | 10% |
| `bad_video_7` | БАД — ТВ, видео | 7% |
| `finance_credit_5` | Финансы / кредит, займ | 5% |
| `finance_custom_10` | Финансы — кастом | 10% |
| `energy_7` | Энергетические напитки | 7% |
| `custom` | Кастомный процент | — |

---

## Ограничения

- Плагин считает **геометрическую площадь** bounding box, а не юридическую корректность текста.
- Для статичных и видеоформатов могут быть **разные проценты** — это отражено в пресетах.
- При **auto layout** Figma может скорректировать размер после применения из-за layout constraints родителя.
- Если в макете есть **rotation или effects**, визуальная площадь для зрителя может отличаться от Figma geometry.
- Плагин **не меняет** позицию слоя, размер шрифта, текст, цвета или другие слои.
- Плагин **не работает** с заблокированными (locked) слоями.
- Плагин не использует сеть и не обращается к REST API Figma.
