# Отчёт 21.09.2026 — Этап 14: регистрация операторов + роль Admin + администрирование сотрудников (ADR-008)

## Что сделано

Карта аккаунтов приведена к фактическому процессу: **операторы сами заводят
себе аккаунты**, начальников/ОТК заводит **админ** в новом UI, суперпользователь
несёт полную ответственность (роль `admin`, «БОГ»).

### Сервер
- `server/src/lib/naryad-status.ts` — `EMPLOYEE_ROLE` += `admin`,
  новый `EMPLOYEE_ROLE_LABELS`.
- `server/src/routes/auth.routes.ts`:
  - вынесен helper **`startSession`** (общий путь login/register/refresh/session);
  - `POST /api/register` — самозапись **только оператора**: сервер игнорирует
    любую роль в теле, валидация (login 1…40, fullName ≥2 слов, пароль ≥6 +
    подтверждение), дубль логина → `409 «Логин уже занят»` (P2002);
  - `/login`, `/refresh`, `/session` отклоняют `isActive=false` → `403
    «Учётная запись отключена»`.
- `server/src/middleware/auth.ts` — роль `admin` проходит **любой** ролевой
  фильтр (`superuser`).
- `server/src/routes/admin.routes.ts` (новое, `/api/admin`, `requireAuth('admin')`):
  - `GET /employees` — список всех сотрудников (вкл. неактивных);
  - `POST /employees` — создание; роли ∈ master/shift/operator/otk (**без admin**);
  - `PUT /employees/:login` — смена роли / сброс пароля;
  - `PATCH /employees/:login` — деактивация/активация; **сам-деактивация запрещена**
    (400 «Нельзя отключить собственный аккаунт»).
  - params — `param()` из `lib/request` (Express 5: `req.params` может быть
    `string | string[]`).
- `server/src/routes/employees.routes.ts` — `GET /api/employees` отдаёт только
  активных (`isActive=true`).
- `server/src/routes/page.routes.ts` — `GET /admin` → `admin.ejs`.

### Клиент
- `server/src/views/login.ejs` — табы **«Вход | Регистрация»** (форма с ФИО/логином/
  паролем/повтором пароля), общий `redirectByRole` (admin → `/admin`);
  после регистрации — авто-вход через `POST /api/register` → `startSession`.
- `server/src/views/admin.ejs` (новое) — таблица сотрудников (ФИО/логин/роль/статус),
  «Добавить сотрудника» (модалка), смена роли/пароля, переключатель «активен».
- guards ролевых страниц (`master-app`/`shift-app`/`operator`/`otk-app`) —
  принимают роль `admin` (superuser проходит все страницы).
- `server/src/public/styles.css` — `.auth-tabs/.auth-tab/.auth-pane/.form-grid`,
  `@keyframes fadeIn`.

### БД / сид
- `server/prisma/schema.prisma` — `EmployeeRole` += `admin`;
  `Employees.isActive Boolean @default(true)`.
- Миграция `20260921092811_add_admin_role_and_is_active` (применена на dev
  `MOSD` и на стенде при пересборке образа).
- `server/prisma/data/employees.json` — аккаунт `admin` (fullName «Администратор»,
  пароль `123`; боевые пароли — бэклог `npm run passwords`).

### E2E-харнесс
- `tests/e2e/test_admin.py` (новое, 5 проверок: вход, рендер `/admin`, создание
  сотрудника, смена пароля, деактивация), `tests/e2e/config.py` — CREDS/LANDING
  `admin`.

## Как проверено

- `npm run build` + `npm run check` — **PASS** (после `npx prisma generate`).
- **API-smoke 24/24 PASS** (`probe_api.ps1`, против стенда :3000):
  регистрация — 200 + авто-вход (session по refresh-куке), дубль логина 409,
  400-ы валидации (короткий логин/пароль, 1 слово ФИО, пароли не совпадают),
  роль в теле игнорируется (создаётся operator); admin-CRUD — создание 201,
  дубль 409, роль admin 400, смена роли+пароль → вход новым паролем, деактивация
  → логин 403 + вход другим ролем 401, реактивация → вход ок, сам-отключение 400,
  operator на `/api/admin/employees` 403, admin проходит master-роут,
  deactivated скрыт из `GET /api/employees`.
- **UI-probe 15/15 PASS** (`probe_ui.py`, Playwright): переключение табов,
  регистрация → `/operator`, `/admin` → создание через форму → вход новым
  сотрудником, admin проходит `/operator`, operator на `/admin` → `/login`,
  `/admin` без сессии → `/login`.
- Ролевой E2E **31/31 PASS** (operator 6, otk 4, master 12, shift 4, **admin 5/5**).
- Bizcycle **51/51 PASS** (регресс полного цикла не сломан).

## Попутно выяснилось (особенности среды)

- **.NET/PowerShell не отправляет Secure-куки по http** и блокирует ручной
  заголовок `Cookie` через `-Headers` — smoke долго давал ложный FAIL авто-входа.
  Проверка через `curl.exe` подтвердила: register → `nd_refresh` → `/api/session`
  200 с user. В браузерах Secure-кука на `http://localhost` работает (localhost —
  secure context), поэтому UI-пробы прошли.
- **Seed сбрасывает seed-пароли на `123` при каждом старте контейнера**
  (`prisma db seed` в compose-команде) — ожидаемое поведение, смена боевых
  паролей остаётся в бэклоге.

## Что осталось

- Смена боевых паролей ролей (вкл. `admin`) — `npm run passwords` (отложено
  пользователем).
- HTTPS-терминирование локального контура (внешний уже https — Tailscale Funnel).
- Локальный производственный контур (сервер в цехе + VPN) — отдельный
  план-контекст.
- Стенд после всех проверок: probe-артефакты удалены, живая связка пользователя
  (ЗП-260918-051641/053835/053904, выданный наряд, подписки) не тронута.

## Следующий шаг

Смена боевых паролей ролей и/или локальный производственный контур
(по выбору пользователя). После деплоя этого этапа — «тестируй».

## Docs

- edit `docs/specs/architecture.md` (роль admin, register, `/api/admin/*`).
- edit `docs/specs/roles.md` (список ролей, выдача ролей, `isActive`).
- edit `docs/reports/STATUS.md` (этап 14, карта доступа, бэклог).
- edit `AGENTS.md` (роли и страницы + админ, 12 моделей, admin-роут).

## Коммиты

- (committed on stage close)