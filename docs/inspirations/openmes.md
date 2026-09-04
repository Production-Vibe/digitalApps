# OpenMES — референс инспираций

**Дата:** 04.09.2026
**Тип:** Аналитическая справка (внешний референс). **Не** деплоится.
**Источник:** клон `github.com/Mes-Open/OpenMes` (Laravel 12 MES), временный путь
`C:\Users\<user>\AppData\Local\Temp\opencode\OpenMes`.
**Назначение:** изучить зрелую open-source MES, чтобы переносить её чистые
паттерны в «ЦифровойНаряд» (Google Таблицы + Apps Script). Ориентиры, а не
прямые рецепты — архитектуры разные (монолит из двух контейнеров против
бессерверного GAS).

---

## 1. Обзор OpenMES

- Open-source **MES** (Manufacturing Execution System) для малых производителей:
  деревообработка, металлообработка, пластик, сборка.
- Стек: **Laravel 12** (Blade + Livewire 4 + Alpine.js), **PostgreSQL 17+**,
  Docker Compose (2 контейнера), инкрементальная миграция фронтенда на
  React/Inertia.
- Мультиарендность через `tenant_id`-колонку (глобальный scope) — почти даром
  даёт изоляцию строк.
- Tablet-first UX для операторов, offline (PWA) с очередью действий.
- Фронтенд: Blade + Livewire 4 + Alpine.js справа, постепенный переход на
  React/Inertia (страницы добавляются инкрементально без затрагивания остального).

---

## 2. RBAC / роли

### Как у OpenMES
- **Три роли** — `Admin` (всё), `Supervisor` (чтение + управление производством),
  `Operator` (только свои линии). Источник: `backend/database/seeders/RolesAndPermissionsSeeder.php`.
- Плоский набор permission-строк (`view work orders`, `create issues`, …), роль =
  просто группа строк. Проверка — атомарным `can('verb')` в Policies.
- **Line-scoping:** оператор видит только строки своей линии
  (`WorkOrderPolicy::view` + `WorkOrder::scopeForUser`, `WorkOrder.php:653-663`).
- **Матрица роль × вкладка**: `TabAccessMiddleware` + `TabRegistry` вместо
  blanket `role:Admin`; `Gate::before` — Admin проходит все `tab:*` (страховка,
  `AppServiceProvider.php:98-104`).
- Рабочие станции: аккаунт `workstation` vs обычный пользователь
  (`User::isWorkstationAccount`).

### Переносимость в «ЦифровойНаряд»
- Роль уже живёт в листе `Сотрудники` (`login | password | ФИО | role`), но
  серверной сессии нет (см. `docs/specs/adr/auth-server-side-absent.md`) — роль
  из URL спуфится. Развивать: сверять субъекта действия через `Сотрудники`
  (как сделано в `isRole` у `closeNaryad`).
- **Line/станок-scoping:** оператор уже открывает станок в сменах. Можно
  фильтровать доступные наряды по станку/линии смены (аналог `scopeForUser`).
- Матрица «роль × область» переносится в `doGet`-роутинг по `?page=`
  (у нас уже ролевой роутинг).

---

## 3. Жизненный цикл Work Order / Batch

### Как у OpenMES
- Статусы WO: `PENDING, ACCEPTED, IN_PROGRESS, BLOCKED, PAUSED, CHANGE_HOLD, DONE, REJECTED, CANCELLED` (`WorkOrder.php:58-80`); группировки `ACTIVE/TERMINAL/HELD`.
- **Декларативная таблица переходов** — `WorkOrderService::transitions()`:
  каждая строка `{from:[...], to, verb, error}` + центральные
  `canTransition()` / `applyTransition()`. Никаких разбросанных `if` по статусам.
- **Derived-статус:** `updateWorkOrderStatus()` пересчитывает WO из детей —
  есть блокирующий issue → `BLOCKED`; все шаги done → `DONE`; любой шаг active →
  `IN_PROGRESS`; иначе `PENDING`.
- BatchStep: `PENDING → READY → IN_PROGRESS → DONE` (+ `SKIPPED`); `READY` =
  «следующий в очереди»; `promoteReadySteps()` идемпотентно продвигает шаги,
  чей prerequisite выполнен (`Batch.php:162-173`).
