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

- **10.09.2026 — Адаптация документации и репозитория под новый стек.**
  `main` переведён на new-стек: ветка `google-apps` создана из прежнего `main`
  (снимок GAS-стека), `main` обновлён до `future` (Node/Express+Prisma+PG) и
  зачищен от Google-артефактов (модули/скиллы/доки GAS-деплоя перенесены в
  `google-apps`). Переписаны: `AGENTS.md`, `README.md`, `docs/specs/`
  (`architecture.md`, `roles.md`, `data-model.md`), `instructions/safety.md`,
  `instructions/verification.md`, `.opencode/agents/e2e.md` (под JWT-стек).
  Изменённые файлы: server/src/** (полностью), server/prisma/** (полностью),
  server/Dockerfile, server/docker-compose.yml, server/ecosystem.config.cjs,
  opencode.json (MCP), .gitignore. Отчёты (новый стек): см. ниже.
- **09.09.2026 — Проверка локального стека (пробы A–E, все PASS).** MCP-postgres
  против локального `MOSD` (PG 18.1, `production_user`): миграция
  `20260910105412_init` применена; 6 enum соответствуют `schema.prisma`; сид —
  каталог 29 позиций, 4 роли (bcrypt), станки Т1-1..Т1-8;
  бизнес-таблицы пусты (Shifts: 1 хвост smoke). Playwright: `localhost:3000`
  рендерит `/login`. Версия рабочего стека без деплоя (локальный dev).

## Открытые баги / TODO

- [ ] **Rework-цикл оператора сломан (баг паритета, HIGH).**
  `GET /api/work-orders/my/list` (`server/src/routes/workorders.routes.ts:78`)
  фильтрует `['created','in_progress']` → наряд со статусом `rework` оператор
  не видит, обратный путь «ОТК вернул → правит → waiting_otk» непроходим
  end-to-end. Чинить первым.
- [ ] **Docker-деплой не проверен вживую:** заложен конфликт `DATABASE_URL`
  (`.env` указывает на `localhost:5432/MOSD`, в compose-сети host БД — `db`).
  Нужно переопределить `DATABASE_URL` сервису `app`, добавить `prisma db seed`,
  прогнать `docker compose up --build` на чистом окружении.
- [ ] **E2E-автомата для new-стека нет:** харнесс `tests/e2e/` завязан на GAS
  `/exec` (ветка `google-apps`). Нужен регрессионный фасад против
  `localhost:3000` (JWT-логин через `/login`).
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

1. Закоммитить документацию new-стека (docs-этап; см. коммиты ниже).
2. **Rework-цикл оператора** — включить `rework` в `/my/list` (+ проверить
   флоу «ОТК вернул → оператор правит → waiting_otk»).
3. **Docker-проверка** с фиксом `DATABASE_URL` (сервис `app` → host `db`,
   учётка сервиса `db`, добавить seed) — деплой перестанет быть «бумажным».
4. **E2E на `localhost:3000`** — адаптировать харнесс (config.py APP_URL,
   JWT-логин, CREDS из сида), вернуть эталон 18/18.
5. Master: Dashboard + очередь печати (минимум); далее безопасность
   (rate-limit, секреты вне defaults).

## Активный URL

- Локальный dev: `http://localhost:3000` (`GET /health` — `{status:'ok', db:'ok'}`).
- Прод-деплой (Docker) — не выполнялся; журнал деплоев new-стек введём отдельно
  (аналог `docs/reports/deploy-manifest.md`, там пока легаси GAS — в ветке `google-apps`).

## Справочники

- Архитектура/роли/данные: `docs/specs/architecture.md`, `docs/specs/roles.md`,
  `docs/specs/data-model.md`.
- E2E-алгоритм запуска: `docs/testing/e2e-runbook.md` (обновить под new-стек).
- VBA REST-интеграция: `server/docs/vba-integration.md`.
- Отчёт с приоритетами паритета: `docs/reports/2026-09-10-future-architecture-review.md`.