# Этап 13 «Безопасность перед публикацией» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести токены из localStorage в схему «access в памяти + refresh в httpOnly-куке», добавить rate-limit и блокировку логина, helmet-заголовки, и принудительные реальные секреты в production.

**Architecture:** accessToken (12ч) живёт только в JS-памяти (`let accessToken`), refreshToken (7д, c claim `persist`) — в httpOnly `SameSite=Strict` cookie `nd_refresh`. Каждая страница роли стартует с `GET /api/session` (по куке) → получает user+access; при 401 в `api()` — тихий `POST /api/refresh` (сама кука) → повтор; иначе logout. Rate-limit: express-rate-limit per-IP на login/refresh + in-memory блокировка по логину (5 неудач → 15 мин).

**Tech Stack:** Express 4 + TypeScript, cookie-parser, express-rate-limit, helmet, bcrypt, jsonwebtoken.

**Spec:** `docs/superpowers/specs/2026-09-18-auth-security-design.md`

## Global Constraints

- Коммиты на русском, Conventional-ish: `<тип>: <что> (<зачем>)`.
- НЕ добавлять комментарии в код (кроме случаев, где комментарий необходим для читаемости и не противоречит правилу проекта).
- После правок обязательны `npm run build` + `npm run check` (в `server/`) перед коммитом кода.
- Не коммитить `server/.env`, `tests/e2e/profile/`, `.secrets/`.
- Dev-дефолты `JWT_SECRET=dev-secret`/`VBA_SECRET=dev-vba-secret` остаются ТОЛЬКО для локального dev; при `NODE_ENV=production` их присутствие = ошибка запуска.
- E2E-эталон: ролевые 26/26, bizcycle 51/51 — после этапа обязательный прогон.
- `POSTGRES_PASSWORD` на текущем стенде НЕ менять (живые данные); шаг продакшн-деплоя — только в документации.

---

### Task 1: Инфраструктура сервера — зависимости, config, app.ts

**Files:**
- Modify: `server/package.json` (deps), `server/package-lock.json`
- Modify: `server/src/config.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Produces: `config.nodeEnv: string`, `config.cookieSecure: boolean`, `config.trustProxy: boolean`; валидация секретов на старте (throw). В `app.ts`: helmet без CSP, cookie-parser, `trust proxy`, отключён `x-powered-by`.

- [ ] **Step 1: Установить зависимости**

```powershell
# в server/
npm i cookie-parser express-rate-limit helmet
npm i -D @types/cookie-parser
npm run build   # tsconfig должен собраться; helmet/@types идут из пакета
```

- [ ] **Step 2: Заменить `server/src/config.ts`**

```ts
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  vbaSecret: process.env.VBA_SECRET || 'dev-vba-secret',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/digital_narad',
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
};

if (
  config.nodeEnv === 'production' &&
  (config.jwtSecret === 'dev-secret' || config.vbaSecret === 'dev-vba-secret')
) {
  throw new Error('Некорректная конфигурация: in production JWT_SECRET и VBA_SECRET обязательны');
}
```

- [ ] **Step 3: Дополнить `server/src/app.ts`**

В начало (после `const app = express();`, до `app.use(express.json())`):

```ts
app.set('trust proxy', config.trustProxy ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());
```

Импорты в шапке файла:

```ts
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
```

(`config` уже импортирован.)

- [ ] **Step 4: проверка и коммит**

```powershell
npm run build
npm run check
git add src/config.ts src/app.ts package.json package-lock.json
git commit -m "chore: helmet, cookie-parser, trust proxy и валидация секретов в production (этап 13)"
```

---

### Task 2: Лимит попыток логина — throttle по логину + rate-limit

**Files:**
- Create: `server/src/lib/login-throttle.ts`
- Modify: `server/src/routes/auth.routes.ts` (limiter только не здесь — здесь в Task 3; в Task 2 создаём модуль)

**Interfaces:**
- Produces: `isLoginBlocked(login: string): boolean`, `recordLoginFailure(login: string): void`, `resetLoginAttempts(login: string): void`. Потребитель — Task 3.

- [ ] **Step 1: Написать `server/src/lib/login-throttle.ts`**

```ts
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

