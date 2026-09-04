# ЦифровойНаряд

Система управления производством подъёмных агрегатов (ПА). Заменяет бумажные
наряды цифровым потоком: планирование запусков → выдача нарядов нач. смены →
выполнение оператором → контроль ОТК.

**Стек:** Excel (VBA) → Google Таблицы (хранилище данных) → Google Apps Script
WebApp (веб-интерфейс и серверная логика).

## Как начать работу с репозиторием

1. Прочитай `AGENTS.md` — обязательный контракт работы.
2. Техническая документация — в `docs/specs/`:
   - `architecture.md` — стеки, листы, модули, потоки данных;
   - `roles.md` — роли, права, роутинг страниц;
   - `data-model.md` — структура колонок листов, статусы;
   - `adr/` — принятые архитектурные решения.
3. Отчёты по этапам — в `docs/reports/`.
4. Диагностика «вечной Загрузки…»/пустой страницы — `docs/МАСТЕР-ДИАГНОСТИКА.md`.

## Роли

| role | Интерфейс | Страница | Модуль |
|---|---|---|---|
| `master` | Начальник цеха: дерево номенклатуры, запуски на ПА, Dashboard, печать | `?page=master-app` | `MasterUI` |
| `shift` | Начальник смены: выдача нарядов операторам из запусков | `?page=shift-app` | `ShiftUI` |
| `operator` | Оператор: смены, наряды, тех. переходы | `?page=operator` | `OperatorUI` |
| `otk` | ОТК: приёмка/брак/закрытие нарядов (в разработке) | — | — |

## Google Таблицы

Единственное хранилище, 12 листов:
`Catalog`, `Planning`, `Launches`, `Queue`, `WorkOrders`, `Shifts`, `PrintQueue`,
`Сотрудники`, `Equipment`, `Наряды`, `Переходы`, `Закрытые`.
Реальные имена/колонки — в `modules/Config.md` и `docs/specs/data-model.md`.

## Модули Apps Script (12)

`Code`, `Config`, `Auth`, `MasterUI`, `ShiftUI`, `PlanningAPI`, `CatalogAPI`,
`Launches`, `OperatorUI`, `Shifts`, `NaryadAPI`, `PrintQueue`.
Краткое описание — в `docs/specs/architecture.md`.

## Источник правды и деплой

Файлы `modules/*.md` — это **дословные `.gs`-исходники** (не документация).
Каждый код-модуль `.md` 1:1 маппится в `.gs`-модуль Apps Script.

Деплой **только ручной** (никакого clasp/`dist/`): правка `modules/*.md` →
`node .opencode/skills/digitalapps-deploy/scripts/check-modules.js` →
копирование файла целиком в редактор Apps Script →
«Развернуть → Новая версия» → «тестируй». Подробности — `AGENTS.md` и
`.opencode/skills/digitalapps-deploy/SKILL.md`. Почему так — `docs/specs/adr/deploy-manual.md`.

## Структура файлов

```
digitalApps/
├── AGENTS.md                # Контракт работы (читать первым)
├── README.md                # Этот файл (карта проекта)
├── modules/                 # Код-модули (деплоятся)
│   ├── Code.md              # doPost/onEdit, событийная модель
│   ├── Config.md            # Константы имён листов
│   ├── Auth.md              # checkAuth, doGet, роутинг страниц
│   ├── MasterUI.md          # Нач. цеха: дерево, запуски на ПА, Dashboard
│   ├── ShiftUI.md           # Нач. смены: выдача нарядов из запусков
│   ├── PlanningAPI.md       # Чтение Catalog, Queue/WorkOrders
│   ├── CatalogAPI.md        # uploadCatalog (номенклатура из Excel)
│   ├── Launches.md          # Запуски на ПА, занятость, сводки
│   ├── OperatorUI.md        # Оператор: смены, наряды, тех. переходы
│   ├── Shifts.md            # Смены операторов, станки
│   ├── NaryadAPI.md         # Наряды, переходы, закрытие
│   └── PrintQueue.md        # Очередь печати
├── docs/
│   ├── Мастер-промпт.md     # Документация-память (не деплоится)
│   ├── МАСТЕР-ДИАГНОСТИКА.md# Диагностика «Загрузка…» (не деплоится)
│   ├── чек-лист внедрения...md  # Чек-лист введения (не деплоится)
│   ├── specs/               # Технические спецификации
│   │   ├── architecture.md
│   │   ├── roles.md
│   │   ├── data-model.md
│   │   └── adr/
│   └── reports/             # Отчёты по этапам
└── .opencode/skills/        # Скиллы opencode
```

## Жизненный цикл работы (end-to-end)

Полное описание потока — `docs/specs/architecture.md`, раздел
«Жизненный цикл работы».

## Ключевые технические особенности

- Роли разграничены на уровне листа `Сотрудники` (login/password/role) и
  роутинга в `doGet` (`modules/Auth.md`).
- `MasterUI` и `ShiftUI` грузятся как **полная страница** (`?page=master-app` /
  `?page=shift-app`) — inline-`<script>` через `innerHTML` в песочнице не
  выполняется. `OperatorUI` — фрагмент + `runInsertedScripts`.
- Навигация верхнего уровня — только через серверный `appBaseUrl()`.
- Событийная модель: `onEdit` в таблице (Planning → Queue → WorkOrders),
  `doPost` для VBA. Детали — `modules/Code.md`, `docs/specs/architecture.md`.
- Функции читают листы по именам колонок (`headers.indexOf`) — устойчиво к порядку.