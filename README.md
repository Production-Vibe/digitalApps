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

## PostgreSQL

Единственное хранилище. Локальная БД `MOSD`, пользователь `production_user`
(см. `server/.env`, в git не хранится). Схема — канон в
`server/prisma/schema.prisma` (10 моделей).

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
│   │   ├── routes/          # REST-модули по доменам (auth, catalog, launches,
│   │   │                    #   workorders, shifts, transitions, otk, vba, …)
│   │   ├── middleware/auth.ts    # requireAuth(...roles)
│   │   ├── lib/             # id, naryad-status, transition-logic, prisma, request
│   │   ├── views/           # EJS: login, master-app, shift-app, operator, otk-app
│   │   └── public/          # api.js, styles.css
│   ├── prisma/
│   │   ├── schema.prisma    # Канон схемы БД (10 моделей)
│   │   ├── migrations/      # Миграции (prisma migrate dev)
│   │   ├── seed.ts          # Сид (bcrypt-хэши ролей)
│   │   └── data/            # catalog.json, employees.json, equipment.json
│   ├── Dockerfile, docker-compose.yml, ecosystem.config.cjs
│   ├── docs/vba-integration.md
│   ├── .env.example         # Шаблон секретов (реальный .env не в git)
│   └── package.json
├── docs/
│   ├── specs/               # architecture.md, roles.md, data-model.md, adr/
│   ├── reports/             # Отчёты по этапам + STATUS.md (живое состояние)
│   └── testing/e2e-runbook.md
├── tests/e2e/               # Playwright-харнесс (Python)
├── .opencode/               # Скиллы и subagents opencode
└── opencode.json            # Конфиг opencode (инструкции, MCP, permissions)
```

## Жизненный цикл работы (end-to-end)

Полное описание потока — `docs/specs/architecture.md`, раздел
«Жизненный цикл работы».

## Ключевые технические особенности

- Авторизация — JWT: `POST /api/auth/login` (bcrypt → `accessToken` 12ч +
  `refreshToken` 7д). Роль — в подписанном токене, спуфинг через URL невозможен.
  Клиент хранит токены в `localStorage`, общий `api()` в `public/api.js`.
- Бинес-инварианты в хендлерах/`lib/`: закрытие без проверенных переходов
  запрещено, `accepted+defect ≤ qty`, смена упирается в занятость станка.
- Словари статусов — единые константы `server/src/lib/naryad-status.ts`.
- VBA-интеграция — REST `/api/vba/ingest` (X-VBA-Secret): `uploadCatalog`,
  `createTransition`, `completeTransition` (см. `server/docs/vba-integration.md`).

## Ветки

- `main` — новый стек (Node/Express + Prisma + PostgreSQL). Рабочая ветка.
- `google-apps` — легаси Google Apps Script-наработки (модули, GAS-скиллы,
  GAS-документация). В `main` переносить без явного решения нельзя.