# Модель данных «ЦифровойНаряд»

Статус: справочная спецификация. Канон — `server/prisma/schema.prisma`.
Локальная БД: `MOSD`, пользователь `production_user`, PostgreSQL.

## Модели

### Catalog — номенклатура

Создаётся/обновляется `uploadCatalog` (`/api/vba/ingest`, action `uploadCatalog`)
и сидом (`server/prisma/data/catalog.json`). Ключ — `code` (текст).

| Поле | Тип |
|---|---|
| `code` | `String @id` |
| `name`, `designation`, `designation2` | `String` |
| `parentQty` | `Float` |
| `blankType`, `material`, `materialGrade`, `blankSize` | `String` |
| `wallThickness`, `cutLength`, `blankWeight`, `partWeight` | `Float` |
| `ppb` | `String` |
| `cutting`, `heatTreatment`, `plasma`, `turning`, `milling`, `drilling`, `fitting`, `bending`, `coating` | `Boolean` |
| `priority` | `String` |

Операции: сид/VBA маппят `'+'`, `'1'`, `'ДА'` → `true` (см. `toBool` в `vba.routes.ts`).

### Launches — запуски на ПА

Создаётся `POST /api/launches` (`launches.routes.ts`). ID — `ЗП-yyMMdd-HHmmss`.

| Поле | Примечание |
|---|---|
| `id` | `ЗП-yyMMdd-HHmmss` |
| `partCode` | FK на `Catalog.code` |
| `name`, `assembly` | строки |
| `qty` | `Float` |
| `paNumber` | напр. `001, 002` |
| `status` | `LaunchStatus`: `to_launch` → `issued` → `in_work` → `done` |
| `createdBy`, `createdAt`, `launchType`, `reason`, `relatedLaunchId` | мета |

Правила: `PUT /:id` меняет запуск только из `to_launch`; `DELETE /:id` удаляет
связанные наряды (`WorkOrders.deleteMany`). При выдаче всех нарядов запуск
переходит в `issued` (`workorders.routes.ts:66-68`).

### WorkOrders — канон наряда

**Канон цифрового наряда (ADR-003).** Создаётся `POST /api/work-orders/issue`
(shift). ID — `Н-yyMMdd-HHmmss`.

| Поле | Тип |
|---|---|
| `number` | `String @id` (`Н-yyMMdd-HHmmss`) |
| `partCode` | FK на `Catalog.code` |
| `name`, `designation`, `assembly` | `String` |
| `program`, `customer`, `sp` | `String?` |
| `operator`, `machine` | `String` |
| `qty` | `Float` |
| `status` | `WorkOrderStatus` |
| `launchId` | `Launches?` (при выдаче из запуска) |
| `reworkReason` | `String?` |

Статусы (`UpdateNaryadStatus` в `server/src/lib/transition-logic.ts`):
`created` → `in_progress` → `waiting_otk` → `closed`, а также `rework`
(«Доработка»): ОТК вернул оператору → оператор правит → снова `waiting_otk` →
`closed`.

### Transitions — тех. переходы наряда

| Поле | Тип |
|---|---|
| `id` | `String @id @default(cuid())` |
| `orderNumber` | FK на `WorkOrders.number` |
| `number` | `005, 010, 015…` (`generateTransitionNumber`, max+5) |
| `description`, `operator`, `machine` | `String` |
| `time`, `qty` | `Float` |
| `melt` | `String?` |
| `status` | `TransitionStatus`: `in_progress` / `completed` / `checked` |
| `accepted`, `defect` | `Float?` (проставляются ОТК при `check`) |
| `createdAt` | `DateTime` |

`@@unique([orderNumber, number])`. Создаётся оператором (`POST /api/transitions`)
или VBA (`createTransition`).

### ClosedOrders — итоги закрытых нарядов

| Поле | Тип |
|---|---|
| `id` | `String @id @default(cuid())` |
| `orderNumber` | FK на `WorkOrders.number` |
| `acceptedTotal`, `defectTotal` | `Float` |
| `defectReason`, `comment` | `String?` |
| `closedBy`, `closedAt` | `String`, `DateTime` |

Пишется при закрытии ОТК (`POST /api/otk/close`), агрегация из переходов
(sum accepted/defect).

### Shifts — смены операторов

| Поле | Тип |
|---|---|
| `id` | `String @id` (`СМ-yyMMdd-HHmmss`) |
| `operator`, `machine` | `String` |
| `openedAt`, `closedAt` | `DateTime` |
| `status` | `ShiftStatus`: `open` / `closed` / `auto_closed` |

Правила (`shifts.routes.ts`): максимум 2 открытые смены на оператора; станок не
должен быть занят другим оператором со статусом `open`.

### PrintQueue — очередь печати

| Поле | Тип |
|---|---|
| `id` | `DateTime @id @default(now())` |
| `orderNumber` | `String @unique` (FK на `WorkOrders`) |
| `partCode` (FK), `name`, `designation`, `assembly`, `program`, `customer`, `sp`, `operator`, `machine`, `qty` | данные наряда |
| `status` | `PrintJobStatus`: `pending` / `printed` |

Создаётся при выдаче наряда (`workorders.routes.ts:51-62`). Один job = весь наряд.

### Employees — сотрудники

`login` (@id), `password` (bcrypt-хэш), `fullName`, `role` (`EmployeeRole`).
Сид хэширует пароли через `bcrypt.hash(password, 10)`.

### Equipment — станки

`id` (Int, autoincrement), `name` (`@unique`). Сид: `Т1-1..Т1-8`. При пустой
таблице `GET /api/equipment` отдаёт дефолт `['ПА8'..'ПА12']`.

### Queue — очередь назначений операторам

`code` (FK на `Catalog`), `name`, `designation`, `assembly`, `type`, `machines`,
`qty`, `priority`, `customer`, `sp`, `program`, `operator`, `issueMachine`,
`issue` (bool), `status`. **Зарезервирована** — не питается ни одним route.

## Статусы жизненного цикла

Общий словарь статусов — единый перечень (ADR-005); машиночитаемая копия —
`server/src/lib/naryad-status.ts` (+ enum в `schema.prisma`), подписи для UI —
`NARYAD_STATUS_LABELS`.

| Сущность | Значения |
|---|---|
| `WorkOrders.status` | `created` → `in_progress` → `waiting_otk` → `closed`, а также `rework` |
| `Launches.status` | `to_launch` → `issued` → `in_work` → `done` |
| `Transitions.status` | `in_progress` → `completed` → `checked` |
| `Shifts.status` | `open` → `closed` → `auto_closed` |
| `PrintQueue.status` | `pending` → `printed` |

## См. также

- `architecture.md` — модули, хранящие данные.
- `roles.md` — кто пишет в какие таблицы.