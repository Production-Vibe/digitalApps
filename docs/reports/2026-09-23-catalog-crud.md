# Этап 16 — справочник номенклатуры в UI (CRUD каталога)

Дата: 23.09.2026. Контур: `main` (Node/Express + EJS + Prisma + PostgreSQL).
Дизайн: `docs/superpowers/specs/2026-09-23-catalog-crud-design.md`, план:
`docs/superpowers/plans/2026-09-23-catalog-crud.md`.

## Что сделано

Каталог (`Catalog`, 2208 позиций) получил ведение **из приложения**: master и
admin могут создавать, редактировать и удалять позиции — раньше номенклатура
попадала в систему только импортом из Excel/VBA/сидом.

**Бэкенд** (`server/src/routes/catalog.routes.ts`, под `requireAuth('master')` —
admin проходит как superuser):

1. `POST /api/catalog` — создание позиции: код обязателен (400), дубль → 409
   (pre-check + P2002), числовые поля округляются `roundSmart`, флаги
   обработок — `'+'/'1'/'да'` → true (`toBool`).
2. `PUT /api/catalog/:code` — редактирование; при **смене кода** — одна
   `$transaction`: создание новой записи + каскад `updateMany` ссылок
   `Launches.partCode/WorkOrders.partCode/PrintQueue.partCode/Queue.code` +
   удаление старой; ответ `{ …, codeChanged: true, moved: {launches, workOrders,
   printQueue, queue} }`.
3. `DELETE /api/catalog/:code` — удаление только свободного кода; занятый → 409
   `{error:'Код используется', refs:{…}}`.

**Клиент** — общий Vanilla-JS компонент `server/src/public/catalog-manager.js`
(`CatalogManager.mount/setTree`): панель «Справочник номенклатуры» (тулбар с
поиском от 2 символов → плоская таблица, дерево номенклатуры, кнопка
«+ Добавить позицию»), CRUD-модалка (13 текстовых/числовых полей + 9 флагов
обработок), подтверждение при смене кода с числом обновлённых ссылок из `moved`
в тосте, удаление с подтверждением и ошибкой 409 в тосте.

- **`/master`** — вкладка «Номенклатура» стала редактором: mount один раз,
  `setTree(units)` из `/api/analytics/dashboard` (метрики поддерева), после CRUD
  `onChanged: loadDashboard` → метрики пересчитываются на сервере.
- **`/admin`** — новый таб «Номенклатура» (навигация «Сотрудники | Номенклатура»)
  на том же компоненте; сам грузит `/api/catalog/tree/units`.
- Стили в `styles.css`: `.catalog-toolbar`, `.tree-actions` (✎/🗑 по hover),
  `.cm-flags`.

Существующие GET-маршруты каталога и Excel-импорт (резерв; merge — отдельный
шаг дорожки) не менялись.

## Как проверено

- `cd server && npm run build` + `npm run check` — PASS (после `npm ci` + `npx
  prisma generate` — npm ci не запускает postinstall Prisma-клиента).
- Деплой: образ пересобран (`docker compose up -d --build`), `/health` →
  `{status:'ok', db:'connected'}`.
- **E2E `tests/e2e/test_catalog_crud.py` — 15/15 PASS**: create master 201,
  дубль 409, пустой код 400, shift 403; PUT без смены кода 200; **смена кода с
  каскадом** — создан тестовый запуск на `CODE_A`, PUT `CODE_A→CODE_B` →
  `codeChanged:true`, `moved.launches:1`; delete занятого → 409 с refs; запуск
  удалён → delete свободного 200; после удаления кодов нет в
  `GET /api/catalog`; GET удалённого → 404; UI `/admin` (таб «Номенклатура») и
  `/master` (вкладка «Номенклатура») — компонент смонтирован (`#cmAdd`).
- Регресс ролей после правок вью: `test_admin.py` **5/5 PASS**, `test_master.py`
  **12/12 PASS**.
- Стенд чист и живой: Catalog **2208** (без `TST-*`), Launches 3
  (`ЗП-260918-051641` `issued`, `ЗП-260918-053835/053904` `to_launch`),
  WorkOrders 1, Shifts 2, PrintQueue 1, Employees 6 (5 сид + опера «def»),
  PushSubscription 3, Notification 5 (тестовые `launch_created` от прогонов
  удалены SQL-ом по `message LIKE '%TST-PA-%'`). Живые данные пользователя не
  тронуты.

## Нюансы эксплуатации

- Пароль `admin` на стенде **отличался** от боевого (bcrypt: master/shift/
  operator/otk — совпадает, admin — нет; вероятно, менялся после Этапа 15).
  Вход admin для теста выполнен с паролем, предоставленным пользователем
  (передаётся только переменной окружения, в git не пишется); параметр БД не
  менялся. В in-memory throttle логин `admin` блокировался 15 мин после серии
  неудач — снят рестартом контейнера (`docker compose restart app`).
- `server/.env` на диске отсутствовал (gitignored) — восстановлен копией
  значений из env работающего контейнера (секреты не менялись); строка
  дев-контура `production_user:CHANGE_ME` — placeholder, пользователю указать
  реальный пароль локального `MOSD`.

## Что осталось / следующий шаг

- Этап 16 закрывает задачу «справочник номенклатуры» (скелет + логика). Фаза
  **«автозаполнение»** (выбранное «ещё кое что») — отдельный этап: обсудить
  сценарий, затем план.
- (опц.) Excel-импорт как merge (Excel = резерв, БД+UI = источник правды),
  ограничение атомарной замены зафиксировано в спёке.

## Коммиты

`d7bd4a5` feat: write-эндпоинты каталога POST/PUT/DELETE со сменой кода и защитой
удаления — `f1041f6` feat: общий компонент справочника номенклатуры — `b6c08e4`
feat: вкладка «Номенклатура» мастера — редактор справочника — `8e2a9d1` feat: таб
«Номенклатура» в /admin на общем компоненте + стили — `b44fe7d` test: e2e CRUD
номенклатуры; затем `docs` (data-model, отчёт, STATUS).