const attempts = new Map<string, { fails: number; blockedUntil: number }>();

export function isLoginBlocked(login: string): boolean {
  const entry = attempts.get(login);
  if (!entry) return false;
  if (entry.blockedUntil > Date.now()) return true;
  attempts.delete(login);
  return false;
}

export function recordLoginFailure(login: string): void {
  const entry = attempts.get(login) || { fails: 0, blockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= MAX_FAILS) {
    entry.fails = 0;
    entry.blockedUntil = Date.now() + LOCK_MS;
  }
  attempts.set(login, entry);
}

export function resetLoginAttempts(login: string): void {
  attempts.delete(login);
}
```

- [ ] **Step 2: добавить rate-limit-фабрику здесь же (импорт из bezопасности)**

Добавить порорядок: rate-limit конфиг будет применён в Task 3. Вспомогательная функция в `login-throttle.ts`:

```ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте позже' },
});
```

- [ ] **Step 3: проверить типы и коммит**

```powershell
npm run build
npm run check
git add src/lib/login-throttle.ts
git commit -m "feat: in-memory throttling логина и rate-limit на auth (этап 13)"
```

---

### Task 3: Переписать `auth.routes.ts` — куки, /session, /logout

**Files:**
- Modify: `server/src/routes/auth.routes.ts` (полная замена)

**Interfaces:**
- Consumes: `isLoginBlocked`, `recordLoginFailure`, `resetLoginAttempts`, `authLimiter` (Task 2); `config.nodeEnv`, `config.cookieSecure` (Task 1).
- Produces: `POST /login → { accessToken, user }` + кука `nd_refresh`; `POST /refresh → { accessToken }` + ротация куки; `GET /session → { user, accessToken }`; `POST /logout → { ok: true }`. Потребители — Task 4 (клиент).

- [ ] **Step 1: Полностью заменить содержимое файла**

```ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { isLoginBlocked, recordLoginFailure, resetLoginAttempts, authLimiter } from '../lib/login-throttle';

const router = Router();

const REFRESH_COOKIE = 'nd_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(persist: boolean): import('express').CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    ...(persist ? { maxAge: REFRESH_TTL_MS } : {}),
  };
}

router.post('/login', authLimiter, async (req, res) => {
  const { login, password, remember } = req.body || {};
  if (!login || !password) {
    res.status(400).json({ error: 'Логин и пароль обязательны' });
    return;
  }
  if (isLoginBlocked(login)) {
    res.status(429).json({ error: 'Логин заблокирован на 15 минут' });
    return;
  }

  const employee = await prisma.employees.findUnique({ where: { login } });
  const valid = employee && (await bcrypt.compare(password, employee.password));
  if (!employee || !valid) {
    recordLoginFailure(login);
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  resetLoginAttempts(login);
  const persist = !!remember;
  const user = { login: employee.login, fullName: employee.fullName, role: employee.role };
  const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
  const refreshToken = jwt.sign({ login: employee.login, persist }, config.jwtSecret, { expiresIn: '7d' });

  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(persist));
  res.json({ accessToken, user });
});

router.post('/refresh', authLimiter, async (req, res) => {
  const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }
  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret) as { login: string; persist?: boolean };
    const employee = await prisma.employees.findUnique({ where: { login: payload.login } });
    if (!employee) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    const user = { login: employee.login, fullName: employee.fullName, role: employee.role };
    const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
    const newRefreshToken = jwt.sign(
      { login: employee.login, persist: !!payload.persist },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    res.cookie(REFRESH_COOKIE, newRefreshToken, cookieOptions(!!payload.persist));
    res.json({ accessToken });
  } catch {
    res.clearCookie(REFRESH_COOKIE);
    res.status(401).json({ error: 'Неверный refresh token' });
  }
});

