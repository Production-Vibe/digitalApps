# STATUS.md — живое состояние проекта «ЦифровойНаряд»

> Единая всегда-актуальная сводка для быстрого входа в контекст нового диалога.
> Читать при старте каждого диалога (см. AGENTS.md → приоритет чтения).
> Обновлять по завершении каждого этапа (см. AGENTS.md → Definition of Done).

## Стек и ветки

- **`main`** — новый стек: Node/Express (TypeScript) + EJS + Prisma + PostgreSQL,
  JWT + bcrypt. Монолит без UI-фреймворков. Локальная БД `MOSD`
  (`production_user`). Деплой — Docker + PM2 (в доводке).
- **`google-apps`** — легаси Google Apps Script (модули, GAS-скиллы, GAS-доки,
  E2E против `/exec`, манифест деплоя). В `main` не переносить без явного решения.
- Код-модули: `server/src/**`; схема БД (канон) — `server/prisma/schema.prisma`
  (10 моделей, 6 enum).

## Последний завершённый этап

- **11.09.2026 — Rework-цикл оператора восстановлен.** `GET /api/work-orders/my/list`
  (`server/src/routes/workorders.routes.ts:78`) теперь включает `rework` в фильтре
  статусов (`['created','in_progress','rework']`). Проверено end-to-end через API:
  ОТК вернул наряд (`naryad rework`) → оператор увидел его в `/my/list` →
  добавил переход (`waiting_otk`) → ОТК проверил и закрыл (`closed`). Обнаружен
  при репродукции отдельный XSS-уровневый дефект: сервер падает при битом
  `partCode` в `/issue` (P2003 — нет глобального error-handler'а, см. TODO).
  Проверки: `npm run build` + `npm run check` PASS, E2E 18/18 PASS.
- **11.09.2026 — E2E на `localhost:3000` адаптирован (JWT-стек), 18/18 PASS.**
  Харнесс `tests/e2e/` переписан под новый стек: `config.py` (APP_URL
  `http://localhost:3000`, CREDS из сида, LANDING → `/master|/shift|/operator|/otk`),
  `helpers.py`/`runner.py` (full-page селекторы, JWT-логин через `/login`, без
  Google-сессии/фреймов), `test_{operator,otk,master,shift}.py` — проверка
  входа, отрисовки страницы роли и F5-редиректа. GAS-харнесс
  (`session_setup.py`, `flows.py`, `seed_*.py`, `test_bizcycle.py`,
  `test_otk_full.py`) удалён из `main` (копия — ветка `google-apps`).
  Прогоны: operator 6/6, otk 4/4, master 4/4, shift 4/4 — итого **18/18 PASS**.
  `docs/testing/e2e-runbook.md` актуализирован.
- **11.09.2026 — Документация и Docker-контур под new-стек (docs+Docker).**
  Переписаны под Node/Express+Prisma+PostgreSQL: `AGENTS.md`, `README.md`,
  `docs/specs/`, `docs/testing/e2e-runbook.md`, `instructions/{safety,verification}.md`,
  `.opencode/agents/e2e.md`, `server/docs/vba-integration.md`, STATUS.md.
  Docker: исправлен `docker-compose.yml` (context/`dockerfile`/`env_file` через
  `server/`, `DATABASE_URL` сервиса `app` → host `db`, `prisma db seed`),
  добавлены `docker-compose.dev.yml`, `.dockerignore`, обновлён `Dockerfile`
  (build-tools bcrypt, `prisma/` целиком), `server/docs/onboarding.md`,
  `.env.example`. Проверки: `npm run build` + `npm run check` PASS, `/health` OK.
  Docker-CLI нет — `docker compose up --build` не прогонялся.
- **10.09.2026 — Адаптация репозитория под новый стек.** Создана ветка
  `google-apps`, `main` fast-forward на `future` + удалены Google-артефакты
  (modules/, digitalapps-deploy-скилл, GAS-доки, `Мастер-промпт.md`).
- **09.09.2026 — Проверка локального стека (пробы A–E, все PASS).** MCP-postgres
  против локального `MOSD` (PG 18.1, `production_user`): миграция
  `20260910105412_init` применена; 6 enum соответствуют `schema.prisma`; сид —
  каталог 29 позиций, 4 роли (bcrypt), станки Т1-1..Т1-8;
  бизнес-таблицы пусты (Shifts: 1 хвост smoke). Playwright: `localhost:3000`
  рендерит `/login`. Версия рабочего стека без деплоя (локальный dev).

## Открытые баги / TODO

- [ ] **Нет глобального error-handler'а (HIGH, надёжность).** Асинхронный throw в
  хендлерах роутов (напр. P2003 при битом `partCode` в `/issue`) не перехватывается —
  Express 4 роняет процесс, сервис «зависает» (ConnectionReset на клиенте). Нужен
  оберточный `asyncHandler` + финальный error-middleware в `server/src/app.ts`.
- [ ] **Docker-деплой не проверен вживую:** конфиг исправлен (context/`dockerfile`/
  `env_file`, `DATABASE_URL` сервиса `app` → host `db`, добавлен `prisma db seed`,
  Dockerfile копирует `prisma/` целиком), но `docker compose up --build` на
  чистом окружении не прогонялся (на рабочей машине нет Docker-CLI).
- [ ] **E2E покрывает только вход+рендер+refresh** (18/18 PASS); полный
  бизнес-цикл (выдача → оператор → ОТК → rework → закрытие) не автоматизирован —
  кандидат следующего этапа после восстановления rework-цикла.
- [ ] **Master урезан против GAS:** нет Dashboard/дерева/сводки занятости ПА,
  нет read-эндпоинта и экрана очереди печати (`PrintQueue` пишется при выдаче).
- [ ] (опц.) Выделить сервисный слой инвариантов (закрытие, accepted+defect≤qty,
  занятость станка) — пока rules живут в хендлерах.
- [ ] (опц.) Модель `Queue` в схеме, но не питается ни одним route: использовать
  или удалить.
- [ ] (опц.) `ClosedOrders` — запись-дубликат итогов; рассмотреть пересчёт
  проекцией из переходов.
- [ ] Безопасность перед публикацией: rate-limit на `/login`, сменa dev-секретов
  (`config.ts`), https, политика `localStorage`-токенов.

## Закрытые баги (new-стек)

- ✅ **Авторизация роль-в-URL → JWT роли-в-токене** (ADR-002 осн. узел).
  Спуфинг роли через URL невозможен: роль в подписанном сервером payload,
  пароли bcrypt.
- ✅ **Канон наряда сведён к `WorkOrders`** (ADR-003) в новом стеке; переходы —
  `Transitions` (FK, уникальность `[orderNumber, number]`); итоги — `ClosedOrders`.
- ✅ **Rework-статус есть в enum** (ADR-005): `created/in_progress/waiting_otk/
  rework/closed` — единый словарь `NARYAD_STATUS` + `NARYAD_STATUS_LABELS`
  (`server/src/lib/naryad-status.ts`).
- ✅ **Перф-проблем GAS нет** (реляционная БД, индекс по `orderNumber`) —
  очередь ОТК/списки мастеров отвечают мгновенно.

## Следующий шаг

1. **Глобальный error-handler (HIGH)** — `asyncHandler`-обёртка + финальный
   error-middleware в `server/src/app.ts`, чтобы битый запрос (P2003) не ронял
   процесс.
2. **Docker-проверка** `docker compose up --build` на машине с Docker-CLI
   (после этого деплой перестанет быть «бумажным»).
3. Master: Dashboard + очередь печати (минимум); далее безопасность
   (rate-limit, секреты вне defaults).

## Активный URL

- Локальный dev: `http://localhost:3000` (`GET /health` — `{status:'ok', db:'ok'}`).
- Прод-деплой (Docker) — не выполнялся; журнал деплоев new-стек введём отдельно
  (аналог `docs/reports/deploy-manifest.md`, там пока легаси GAS — в ветке `google-apps`).

## Справочники

- Архитектура/роли/данные: `docs/specs/architecture.md`, `docs/specs/roles.md`,
  `docs/specs/data-model.md`.
- E2E-алгоритм запуска: `docs/testing/e2e-runbook.md` (актуален: 18/18 PASS
  против `localhost:3000`).
- VBA REST-интеграция: `server/docs/vba-integration.md`.
- Отчёт с приоритетами паритета: `docs/reports/2026-09-10-future-architecture-review.md`.