- **Блокировки:** блокирующий тип issue → WO `BLOCKED`, авто-разблокировка при
  resolve (блокирует старт следующего шага / отпуск партии).

### Переносимость в «ЦифровойНаряд»
- У нас статусы наряда `created → in_progress → waiting_otk → closed` и запуска
  `К запуску → Выдано → Готово` размазаны по коду. **Кандидат:** одна таблица
  переходов `{from,to,verb}` + центральный `applyTransition()` — меньше тупых
  багов, проще аудит переходов.
- **Derived-статус запуска** из нарядов: «Готово» только когда все наряды
  закрыты ОТК, «В работе» — есть хоть один `in_progress/waiting_otk`.

---

## 4. Quality / NCR / Disposition / Scrap — референс для ОТК

### Как у OpenMES
- **Несоответствие (Issue):** `OPEN → ACKNOWLEDGED → RESOLVED → CLOSED`
  (`Models/Issue.php:18-24` + `Services/IssueService.php`). Капча: `reported_at`,
  `resolved_at`, `closed_at`, `reported_by_id`, `assigned_to_id`, `non_conforming_qty`,
  `root_cause`, `containment_action`, `nc_source`.
- **Disposition** (`Enums/IssueDisposition.php` + `DispositionService.php`):
  `pending → scrap | rework | use_as_is | return_to_supplier`; транзакционно,
  отказ от сброса в `pending`; маппинг на статус партии
  (`scrap → REJECTED`, `rework/quarantine → QUARANTINE`, `accept → RELEASED`).
- **CAPA-действия** (`IssueAction`): `OPEN → IN_PROGRESS → DONE → VERIFIED`; типы
  corrective/preventive/containment; **закрытие родительского issue заблокировано,
  пока не все действия VERIFIED** (`IssueActionService`).
- **Частичная приёмка:** `conditional_pass` (все обязательные критерии прошли, но
  есть отклонение по необязательным) — партия всё же отпущена, но с флагом.
  Плюс «accept_with_deviation».
- **Scrap:** `ScrapEntry` (work_order, scrap_reason, quantity, shift, reported_by/at);
  scrap НЕ мутирует `produced_qty` — качество это производная метрика
  `qualityPct = (produced − scrap)/produced` (`WorkOrder.php:616-627`). Причины
  брака — категории 5M (material/machine/method/man/environment).
- **Quality-триггеры** (`QualityTriggerService`): «контроль почти готов» по правилам
  `every_n_units`, `every_n_minutes`, `after_downtime`, `after_setup`, `roaming`; при
  провале контроля создаётся Issue; `is_blocking` останавливает производство.

### Переносимость в «ЦифровойНаряд» (это карта для ОТК-этапа)
- Расширить `closeNaryad`: фиксировать не просто `closed`, а **disposition**
  (брак/принято/доработка/как есть) + `non_conforming_qty` (частичный брак наряда) +
  `root_cause` + `closed_by/closed_at`.
- **Частичная приёмка** = часть наряда принята ОТК, часть брак — ввести поля
  `total_accepted` / `total_defect` (частючно уже есть в `closeNaryad`).
- **Причина брака** — справочник категорий (аналог 5M) вместо свободного текста.
- Брак не должен вычитать «выдано» — держать как отдельный учёт (метрика качества).
- CAPA-блокировка: если на наряде есть незакрытые действия → не закрывать.

---

## 5. Immutable audit / traceability

### Как у OpenMES
- Трейт `Auditable` (`Traits/Auditable.php`): на create/update/delete пишет
  `audit_logs` строку (`user_id`, `entity_type/id`, `action`, `before/after` JSON,
  `ip_address`, `user_agent`); удаляет sensitive-колонки.
- **Аппенд-онли:** `AuditLog` без `updated_at` (+ хуки `updating/deleting` бросают
  `RuntimeException`) — строки нельзя изменить/удалить через ORM.
- **Stamping на строке:** каждая сущность несёт `reported_by/at`, `started_by_id`,
  `completed_by_id`, `deleted_by_id` — «кто и когда» прямо в данных.
