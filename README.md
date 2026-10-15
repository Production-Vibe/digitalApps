# ЦифровойНаряд

Система управления производством подъёмных агрегатов (ПА). Заменяет бумажные
наряды цифровым потоком: планирование запусков → выдача нарядов нач. смены →
выполнение оператором → контроль ОТК.

**Стек:** Excel (VBA) → Node.js (Express + EJS + Prisma) → PostgreSQL. Монолит
на TypeScript, JWT + bcrypt авторизация, без фреймворков UI.

## Как начать работу с репозиторием

1. Прочитай `AGENTS.md` — обязательный контракт работы.
2. Техническая документация — в `docs/specs/`:
   - `architecture.md` — стек, модули, потоки данных, Docker-контуры;
     визуальная схема потоков и ER-моделей —
     [Общая схема](docs/specs/architecture.md#общая-схема) (mermaid);
   - `roles.md` — роли, права, роутинг страниц;
   - `data-model.md` — структура таблиц Prisma, статусы;
   - `adr/` — принятые архитектурные решения.
3. Отчёты по этапам — в `docs/reports/`.
4. Локальный запуск — `server/` + `server/.env` (из `.env.example`), `npm run dev`.
5. E2E (Playwright) — `docs/testing/e2e-runbook.md`.

## Роли

| role | Интерфейс | Страница | Реализация |
|---|---|---|---|
| `master` | Начальник цеха: дерево номенклатуры, запуски на ПА, сводки | `/master` | `server/src/views/master-app.ejs` |
| `shift` | Начальник смены: выдача нарядов операторам из запусков | `/shift` | `server/src/views/shift-app.ejs` |
| `operator` | Оператор: смены, наряды, тех. переходы | `/operator` | `server/src/views/operator.ejs` |
| `otk` | ОТК: приёмка/брак/закрытие нарядов, возврат на доработку | `/otk` | `server/src/views/otk-app.ejs` |
| `admin` | Суперпользователь (superuser): администрирование сотрудников, справочники, номенклатура. Создаётся только сидом, через UI второго админа не создаётся | `/admin` | `server/src/views/admin.ejs` |

## REST-модули

Все API-модули — `server/src/routes/*.ts` (17 файлов), подключены в
`server/src/app.ts`:

| Файл | Префикс |
|---|---|
| `auth.routes.ts` | `/api` (login, register, refresh, session, logout, me) |
| `page.routes.ts` | `/` (EJS-страницы ролей) |
| `catalog.routes.ts` | `/api/catalog` |
| `dictionaries.routes.ts` | `/api/dictionaries` |
| `equipment.routes.ts` | `/api/equipment` |
| `employees.routes.ts` | `/api/employees` |
| `launches.routes.ts` | `/api/launches` |
| `workorders.routes.ts` | `/api/work-orders` |
| `shifts.routes.ts` | `/api/shifts` |
| `transitions.routes.ts` | `/api/transitions` |
| `otk.routes.ts` | `/api/otk` |
| `product-docs.routes.ts` | `/api/product-docs` |
| `notifications.routes.ts` | `/api/notifications` |
| `push.routes.ts` | `/api/push` |
| `analytics.routes.ts` | `/api/analytics` |
| `admin.routes.ts` | `/api/admin` |
| `vba.routes.ts` | `/api/vba` |

## Страницы (EJS)

Все вью — `server/src/views/*.ejs` (7 файлов): `login.ejs`, `layout.ejs`
(общий каркас), `master-app.ejs`, `shift-app.ejs`, `operator.ejs`,
`otk-app.ejs`, `admin.ejs`.

## PostgreSQL

Единственное хранилище. Локальная БД `MOSD`, пользователь `production_user`
(см. `server/.env`, в git не хранится). Схема — канон в
`server/prisma/schema.prisma` (15 моделей, 6 enum).

## Источник правды и деплой

- **`server/src/`** — исходник; **`server/prisma/schema.prisma`** — схема БД (канон).
- Миграции — `server/prisma/migrations/*` (через `prisma migrate dev`).
- Сид — `server/prisma/seed.ts` + `server/prisma/data/*.json` (каталог, роли, станки).
- Деплой — **Docker + PM2** (`server/docker-compose.yml`, `server/Dockerfile`,
  `server/ecosystem.config.cjs`): `docker compose up --build`. Секреты — в
  `server/.env` (кроме `.env.example`, в git не хранятся).

## Структура файлов

```
digitalApps/
├── AGENTS.md                # Контракт работы (читать первым)
├── README.md                # Этот файл (карта проекта)
├── server/                  # New-стек: Node/Express + Prisma + PostgreSQL
│   ├── src/
│   │   ├── app.ts           # Express-приложение, роутинг
│   │   ├── config.ts        # порт, JWT/VBA-секреты, DATABASE_URL
│   │   ├── routes/          # REST-модули по доменам (17 файлов, см. «REST-модули»)
│   │   ├── middleware/auth.ts    # requireAuth(...roles)
│   │   ├── lib/             # id, naryad-status, transition-logic, prisma, request
│   │   ├── views/           # EJS (7): login, layout, admin, master-app,
│   │   │                    #   shift-app, operator, otk-app
│   │   └── public/          # api.js, styles.css, sw.js, push-init.js
│   ├── prisma/
│   │   ├── schema.prisma    # Канон схемы БД (15 моделей)
│   │   ├── migrations/      # Миграции (prisma migrate dev)
│   │   ├── seed.ts          # Сид (bcrypt-хэши ролей)
│   │   └── data/            # catalog.json, employees.json, equipment.json, …
│   ├── Dockerfile, docker-compose.yml, ecosystem.config.cjs
│   ├── scripts/             # set-passwords, import-excel, import-product-docs, …
│   ├── docs/vba-integration.md
│   ├── .env.example         # Шаблон секретов (реальный .env не в git)
│   └── package.json
├── docs/
│   ├── specs/               # architecture.md, roles.md, data-model.md, adr/
│   ├── reports/             # Отчёты по этапам + STATUS.md (живое состояние)
│   └── testing/e2e-runbook.md
├── tests/e2e/               # Playwright-харнесс (Python)
├── .opencode/               # Скиллы, команды, subagents, оркестрация (см. ниже)
└── opencode.json            # Конфиг opencode (инструкции, MCP, permissions)
```

## Инструменты opencode (`.opencode/`)

- **Скиллы** — `.opencode/skills/` (11 шт.), загружаются по фазе задачи
  (таблица триггеров в `AGENTS.md`): `grilling`, `diagnosing-bugs`,
  `codebase-design`, `code-review`, `domain-modeling`, `doc-coauthoring`,
  `verification-before-completion`, `writing-for-agents`, `web-design`,
  `frontend-design`, `webapp-testing`.
- **Команды** — `.opencode/commands/` (вызываются вручную слэшем):
  `/grill-with-docs`, `/code-review`, `/handoff`.
- **Проектные subagents** — `.opencode/agents/`: `e2e` (обёртка
  `docs/testing/e2e-runbook.md`, прогон Playwright-ролей).
- **Оркестрация** — argos-оркестратор (`@nest4869/argos`, подключается
  глобально): primary-агент `orchestrator` + специалисты (`architect`,
  `coder`, `reviewer`, `tester`, `librarian`, …). Запуск —
  `opencode --agent orchestrator`. На Windows панели tmux пропускаются,
  специалисты работают в изолированных сессиях.
- `opencode.json` — инструкции проекта, MCP (`postgres`, `playwright`),
  permissions.

## Жизненный цикл работы (end-to-end)

Полное описание потока — `docs/specs/architecture.md`, раздел
«Жизненный цикл работы». Визуальная схема (mermaid: потоки ролей +
ER-диаграмма моделей) — [Общая схема](docs/specs/architecture.md#общая-схема).

## Ключевые технические особенности

- Авторизация — JWT: `POST /api/login` (bcrypt → `accessToken` 12ч) + httpOnly-
  кука `nd_refresh` (refreshToken 7д). Роль — в подписанном токене, спуфинг через
  URL невозможен. Access-токен живёт только в памяти JS, refresh — в куке;
  `GET /api/session` восстанавливает сессию, общий `api()` в `public/api.js`
  делает тихий refresh на 401.
- Защита входа — `express-rate-limit` на `/login`+`/refresh` (120/15 мин) +
  in-memory блокировка логина (5 неудач → 15 мин), helmet (CSP выключен).
- Бизнес-инварианты в хендлерах/`lib/`: закрытие без проверенных переходов
  запрещено, `accepted+defect ≤ qty`, смена упирается в занятость станка.
- Словари статусов — единые константы `server/src/lib/naryad-status.ts`.
- Внутренние уведомления — модель `Notification` + `/api/notifications/*`;
  колокольчик в шапке всех ролей (бейдж непрочитанных, dropdown, тост),
  поллинг каждые 15 с; событие пишется хуком (выдача наряда, rework, закрытие
  и т.д.), адресат — оператор по ФИО либо вся роль.
- Web Push + PWA — `manifest.webmanifest` + service worker (`public/sw.js`,
  `push-init.js`), модель `PushSubscription`, `/api/push/*` (VAPID-ключи из
  `server/.env`, `npm run push:keys`): уведомление приходит на телефон и при
  закрытой вкладке; без ключей приложение работает без push.
- Словари каталога — модель `DictionaryValue` (ADR-009): 5 полей номенклатуры
  (`blankType/material/materialGrade/blankSize/priority`) валидируются сервером,
  quick-add из UI, лояльный импорт; автокод позиции генерируется сервером
  (`POST /api/catalog/next-code`, материализация контейнеров).
- Документы КД — модели `ProductDoc`/`ProductDocLink` (связь many-to-many),
  массовый импорт манифеста (`npm run docs:import`), API `/api/product-docs`
  (`?partCode=`, `/counts`); счётчик «КД: N» и панель документов в дереве
  номенклатуры.
- VBA-интеграция — REST `/api/vba/ingest` (X-VBA-Secret): `uploadCatalog`,
  `createTransition`, `completeTransition` (см. `server/docs/vba-integration.md`).

## Ветки

- `main` — новый стек (Node/Express + Prisma + PostgreSQL). Рабочая ветка.
- `google-apps` — легаси Google Apps Script-наработки (модули, GAS-скиллы,
  GAS-документация). В `main` переносить без явного решения нельзя.
