# Архитектура «ЦифровойНаряд»

Статус: справочная спецификация (уточняется при изменении структуры
сервера/схемы). Источник правды: `server/src/**`, `server/prisma/schema.prisma`.

## Цель системы

Заменить бумажные наряды цифровым потоком производства подъёмных агрегатов (ПА):

`планирование запусков` → `выдача нарядов нач. смены` → `выполнение оператором` →
`контроль ОТК` — до полной готовности партии.

## Стек

```
Excel (VBA)  →  Node.js (Express + EJS + Prisma)  →  PostgreSQL
```

- Номенклатура загружается из Excel (VBA) через REST `/api/vba/ingest`
  (`uploadCatalog`) в таблицу `Catalog`.
- PostgreSQL — единственное хранилище (10 таблиц-моделей).
- Node.js — серверная логика + веб-интерфейсы ролей (EJS-страницы, JWT-авторизация).

## Модель данных

Канон — `server/prisma/schema.prisma` (10 моделей):

| Модель | Назначение | Заполняется |
|---|---|---|
| `Catalog` | Полная номенклатура | VBA / seed |
| `Launches` | Запуски на конкретные ПА | master (`POST /api/launches`) |
| `WorkOrders` | Цифровые наряды операторов (канон наряда) | shift (`POST /api/work-orders/issue`) |
| `Transitions` | Технологические переходы наряда (FK по `orderNumber`) | оператор / VBA |
| `ClosedOrders` | Итоги закрытых нарядов | ОТК (`POST /api/otk/close`) |
| `Shifts` | Смены операторов и их станки | оператор (`open`/`close`) |
| `PrintQueue` | Очередь печати документов | shift (при выдаче наряда) |
| `Employees` | login, bcrypt-password, fullName, role | seed / администрирование |
| `Equipment` | Справочник станков | seed / администрирование |
| `Queue` | Очередь назначений операторам | зарезервирована (не питается routes) |

## REST-модули

Все API-модули — в `server/src/routes/*.ts`, подключены в `server/src/app.ts`:

| Модуль | Префикс | Публичные методы |
|---|---|---|
| `auth.routes.ts` | `/api` | `login`, `refresh`, `me` |
| `page.routes.ts` | `/` | `GET /login`, `/master`, `/shift`, `/operator`, `/otk` (EJS) |
| `catalog.routes.ts` | `/api/catalog` | `GET /`, `GET /:code`, `GET /tree/units` |
| `equipment.routes.ts` | `/api/equipment` | `GET /`, `POST /`, `DELETE /:id` |
| `launches.routes.ts` | `/api/launches` | `GET /`, `GET /pa/occupied`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `workorders.routes.ts` | `/api/work-orders` | `GET /`, `POST /issue`, `GET /my/list`, `GET /my/closed`, `PUT /:number/status` |
| `shifts.routes.ts` | `/api/shifts` | `GET /active-operators`, `GET /my`, `POST /open`, `POST /close/:id` |
| `transitions.routes.ts` | `/api/transitions` | `GET /`, `POST /`, `POST /complete`, `POST /check` |
| `otk.routes.ts` | `/api/otk` | `GET /queue`, `GET /naryad/:number`, `POST /close`, `POST /rework`, `GET /closing-info/:number` |
| `employees.routes.ts` | `/api/employees` | `GET /` |
| `vba.routes.ts` | `/api/vba` | `POST /ingest` (X-VBA-Secret) |

## Точки входа и авторизация

- `GET /login` — страница входа (EJS). `POST /api/login` — bcrypt-сверка по
  `Employees`, выдаёт `accessToken` (12ч) + `refreshToken` (7д) + `user`.
- Страницы `/master|/shift|/operator|/otk` рендерятся сервером (EJS), фактический
  доступ — на клиенте (`localStorage` + редирект на `/login`). Данные — только
  через авторизованные API (`requireAuth(...roles)`).
- JWT-содержимое: `{ login, fullName, role }`. Роль в подписанном токене —
  спуфинг через URL невозможен.
- VBA: `POST /api/vba/ingest` с `X-VBA-Secret`.

## Жизненный цикл работы (end-to-end)

1. **Загрузка номенклатуры:** Excel (VBA) → `uploadCatalog` → `Catalog`.
2. **Планирование запусков:** master → `POST /api/launches` (код детали, кол-во,
   № ПА, тип) → `Launches` со статусом `to_launch`.
3. **Выдача нарядов:** shift выдаёт наряд (оператор → станок → количество) →
   `POST /api/work-orders/issue` → `WorkOrders` (`created`) + `PrintQueue`.
   Полная выдача переводит запуск в `issued`.
4. **Выполнение:** оператор активирует смену (`POST /api/shifts/open`, станок),
   принимает наряд в работу (`in_progress`), отмечает тех. переходы
   (`POST /api/transitions`). Все переходы выполнены → `waiting_otk`.
5. **Контроль ОТК:** ОТК проверяет переходы (`POST /api/transitions/check`,
   `accepted`/`defect`), закрывает наряд (`POST /api/otk/close`) → `closed` +
   итоги в `ClosedOrders`. Возврат на доработку (`POST /api/otk/rework`) →

6. `rework` → оператору, правит, снова `waiting_otk` → `closed`.
7. **Печать (VBA-этап):** при выдаче создаётся job в `PrintQueue`; печать
   комплекта приложений — VBA-слушателем.

## Docker-контуры

- `server/docker-compose.yml`:
  - сервис `db` — `postgres:16-alpine`;
  - сервис `app` — сборка `server/Dockerfile` (builder: `prisma generate` + `tsc`;
    runtime: node + `dist`), старт `prisma migrate deploy && node dist/app.js`.
- Локальный dev — `npm run dev` (`tsx watch src/app.ts`) против локального `MOSD`.
- Секреты — `server/.env` (не в git; шаблон `server/.env.example`).

## Технические конвенции

- Один Express-процесс, доменное разбиение на routes.
- Валидация/инварианты: OТК-закрытие требует проверенные переходы (кроме
  `rework`-direct-close), `accepted+defect ≤ qty`, запуск меняется только из
  `to_launch`, смена не открывается на занятый станок.
- ID: `Н-yyMMdd-HHmmss` (наряд), `ЗП-…` (запуск), `СМ-…` (смена); переходы —
  `005, 010, 015…` (`server/src/lib/id.ts`).
- Статусы — единые константы `server/src/lib/naryad-status.ts` (+ по enum в
  Prisma-схеме).
- Дата в UI: `dd.MM.yyyy HH:mm` (`fmtDate` в `api.js`).

## См. также

- `roles.md` — роли, интерфейсы, роутинг.
- `data-model.md` — структура записей моделей Prisma.
- `server/docs/vba-integration.md` — VBA REST-интеграция.