- Traceability-граф: рёбра «какой лот в какой шаг, кем, когда» → recall-impact BFS.

### Переносимость в «ЦифровойНаряд»
- Проставлять `created_by` / `created_at` / `closed_by` / `closed_at` на нарядах
  (частично есть). Добавить при желании append-only журнал действий
  (`Журнал`/`Лог`) — в GAS аналог «модель отказывается от update» = append-only
  лист, из которого UI просто не даёт править, + защита диапазона листа.
- `Закрытые` уже append-only — это основа журнала закрытий.

---

## 6. Событийный фан-аут

### Как у OpenMES
- Наблюдатели (`WorkOrderEventObserver`, `BatchStepEventObserver`) шлют доменные
  события (`WorkOrderCompleted`, `StepStarted`, ...) на любом save-пути; сайд-эффекты
  (`GenerateWorkOrderStockDocuments`, webhooks, `ResourceChanged`) подписаны отдельно.
- **Сайд-эффекты вне ядра:** событие `fire()` защищается — упавший слушатель не
  ломает переход статуса (сам переход уже произошёл).

### Переносимость в «ЦифровойНаряд»
- Уже используем `onEdit` (Planning → Queue → WorkOrders) + `doPost` для VBA.
- Правило: побочные эффекты (пересчёт KPI, оповещения, очередь печати) держать
  **вне** функции перехода статуса, чтобы исключение в эффекте не откатило
  основной write.

---

## 7. Что взять в этап ОТК (чек-лист)

1. **Disposition** при закрытии наряда (принято / принято с отклонением /
   доработка / брак / как есть).
2. **Частичный брак** — `non_conforming_qty` + `total_accepted/total_defect`.
3. **Root cause / причина брака** — справочник категорий (5M-подобный).
4. **«Кто и когда»** — `closed_by` (уже через `isRole` otk) + `closed_at`.
5. **Append-only журнал закрытий** (лист `Закрытые` уже есть) + аудит переходов.
6. **Derived-статус запуска** из нарядов (Готово ⇐ все наряды closed).
7. (Опц.) **Блокировки/триггеры качества** — промежуточные проверки ОТК.

---

## 8. Кандидаты roadmap (приоритизировано)

| # | Идея | Откуда | Приоритет |
|---|---|---|---|
| 1 | Декларативная таблица переходов + центральный `applyTransition()` для статусов наряда/запуска | §3 | Средний (рефакторинг) |
| 2 | ОТК: disposition + частичный брак + root cause + журнал | §4 | **Высокий (следующий этап)** |
| 3 | Actor/timestamp-stamping на нарядах/переходах + append-only журнал | §5 | Средний |
| 4 | Line/станок-scoping оператора по смене | §2 | Средний |
| 5 | Quality-триггеры и блокировки (контроль через N шт., после простоя) | §4 | Низкий |

---

## 9. Источники (временный клон)

Ключевые файлы изучены (README + explore-анализ):
- RBAC: `backend/database/seeders/RolesAndPermissionsSeeder.php`, `backend/app/Policies/*`,
  `backend/app/Http/Middleware/TabAccessMiddleware.php`, `backend/app/Support/TabRegistry.php`.
- Lifecycle: `backend/app/Models/WorkOrder.php`, `backend/app/Services/WorkOrder/WorkOrderService.php`,
  `backend/app/Services/WorkOrder/BatchService.php`, `backend/app/Models/Batch.php`, `BatchStep.php`.
- Quality/Scrap: `backend/app/Models/Issue.php`, `IssueAction.php`, `Inspection.php`,
  `backend/app/Enums/IssueDisposition.php`, `backend/app/Services/Quality/*`,
  `backend/app/Services/Scrap/ScrapReportService.php`.
- Audit: `backend/app/Traits/Auditable.php`, `backend/app/Models/AuditLog.php`,
  `backend/app/Services/Traceability/TraceabilityService.php`.

> Клон временный (`AppData\Local\Temp`); при необходимости клонировать повторно:
> `gh repo clone Mes-Open/OpenMes`.
> ⚠️ OpenMES лицензирован **AGPL-3.0** — не переносить код дословно без учёта
> лицензионных обязательств; использовать только как идеи/паттерны.
