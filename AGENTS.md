# AGENTS.md — Контракт работы над «ЦифровойНаряд» (новый стек)

Этот файл — обязательный контекст для любой работы с репозиторием. Читать перед
началом. Порядок приоритета: этот файл → `docs/specs/*.md` → код `server/src/*`.

**При старте нового диалога (подхват контекста) обязательно:**
1) прочитать `docs/reports/STATUS.md` — живое состояние (последний этап, открытые
   баги, следующий шаг, активный URL деплоя);
2) при необходимости — датированный отчёт по ссылке из STATUS.md;
3) `docs/specs/architecture.md` — устройство нового стека.

## Что это за проект

«ЦифровойНаряд» — система управления производством подъёмных агрегатов (ПА).
Заменяет бумажные наряды цифровым потоком: планирование запусков → выдача нарядов
нач. смены → выполнение оператором → контроль ОТК до готовности партии.

### Стек (ветка `main`)

```
Excel (VBA)  →  Node.js (Express + EJS + Prisma)  →  PostgreSQL
```

- **Node.js/TypeScript** — сервер (`server/`), Express + EJS (серверные страницы),
  Prisma ORM, JWT + bcrypt авторизация. Монолит без фреймворков UI.
- **PostgreSQL** — единственное хранилище (10 таблиц-моделей). Локально БД `MOSD`,
  пользователь `production_user`.
- **VBA** — интеграция через REST `/api/vba/ingest` (X-VBA-Secret), заменяет
  прежний Google Apps Script `doPost`.
- Деплой — Docker + PM2. Сид: каталог + 4 роли + станки из `server/prisma/data/*.json`.

### Легаси Google-стека

Google Apps Script-наработки (модули, документация, E2E против GAS-WebApp)
вынесены в отдельную ветку **`google-apps`**. В `main` их нет: `modules/`,
GAS-скиллов, `docs/МАСТЕР-ДИАГНОСТИКА.md`, манифеста GAS-деплоя. Не переносить
GAS-артефакты обратно в `main` без явного решения.

## Общая концепция

### Зачем нужен проект
Бумажные наряды: теряются, медленные, нет прозрачности — начальник смены и ОТК
не видят реального статуса выполнения. Система делает процесс полностью
цифровым и прослеживаемым до готовности партии.

### Полный поток (end-to-end)
```
Планирование запусков (master)
  → Выдача нарядов нач. смены (shift)
  → Выполнение оператором (operator)
  → Контроль ОТК (otk)
```
до полной готовности партии.

### Роли и страницы
- **admin** (суперпользователь, только из сида): создание/смена роли/деактивация
  сотрудников; проходит все страницы — `/admin`.
- **master** (нач. цеха): дерево номенклатуры, запуски на ПА, сводки, печать — `/master`.
- **shift** (нач. смены): выдача нарядов операторам из запусков (станок, кол-во) — `/shift`.
- **operator**: открывает смену на станке, принимает наряды, вводит тех. переходы — `/operator`.
- **otk**: приёмка/брак/закрытие нарядов, возврат на доработку — `/otk`.
- Выдача ролей: оператор — самозапись на `/login` (таб «Регистрация», роль
  фиксирует сервер); master/shift/otk — создаёт админ в `/admin`; admin — не
  создаётся через UI, только сидом/скриптом.

### Данные и модули
- **12 моделей Prisma** (`server/prisma/schema.prisma`): `Catalog`, `Launches`,
  `WorkOrders`, `Transitions`, `ClosedOrders`, `Shifts`, `PrintQueue`, `Employees`,
  `Equipment`, `Queue`, `Notification`, `PushSubscription`.
- **REST-модули** в `server/src/routes/`: `auth`, `catalog`, `equipment`,
  `launches`, `workorders`, `shifts`, `transitions`, `otk`, `employees`, `admin`,
  `analytics`, `notifications`, `push`, `vba`, плюс `page` (рендер EJS-страниц).
- **Вью** — EJS: `login`, `master-app`, `shift-app`, `operator`, `otk-app`.

### Жизненный цикл наряда / статусы
- Наряд: `created → in_progress → waiting_otk → closed`, а также `rework`
  («Доработка»): ОТК возвращает наряд оператору → `rework` → оператор правит →
  снова `waiting_otk` → `closed`.
- Запуск: `to_launch → issued → in_work → done` (используются `to_launch`/`issued`).
- Словари статусов — единые константы в `server/src/lib/naryad-status.ts`
  (`NARYAD_STATUS`, `LAUNCH_STATUS`, `SHIFT_STATUS`, `TRANSITION_STATUS`,
  `PRINT_JOB_STATUS`, `EMPLOYEE_ROLE`) + подписи для UI (`NARYAD_STATUS_LABELS`).