router.get('/session', async (req, res) => {
  const refreshToken = req.cookies && req.cookies[REFRESH_COOKIE];
  if (!refreshToken) {
    res.status(401).json({ error: 'Не авторизован' });
    return;
  }
  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret) as { login: string; persist?: boolean };
    const employee = await prisma.employees.findUnique({ where: { login: payload.login } });
    if (!employee) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    const user = { login: employee.login, fullName: employee.fullName, role: employee.role };
    const accessToken = jwt.sign(user, config.jwtSecret, { expiresIn: '12h' });
    res.json({ user, accessToken });
  } catch {
    res.clearCookie(REFRESH_COOKIE);
    res.status(401).json({ error: 'Не авторизован' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireAuth(), (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

export default router;
```

- [ ] **Step 2: проверка и коммит**

```powershell
npm run build
npm run check
git add src/routes/auth.routes.ts
git commit -m "feat: сессии по httpOnly-куке (login/refresh/session/logout) (этап 13)"
```

---

### Task 4: Переписать `public/api.js` — токен в памяти

**Files:**
- Modify: `server/src/public/api.js` (замена верхней части файла)

**Interfaces:**
- Produces: `setSession(user, token)`, `initSession() → user|null`, `logout()`, `getCurrentUser() → user|null`, `api()` с тихим refresh. Потребители — Task 5 (вью), `login.ejs`, `ui.js`, `push-init.js`.

- [ ] **Step 1: Заменить строки 1–59 (убрать tokenStore/saveSession/clearSession, всё на память)**

```js
var accessToken = null;
var currentUser = null;

function setSession(user, token) {
  currentUser = user;
  accessToken = token;
}

function getCurrentUser() {
  return currentUser;
}

async function initSession() {
  try {
    var res = await fetch('/api/session', { method: 'GET' });
    if (!res.ok) throw new Error('not authorized');
    var data = await res.json();
    setSession(data.user, data.accessToken);
    return data.user;
  } catch (e) {
    location.href = '/login';
    return null;
  }
}

async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  accessToken = null;
  currentUser = null;
  location.href = '/login';
}

async function api(url, options) {
  var headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
  var opts = Object.assign({}, options, { headers: headers });
  if (opts.body && typeof opts.body === 'object') opts.body = JSON.stringify(opts.body);

  var res = await fetch(url, opts);
  if (res.status === 401) {
    var refreshRes = await fetch('/api/refresh', { method: 'POST' });
    if (refreshRes.ok) {
      var data = await refreshRes.json();
      accessToken = data.accessToken;
      return api(url, options);
    }
    accessToken = null;
    currentUser = null;
    location.href = '/login';
    throw new Error('Not authorized');
  }
  var result = await res.json().catch(function() { return null; });
  if (!res.ok) throw new Error((result && result.error) || 'Ошибка запроса');
  return result;
}
```

- [ ] **Step 2: проверка и коммит**

```powershell
npm run build
npm run check
git add src/public/api.js
git commit -m "refactor: клиентские токены только в памяти JS + тихий refresh по куке (этап 13)"
```

---

### Task 5: Страницы ролей и логин — initSession вместо localStorage

**Files:**
- Modify: `server/src/views/operator.ejs` (IIFE 67–74, вызовы 76–77 и 277)
- Modify: `server/src/views/master-app.ejs` (IIFE 118–124, вызовы 126–127, 501–502)
- Modify: `server/src/views/shift-app.ejs` (IIFE 76–82, вызовы 84–85, 231)
- Modify: `server/src/views/otk-app.ejs` (IIFE 50–56, вызовы 58–59, 238)
- Modify: `server/src/views/login.ejs` (блок успеха 61–64)

**Interfaces:**
- Consumes: `initSession()`, `setSession()` (Task 4).

- [ ] **Step 1: operator.ejs — заменить guard-IIFE**

Заменить блок (строки 68–74):

```js
    (async function() {
      var u = await initSession();
      if (!u) return;
      if (u.role !== 'operator') { location.href = '/'; return; }
      var nameEl = document.querySelector('.user-full-name');
      if (nameEl) nameEl.textContent = u.fullName;
      initNotifications();
      initPush();
      loadAll();
    })();
```

Удалить отдельные строки 76–77 (`initNotifications();` / `initPush();`) и строку 277 (`loadAll();`) — теперь они вызываются из бутстрапа.

- [ ] **Step 2: master-app.ejs — то же**

Заменить блок (строки 118–124) на:

```js
    (async function() {
      var u = await initSession();
      if (!u) return;
      if (u.role !== 'master') { location.href = '/'; return; }
      var nameEl = document.querySelector('.user-full-name');
      if (nameEl) nameEl.textContent = u.fullName;
      initNotifications();
      initPush();
      loadAll();
      loadDashboard();
    })();
```

Удалить строки 126–127 и 501–502.

- [ ] **Step 3: shift-app.ejs**

Заменить блок (строки 76–82) на:

```js
    (async function() {
      var u = await initSession();
      if (!u) return;
      if (u.role !== 'shift') { location.href = '/'; return; }
      var nameEl = document.querySelector('.user-full-name');
      if (nameEl) nameEl.textContent = u.fullName;
      initNotifications();
      initPush();
      loadLaunches();
    })();
```

Удалить строки 84–85 и 231.

- [ ] **Step 4: otk-app.ejs**

Заменить блок (строки 50–56) на:

```js
    (async function() {
      var u = await initSession();
      if (!u) return;
      if (u.role !== 'otk') { location.href = '/'; return; }
      var nameEl = document.querySelector('.user-full-name');
      if (nameEl) nameEl.textContent = u.fullName;
      initNotifications();
      initPush();
      loadQueue();
    })();
```

Удалить строки 58–59 и 238.

- [ ] **Step 5: login.ejs — отправить remember, сессия в память**

В обработчике формы заменить строки 61–64:

```js
        if (res.ok) {
          setSession(data.user, data.accessToken);
          var role = data.user.role;
```

И в body запроса (строка ~57) добавить remember:

```js
          body: JSON.stringify({
            login: login,
            password: password,
            remember: document.getElementById('remember').checked
          })
```

- [ ] **Step 6: проверка и коммит**

```powershell
npm run build
npm run check
git add src/views
git commit -m "feat: страницы ролей стартуют через /api/session (без localStorage-токенов) (этап 13)"
```

---

### Task 6: Секреты, env, compose-флаги и скрипт смены паролей

**Files:**
- Modify: `server/.env` (НЕ коммитить), `server/.env.example`
- Modify: `server/docker-compose.yml`
- Create: `server/scripts/set-passwords.ts`
- Modify: `server/package.json` (скрипт `passwords`)

**Interfaces:**
- Produces: скрипт `npm run passwords -- <пароль>` (bcrypt-обновление паролей 4 ролей в `Employees`). Применение на стенде — ТОЛЬКО по согласию (сломает текущие сессии/логин, E2E пойдёт с `ND_PASSWORD_*`).

- [ ] **Step 1: Сгенерировать секреты в `server/.env`**

```powershell
# открыть текущий .env, заменить значения JWT_SECRET/VBA_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → JWT_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # → VBA_SECRET
```

Не коммитить `.env`.

- [ ] **Step 2: `docker-compose.yml` — production-режим app**

В сервис `app` в `environment` добавить:

```yaml
      NODE_ENV: production
      COOKIE_SECURE: 'true'
      TRUST_PROXY: 'true'
```

- [ ] **Step 3: `.env.example` — сигнатурные поля**

В секцию про secrets добавить примеры (без реальных значений):

```
# === Безопасность (этап 13) ===
# NODE_ENV=production (в docker-compose app). JWT_SECRET/VBA_SECRET — реальные, 32/24 hex.
# COOKIE_SECURE=true — когда внешний https (Funnel); TRUST_PROXY=true — с одним прокси.
```

- [ ] **Step 4: `server/scripts/set-passwords.ts`**

```ts
import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma';

async function main() {
  const pass = process.argv[2];
  if (!pass || pass.length < 8) {
    console.error('Использование: npm run passwords -- <новый пароль (мин 8 символов)>');
    process.exit(1);
  }
  const logins = ['master', 'shift', 'operator', 'otk'];
  for (const login of logins) {
    const emp = await prisma.employees.findUnique({ where: { login } });
    if (!emp) {
      console.log(`skip ${login}: не найден`);
      continue;
    }
    const hash = await bcrypt.hash(pass, 10);
    await prisma.employees.update({ where: { login }, data: { password: hash } });
    console.log(`ok ${login} (${emp.fullName})`);
  }
}

main().finally(() => prisma.$disconnect());
```

`package.json` scripts добавить: `"passwords": "tsx scripts/set-passwords.ts"`.

- [ ] **Step 5: проверка и коммит**

```powershell
npm run build
npm run check
git add scripts/set-passwords.ts package.json docker-compose.yml .env.example
git commit -m "feat: скрипт смены паролей и production-флаги секретов/cookie (этап 13)"
```

---

### Task 7: Верификация — probe, E2E, деплой

**Files:**
- Create: `C:\Users\73B5~1\AppData\Local\Temp\opencode\probe_auth.py` (вне git)
- Modify (temp): `C:\Users\73B5~1\AppData\Local\Temp\opencode\probe_push.py` (взять токен через `/api/session`)
- Run: `tests/e2e/test_operator.py`, `test_otk.py`, `test_master.py`, `test_shift.py`, `test_bizcycle.py`

**Goal:** доказательства: build/check, auth-probe, регрессии, стенд после деплоя.

- [ ] **Step 1: `npm run build` + `npm run check`** — PASS.
- [ ] **Step 2: auth-probe против стенда (docker на новом образе, см. Step 4 деплой; при локальной проверке — после деплоя).**

Probe (Playwright + requests через APIRequestContext):
- login без куки-запоминания: `POST /login {login,password,remember:false}` → 200 с `accessToken`; resp.cookies содержит `nd_refresh`; `HttpOnly` атрибут куки = true.
- `document.cookie` на странице не содержит `nd_refresh`.
- `GET /session` с кукой → `{ user, accessToken }`; без куки → 401.
- `POST /refresh` с кукой → 200 `{ accessToken }`.
- `POST /logout` → очистка куки; `/session` после → 401.
- блок: 5 неудачных логинов `operator` неверный пароль → 6-й (даже с верным) → 429 «заблокирован».
- rate-limit: >120 запросов за 15 мин (искусственно промасштабировать нельзя — пропускается, логика покрыта юнит-чтением; достаточно 421-через 6 повторных) — НЕ гнать 120: отметить как покрыто по коду.
- Итог: auth-probe ≥ 8 проверок PASS, вывод в консоль.

- [ ] **Step 3: Обновить `probe_push.py` (temp)** — токены для `/api/push/vapid-key` и subscribe брать из ответа `POST /login` (accessToken), не из localStorage.
- [ ] **Step 4: Деплой по согласию пользователя** (спросить), затем `/health`:

```powershell
# в server/
docker compose up -d --build
# ожидание: NODE_ENV=production + реальные JWT/VBA из .env (Step 1 Task 6) — иначе контейнер упадёт
```

- [ ] **Step 5: Прогоны**: `test_operator.py` (6/6), `test_otk.py` (4/4), `test_master.py` (12/12), `test_shift.py` (4/4), `test_bizcycle.py` (51/51).
- [ ] **Step 6: Проверить чистоту стенда** (`PushSubscription`=0, бизнес-таблицы=0, Catalog=2208; живые данные пользователя целы).
- [ ] **Step 7: Документация и финальный коммит**: `docs/specs/architecture.md` (модель сессий, cookie, rate-limit), `docs/reports/STATUS.md`, отчёт `docs/reports/2026-09-18-auth-security.md`, тег `v0.16-auth-security`.

```bash
git add docs/specs/architecture.md docs/reports/STATUS.md docs/reports/2026-09-18-auth-security.md
git commit -m "docs: этап 13 безопасность — сессии на httpOnly-куке, rate-limit, секреты (v0.16-auth-security)"
git tag v0.16-auth-security
```

---

## Self-Review (план)

- **Spec coverage:** каждый пункт спеки — отдельная задача: куки/сессии (3), клиент (4,5), rate-limit+throttle (2), helmet+trust proxy+секреты (1,6), https/cookie-флаг (1,6), ограничения-reminder (ввести в STATUS, Task 7). Пункт «POSTGRES_PASSWORD не менять» — в Global Constraints/документации. ✓
- **Заглушки:** нет TBD; все шаги содержат фактический код/команды. ✓
- **Типы:** `isLoginBlocked/recordLoginFailure/resetLoginAttempts/authLimiter` (Task 2) → используются в Task 3; `setSession/initSession` (Task 4) → Task 5; имена постоянны. ✓