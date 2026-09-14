# Отчёт 14.09.2026 — Этап 3: аналитика мастера

## Что сделано

Роль `master` получила «полную картину» (паритет с GAS-противом) из единого
серверного источника метрик, без дублей GAS-типа.

**Сервер**
- `server/src/lib/analytics.ts` — `getDashboard(from, to)`: все агрегации
  определены один раз. Ground truth — факты (`WorkOrders`/`Transitions`/
  `Shifts`/`ClosedOrders`), не хрупкий `Launches.status`.
- `server/src/routes/analytics.routes.ts` — `GET /api/analytics/dashboard`
  (роль `master`), `?from=&to=` для отчётов (дефолт 30 дней по
  `ClosedOrders.closedAt`).
- `server/src/lib/catalog-tree.ts` — группировка номенклатуры по узлам
  (`designation.split('-')[0]`), вынесена из `catalog.routes.ts`; `/api/catalog/tree/units`
  переведён на неё (калька структуры — один раз).
- `server/src/app.ts` — смонтирован `/api/analytics`.

**Ответ `GET /api/analytics/dashboard`**
- `summary.launchesByStatus` + `ordersByStatus` (вкл. `rework` и `closed`);
  `paLoad` — «Загруженность ПА» по активным запускам (группировка `paNumber`);
  `machinesBusy` (открытые смены) + `machinesIdle`.
- `nomenclature` — дерево узлов с метриками позиции: активные запуски, наряды
  в работе (`created|in_progress|rework`), закрыто; итоги по узлу.
- `reports` — выполнение за период (закрыто/объём/принято/брак %/нормо-часы) +
  разрезы по операторам и станкам (join `ClosedOrders → WorkOrders →
  sum(Transitions.time)`).

**UI `/master`** — вкладки «Сводка / Планирование / Номенклатура / Отчёты»
(JS-переключение панелей; «Планирование» — прежний экран без изменений;
дефолт — «Сводка»). Стили вкладок — `styles.css` (`.tab-btn`).

**Терминология** зафиксирована в `docs/specs/analytics-master.md`:
«Загруженность ПА» (активные запуски) ≠ «Занятые станки» (открытые смены) —
две разные метрики с явными источниками.

## Как проверено

- `npm run build` + `npm run check` — PASS.
- API-smoke против локального сервера (`tsx` на :3100, БД MOSD/dev):
  shape ответа, фильтр периода (январь → 0 закрытых), агрегация на реальном
  заказе (qty=10, брак 1 → 10%, время 0.5), `paLoad` после создания/удаления
  запуска, метрики номенклатуры по коду.
- Деплой `docker compose up -d --build` (сервер/stенд :3000, БД digital_narad):
  `/health` ok, `/api/analytics/dashboard` отвечает.
- E2E штатный: **26/26 PASS** — operator 6/6, otk 4/4, shift 4/4, master
  **12/12** (добавлена проверка вкладок: каждая активна + контент виден).
- Playwright-probe на стенде с созданным запуском: Сводка (Загруженность ПА
  `004`/7, Станки/Свободны, карточки), Номенклатура (summary узлов с
  «в запуске/в работе/закрыто»), Отчёты (блоки по операторам/станкам) — **ALL
  PASS**. Пробный запуск удалён, БД приведена в чистый вид (Orders/Closed/
  Transitions/Launches = 0, Shifts = 3 — оставлены тестовые смены пользователя).

## Попутно выяснилось (важно для окружения)

- **Два PostgreSQL-контура:** `docker-compose` инжектит `DATABASE_URL` на host
  `db` (БД **`digital_narad`**, юзер `user`) — это боевой стенд :3000; а локальный
  dev (`npm run dev` / `server/.env`) ходит по `localhost:5432` в **`MOSD`**
  (`production_user`), который сейчас держит **локальный Windows-PostgreSQL**
  (в контейнере `MOSD` нет — проверено: `digital_narad/postgres/template*`).
  STATUS.md 14.09 утверждал, что локальный PG остановлен и :5432 держит Docker-PG —
  фактически это уже не так (или стало вновь). Данные дев- и стенд-контуров
  различаются; рабочий прогон E2E идёт против стендовой `digital_narad`.
  Действие: уточнить/зафиксировать в STATUS.md (см. ниже) — конфликт портов 5432
  между локальным PG и docker-db остаётся риском при локальном dev.

## Что осталось

- E2E-кейс аналитики: браузерная проба сделана, в харнесс не вынесена (как и
  кейсы оператора «закрытая смена в истории»). Полный бизнес-цикл E2E — кандидат
  следующего этапа.
- «Брак по причинам» (`defectReason`) — не делалось (по согласованию), бэклог.
- `Launches.status=in_work` не выставляется динамически (показывается «как есть»).
- Полный E2E бизнес-цикла (выдача → оператор → ОТК → rework → закрытие).

## Следующий шаг

Полный E2E бизнес-цикла и/или безопасность перед публикацией (rate-limit `/login`,
refresh в httpOnly-cookie, секреты из env). После деплоя этого этапа — «тестируй».

## Docs

- new `docs/specs/analytics-master.md`.
- edit `docs/specs/architecture.md` (модуль `/api/analytics`), `docs/specs/roles.md`
  (описание мастера), runbook ожидаемых счётов E2E (26/26).

## Коммиты

- (committed on stage close)