## Источник правды

- **`server/src/` — исходник.** `server/prisma/schema.prisma` — схема БД (канон).
- `server/prisma/migrations/*` — миграции (создаются через `prisma migrate dev`).
- Сид — `server/prisma/seed.ts` + JSON в `server/prisma/data/`.
- Google-стек (исторический) — только в ветке `google-apps`.

## Авторизация

- `POST /api/login` — сверка bcrypt по `Employees`, возвращает
  `accessToken` (12ч) + `user`; refresh-токен (7д, claim `persist`) — в
  httpOnly-куке `nd_refresh` (`SameSite=Strict`, `Secure` при `COOKIE_SECURE`).
- JWT-payload: `{ login, fullName, role }`. Роль — в подписанном токене, спуфинг
  через URL невозможен.
- `requireAuth(...roles)` в `server/src/middleware/auth.ts` — проверка Bearer-токена
  и роли.
- Access-токен хранится только в памяти JS (`server/src/public/api.js`), refresh —
  в куке. `initSession()` (на страницах ролей) сверится с `GET /api/session`,
  `api()` добавляет `Authorization: Bearer …`, на 401 делает тихий
  `POST /api/refresh` (сама кука) и повторяет запрос; `logout()` вызывает
  `POST /api/logout` (чистит куку).
- Защита входа: `express-rate-limit` (120/15 мин), in-memory блокировка логина
  (5 неудач → 15 мин; `server/src/lib/login-throttle.ts`), helmet (CSP выключен).
- Страницы `/master|/shift|/operator|/otk` рендерит EJS; фактический доступ
  проверяется на клиенте (редирект на `/login`), данные — только через
  авторизованные API.

## Разработка

### Локальный запуск (dev)
```powershell
cd server
npm ci
# создать server/.env из server/.env.example
npm run dev          # tsx watch src/app.ts на :3000
```
БД — локальный PostgreSQL (`MOSD`). Миграция: `npm run db:migrate`. Сид:
`npm run db:seed`.

### Docker
```powershell
docker compose up --build   # поднимет db + app (migrate + seed + node)
```
Контуpы dev/prod — см. `docs/specs/architecture.md` (Docker-раздел). Секреты — в
`server/.env` (в git не хранятся, кроме `.env.example`).

### Сборка и проверки
- `npm run build` — `tsc` (типы).
- `npm run check` — `node --check dist/app.js`.
- E2E (Playwright) — `tests/e2e/`, см. `docs/testing/e2e-runbook.md`.
- Prisma Studio: `npm run db:studio`.

## Технические конвенции кода

- Один Express-процесс, доменное разбиение на routes (`server/src/routes/*.ts`);
  UI работает через `public/api.js` (`fetch` + Bearer). Серверные EJS-страницы —
  без inline-бизнес-логики, данные через API.
- Валидация и инварианты в хендлерах/`lib/`: нельзя закрыть наряд без
  проверенных переходов (кроме `rework`-direct-close), `accepted+defect ≤ qty`,
  запуск меняется только из `to_launch`, занятость станка при открытии смены.
- ID: `Н-yyMMdd-HHmmss` (наряд), `ЗП-…` (запуск), `СМ-…` (смена); переходы
  нумеруются `005, 010, 015…` (`server/src/lib/id.ts`).
- Дата в UI: `dd.MM.yyyy HH:mm` (`fmtDate` в `api.js`).
- Коммиты — Conventional-ish на русском: `<тип>: <что> (<зачем>)`.

## Базовый процесс работы

Каждый этап работ выполняется по схеме: **План → Реализация → Проверка → Отчёт**
(см. `docs/reports/` — отчёт пишется по завершении этапа: что сделано, как
проверено, что осталось, следующий шаг).

## Скиллы — обязательный триггер по фазе

Скиллы лежат в `.opencode/skills/`. **Перед началом работы определи фазу задачи и
обязательно загрузи профильный скилл (инструмент `skill`), даже если считаешь,
что справишься без него. Не начинай работу в фазе, пока соответствующий скилл не
загружен.** Скиллы остаются on-demand (их нельзя инъектировать в каждую сессию),
но применение — обязательное правило, а не опция.

