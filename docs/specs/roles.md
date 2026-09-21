# Роли, права и роутинг «ЦифровойНаряд»

Статус: справочная спецификация. Роутинг живёт в `server/src/routes/`; таблица
ролей — `Employees` в PostgreSQL.

## Роли

| role | Интерфейс | Страница | Вью |
|---|---|---|---|
| `admin` | Администратор: аккаунты сотрудников (создание, роль, пароль, деактивация); superuser | `/admin` | `admin.ejs` |
| `master` | Начальник цеха: сводка, дерево номенклатуры, запуски на ПА, отчёты (вкладки) | `/master` | `master-app.ejs` |
| `shift` | Начальник смены: выдача нарядов операторам из запусков | `/shift` | `shift-app.ejs` |
| `operator` | Оператор: смены, наряды, тех. переходы | `/operator` | `operator.ejs` |
| `otk` | ОТК: приёмка/брак/закрытие/доработка нарядов | `/otk` | `otk-app.ejs` |

Роли — enum `EmployeeRole` в Prisma-схеме и `EMPLOYEE_ROLE` в
`server/src/lib/naryad-status.ts`.

### Выдача ролей

- **Оператор** — самозапись через `POST /api/register` (форма «Регистрация» на
  `/login`): роль `operator` проставляет сервер, выбор роли в форме отсутствует;
  после создания — авто-вход (`startSession` в `auth.routes.ts`).
- **master / shift / otk** — создаются администратором в UI `/admin`
  (`/api/admin/employees`), роль `admin` там недоступна.
- **admin** — создаётся только сидом/скриптом (`server/prisma/data/employees.json`),
  через UI второго админа не завести.

## Хранилище ролей

Таблица `Employees`:

| Поле | Тип | Использование |
|---|---|---|
| `login` | `String @id` | Идентификатор входа |
| `password` | `String` | **bcrypt-хэш** (не открытый текст) |
| `fullName` | `String` | Отображаемое имя |
| `role` | `EmployeeRole` | `admin` / `master` / `shift` / `operator` / `otk` |
| `isActive` | `Boolean @default(true)` | Деактивация: `false` блокирует вход (`403`) и скрывает из списков операторов |

## Авторизация

- `POST /api/login` (`server/src/routes/auth.routes.ts`) — bcrypt-сверка,
  возвращает `{ accessToken, user }` + куку `nd_refresh`; `POST /api/register` —
  самозапись оператора. Общий помощник `startSession`.
- `accessToken` (12ч) — JWT с payload `{ login, fullName, role }`; refresh (7д) —
  httpOnly-кука.
- `requireAuth(...roles)` (`server/src/middleware/auth.ts`) проверяет
  `Authorization: Bearer <token>` и роль **из подписанного токена** — спуфинг
  роли через URL невозможен. Роль `admin` проходит любой ролевой фильтр
  (superuser).
- Клиент: `server/src/public/api.js` — `api()` добавляет Bearer, на 401 делает
  refresh и повторяет запрос; access-токен в памяти JS, refresh — в куке.

## Роутинг страниц (`server/src/routes/page.routes.ts`)

| Путь | Вью | Доступ |
|---|---|---|
| `/login` | `login.ejs` | публичная |
| `/admin` | `admin.ejs` | client-side (JWT, роль `admin`) |
| `/master` | `master-app.ejs` | client-side (JWT, роль `master`; `admin` проходит) |
| `/shift` | `shift-app.ejs` | client-side (JWT, роль `shift`; `admin` проходит) |
| `/operator` | `operator.ejs` | client-side (JWT, роль `operator`; `admin` проходит) |
| `/otk` | `otk-app.ejs` | client-side (JWT, роль `otk`; `admin` проходит) |
| `/` | редирект на `/login` | — |
| `/health` | JSON `{status, db}` | — |

Сервер отдаёт EJS-страницу без проверки роли; фактический доступ контролируется
на клиенте (отсутствие/иная роль → редирект на `/login`). Данные страниц —
только через авторизованные API.

## Источник фактов наряда (ADR-003, реализован)

- **Канон** — `WorkOrders`. Все факты наряда записываются здесь «впервые».
- **Переходы** — `Transitions` (связь по `orderNumber`, `@@unique([orderNumber, number])`).
- **Итоги закрытия** — `ClosedOrders` (пишется при закрытии ОТК).
- Оператор/ОТК читают карточку наряда из канона `WorkOrders` + переходы из
  `Transitions`.

## Кто пишет в какие таблицы

| Модель | Кто пишет | Маршрут |
|---|---|---|
| `WorkOrders` | shift (выдача), оператор (статусы), ОТК (закрытие/rework) | `workorders`, `otk` |
| `Transitions` | operator, VBA | `transitions`, `vba` |
| `ClosedOrders` | ОТК | `otk/close` |
| `Shifts` | operator | `shifts/open`, `shifts/close` |
| `Launches` | master (+ смена статуса при выдаче) | `launches`, `workorders/issue` |
| `PrintQueue` | shift (при выдаче наряда) | `workorders/issue` |

## Роль `otk`

Полный интерфейс `otk-app.ejs` + `otk.routes.ts`: очередь нарядов (ожидают ОТК /
доработка), карточка наряда с переходами (принято/брак), закрытие (guard: без
проверенных переходов запрещено, кроме `rework`-direct-close) и возврат на
доработку (`rework`).

## См. также

- `architecture.md` — модули и точки входа.
- `data-model.md` — структура записей моделей Prisma.