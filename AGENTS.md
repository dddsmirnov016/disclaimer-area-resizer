# Инструкция для AI-агентов и разработчиков

Краткий чеклист: куда заливать код, что коммитить и как проверить плагин.

## Git-репозиторий

| Параметр | Значение |
|----------|----------|
| **URL** | https://github.com/dddsmirnov016/disclaimer-area-resizer |
| **Remote** | `origin` |
| **Ветка по умолчанию** | `main` (пушить сюда, если пользователь не просил другую ветку) |
| **Клон** | `git clone https://github.com/dddsmirnov016/disclaimer-area-resizer.git` |

После изменений:

```bash
cd disclaimer-area-resizer
npm run build          # обязательно перед коммитом, если менялся src/main.ts
git add .
git commit -m "краткое описание на английском или русском"
git push origin main
```

Если `git push` просит логин — на машине пользователя настроен GitHub CLI:

```bash
gh auth setup-git
git push origin main
```

**Не делать без явной просьбы пользователя:** force push, amend чужих коммитов, push в другие ветки, коммит `.env` и секретов.

---

## Что лежит в репозитории

```
disclaimer-area-resizer/
├── manifest.json      # точка входа для Figma (main + ui)
├── src/
│   ├── main.ts        # логика плагина (TypeScript)
│   ├── ui.html        # интерфейс плагина
│   └── generatedDisclaimerAssets.ts # генерируется из svg/ при сборке
├── dist/
│   └── main.js        # сборка из main.ts — должна быть в git
├── scripts/
│   └── generate-disclaimer-assets.mjs # встраивает SVG в TypeScript
├── svg/               # исходные SVG-дисклеймеры
├── package.json
├── tsconfig.json
├── README.md          # документация для людей
└── AGENTS.md          # этот файл
```

**В git не коммитить:** `node_modules/`, `.DS_Store`, `*.js.map`.

**В git коммитить после `npm run build`:** `dist/main.js`, если менялся `src/main.ts`; `src/generatedDisclaimerAssets.ts`, если менялись SVG в `svg/`.

**SVG:** Figma-плагин не читает локальные файлы в runtime. Все SVG из `svg/` встраиваются в `src/generatedDisclaimerAssets.ts` через `npm run generate:assets`, а `npm run build` запускает генерацию автоматически.

**UI:** `manifest.json` указывает `"ui": "src/ui.html"` — правки интерфейса только в `src/ui.html`, отдельная сборка UI не нужна.

---

## Локальный путь проекта (у владельца)

```
/Users/dddsmirnov/Documents/Dev/disclaimer-area-resizer
```

На другой машине путь будет другим — ориентироваться на корень клонированного репозитория.

---

## Как пользователь подключает плагин в Figma

1. Figma Desktop → **Plugins → Development → Import plugin from manifest...**
2. Выбрать `manifest.json` из корня репозитория (не из `dist/`).
3. Запуск: **Plugins → Development → Disclaimer Area Resizer**.

После изменений в коде: пересобрать (`npm run build` при правках `main.ts`), перезапустить плагин в Figma.

## Поведение плагина

- Если выбран существующий слой дисклеймера внутри баннера, плагин меняет его размер до процента из выбранного пресета.
- Если выбран сам баннерный фрейм, плагин ищет уже добавленный SVG-дисклеймер с тем же `assetKey`. Если находит — ресайзит его. Если не находит — создаёт новый SVG через `figma.createNodeFromSvg`.
- Чекбокс **Поверх картинки** в UI управляет добавлением нового SVG:
  - выключен по умолчанию — добавить в текстовую/body-часть;
  - включён — добавить абсолютным оверлеем внизу медиа-области.
- Чекбокс **Создать все типы** работает только при выбранном баннере и по умолчанию выключен. В этом режиме плагин дублирует исходный баннер вправо для каждого уникального SVG из пресетов, удаляет из дубликатов известные дисклеймеры и добавляет новый SVG в body или поверх картинки по состоянию чекбокса **Поверх картинки**.
- Текстовая часть определяется как вертикальный auto-layout контейнер с текстовыми слоями.
- Медиа-область определяется как самая большая видимая область с `IMAGE` fill внутри баннера.

## SVG и пресеты

Пресеты процентов находятся в `DISCLAIMER_PRESETS` в `src/main.ts`. Каждый пресет содержит `assetKey`, который должен совпадать с ключом из `src/generatedDisclaimerAssets.ts` (обычно имя SVG-файла без `.svg`).

Текущий маппинг:

| Пресеты | SVG |
|---------|-----|
| `medicine_video_7`, `medicine_static_5` | `Есть противопоказания...svg` |
| `bad_static_10`, `bad_video_7`, `energy_7` | `Не является лекарством.svg` |
| `finance_credit_5` | `Изучите все условия кредита...svg` |
| `finance_custom_10` | `Банкротство влечёт...svg` |
| `custom` | `Есть противопоказания...svg` |

При добавлении нового SVG-файла:

1. Положить файл в `svg/`.
2. Запустить `npm run build`.
3. Проверить, что обновился `src/generatedDisclaimerAssets.ts`.
4. Добавить или изменить `assetKey` в `DISCLAIMER_PRESETS`.

---

## Макет UI (Figma)

Дизайн панели плагина:

- Файл: `XGX3Nc66SXr5XevcUB5m6X` (Дзен)
- Основной фрейм: node `282:181`
- Блок ошибки + кнопка: node `282:213`

При правках UI сверяться с макетом (отступы, Inter, размеры). Ошибка — розовый блок над кнопкой; слот под ошибку фиксированный, чтобы кнопка не прыгала.

---

## Git identity (локально в репозитории)

Если коммит падает с «Please tell me who you are»:

```bash
git config user.email "dddsmirnov016@gmail.com"
git config user.name "Dmitrii Smirnov"
```

(только `user.*` в этом репо, без `--global`, если пользователь не просил иначе.)

---

## Типичные задачи агента

| Задача | Файлы |
|--------|--------|
| Логика, пресеты, API Figma | `src/main.ts` → `npm run build` |
| Новые SVG-дисклеймеры | `svg/` → `npm run build` → `src/generatedDisclaimerAssets.ts` |
| Вёрстка, цвета, ошибки в UI | `src/ui.html` |
| Имя/права плагина | `manifest.json` |
| Зависимости TypeScript | `package.json` |

Пресеты процентов: объект `DISCLAIMER_PRESETS` в `src/main.ts`.

---

## Чеклист перед push

- [ ] `npm run build` прошёл без ошибок (если трогали `main.ts`)
- [ ] `dist/main.js` добавлен в коммит при изменении логики
- [ ] `src/generatedDisclaimerAssets.ts` добавлен в коммит при изменении `svg/`
- [ ] Нет лишних файлов (`node_modules`, секреты)
- [ ] `git push origin main` успешен
- [ ] Пользователю сказано перезапустить плагин в Figma при изменении UI/логики