| Фаза задачи | Обязательный скилл (загрузить первым) |
|---|---|
| **Уточнение задачи / решение неочевидное** | `grilling` (интервью по кругам → `docs/specs/`) |
| **Отладка / расследование бага** | `diagnosing-bugs` (красный цикл → гипотезы → фикс) |
| **Изменение визуального UI** | `web-design` (усечённо) или `frontend-design` |
| **Написание/изменение логики кода** | профильный скилл по домену; `codebase-design`, если проектируется интерфейс модуля |
| **Термины домена / решение «навсегда»** | `domain-modeling` (`GLOSSARY.md`, `docs/specs/adr/`) |
| **Проверка / завершение этапа** | `verification-before-completion`; при E2E — `webapp-testing` |
| **Ревью чужих/моих изменений** | `code-review` (оси Standards + Spec) |
| **Отчёт / docs** | `doc-coauthoring` |
| **Сессия переполняется / перенос работы** | `/handoff` — команда (не скилл): сохраняет переносимый бриф в `.opencode/handoff/` |

Каждая завершённая работа проходит `verification-before-completion`: доказательства,
а не «предположительно всё ок».

Команды пользователя в `.opencode/commands/` (вызываются вручную, скиллы — нет):
`/grill-with-docs`, `/code-review`, `/handoff` (переносимый бриф вместо
lossy-compaction). Состав и обоснование набора — в `docs/specs/skills-layout.md`.

**Двухконтурное делегирование (инструментальная наработка).** Для долгих работ
планировщик `nda-planner` (T1) ведёт **живой дизайн-документ**
`.opencode/design/<slug>.md` — durable-память вне чата (слои: застыло →
промоутится; в работе; открытые вопросы). Чекпоинт по детерминированному прокси
→ ручной ре-сид окна T1; новая сессия сидируется слоями (2)+(3) + `STATUS.md`.
Запись в проект выполняет только Исполнитель `nda-executor` (T2) через
`.opencode/queue.jsonl` (pull); бриф проходит **чеклист** (одна цель, ≥1
acceptance-команда, ≤1 модуль, оценка размера, проверяемый критерий) — иначе
статус `rejected`. Метод T1 — `grilling`, `domain-modeling`, `codebase-design`.
Контракт — `docs/specs/agent-delegation.md`; инвариант писателей — ADR-010.

## Control plane и проектные subagents

- **`opencode.json`** подключает в каждую сессию ключевые инструкции: `AGENTS.md`,
  `docs/reports/STATUS.md` (живое состояние), `docs/specs/architecture.md`,
  `instructions/safety.md`, `instructions/verification.md`. Домен — в `GLOSSARY.md`
  (подключён по требованию, не в `instructions`: платим за него только когда нужно).
- **Скиллы** — `.opencode/skills/` (загружаются инструментом `skill` по требованию);
  **команды** — `.opencode/commands/` (только вручную, слэшем).
- **Проектные subagents** (в `.opencode/agents/`):
  - `e2e` — Playwright-прогоны ролей (обёртка `docs/testing/e2e-runbook.md`).
  - `nda-planner` (T1) / `nda-executor` (T2) — двухконтурное делегирование
    (pull через `.opencode/queue.jsonl`); контракт — `docs/specs/agent-delegation.md`,
    инвариант писателей — `docs/specs/adr/ADR-010-delegation-writer-separation.md`.
- Бизнес-роли (master/shift/operator/otk) — это роли приложения, а не engineering
  subagents; их логика в `docs/specs/*` и `server/src/routes/*`.

## Do / Don't

**Do:**
- Отвечать на русском.
- Свериться с фактическим содержимым `server/src/**` и `schema.prisma` перед
  правкой (не полагаться только на README/память).
- Фиксировать новые архитектурные решения в `docs/specs/adr/`.
- Коммитить по завершении логического этапа работ (по явному согласию либо в
  рамках согласованного этапа).

**Don't:**
- НЕ переносить GAS-артефакты (modules/, GAS-скиллы, GAS-доки) из ветки
  `google-apps` в `main` без явного решения.
- НЕ удалять модели/функции, на которые ссылается другой модуль (кросс-ссылки
  через Prisma/маршруты).
- НЕ хардкодить секреты в код (`server/src/config.ts` имеет dev-дефолты — менять
  на реальные секреты при публикации).
- НЕ коммитить `server/.env`, `tests/e2e/profile/`, `.secrets/`, `.playwright-mcp/`.
- НЕ добавлять комментарии в код, если их не запросили.

## Definition of Done

- Код проходит `npm run build` + `npm run check` (стрикт-тайпчекинг ок).
- Изменения синхронны с README и `docs/specs/*`.
- Решения зафиксированы в specs при необходимости.
- **Живое состояние обновлено**: `docs/reports/STATUS.md` актуализирован
  (последний этап, открытые баги, следующий шаг, URL деплоя, коммиты).
- Деплой (Docker) согласован с пользователем; после деплоя — «тестируй».