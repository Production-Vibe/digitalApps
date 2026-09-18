# 2026-09-18 — Этап 13: безопасность перед публикацией (ADR-007)

> Спека: `docs/superpowers/specs/2026-09-18-auth-security-design.md`;
> план: `docs/superpowers/plans/2026-09-18-auth-security.md`.

## Цель

Закрыть блокеры внешней публикации: токены из `localStorage` (XSS-захват),
открытый словарный перебор `/login`, отсутствующая https-стратегия на уровне
приложения (наружный https уже даёт Tailscale Funnel), dev-секреты по умолчанию.

## Что сделано

### Сервер
- `server/src/config.ts` — `nodeEnv`, `cookieSecure`, `trustProxy`; в production
  принудительно реальные `JWT_SECRET`/`VBA_SECRET` (dev-дефолты только для dev).
- `server/src/app.ts` — `app.set('trust proxy', ...)`, `x-powered-by` off,
  `helmet` без CSP, `cookie-parser`.
- `server/src/lib/login-throttle.ts` — in-memory блокировка логина: 5 неудач →
  429 «Логин заблокирован на 15 минут».
- `server/src/routes/auth.routes.ts` — новый контракт:
  - `POST /login` → `{ accessToken, user }` + кука `nd_refresh` (refresh 7д,
    claim `persist`; `httpOnly`, `SameSite=Strict`, `Secure` при `COOKIE_SECURE`;
    maxAge 7д при «Запомнить меня», иначе session-кука);
  - `POST /refresh` — только кука, ротация refresh, выдаёт новый access;
  - `GET /session` — восстановление сессии по куке → `{ user, accessToken }`;
  - `POST /logout` — чистка куки.
- `express-rate-limit`: 120 запросов/15 мин на `/login`+`/refresh`.

### Клиент
- `server/src/public/api.js` — `accessToken` только в памяти JS; `setSession`,
  `initSession()`, `api()` с тихим `POST /refresh` на 401, `logout()`.
- 4 вью ролей (`operator`, `master-app`, `shift-app`, `otk-app`) стартуют через
  `await initSession()` (guard роли, имя пользователя, `initNotifications`,
  `initPush`, loaders — внутри единого bootstrap).
- `login.ejs` — чекбокс «Запомнить меня» → `setSession(user, token, remember)`.

### Инфраструктура
- `server/docker-compose.yml` — в production-контуре `NODE_ENV=production`,
  `COOKIE_SECURE=true`, `TRUST_PROXY=true`.
- `server/scripts/set-passwords.ts` + `npm run passwords` — смена паролей ролей
  (по решению пользователя запуск отложен).
- Секреты `JWT_SECRET`/`VBA_SECRET` уже были реальными в `server/.env`
  (не в git, шаблон `.env.example` актуализирован).

### Баг, найденный по ходу
`isLoginBlocked` удалял запись попыток при каждой не-заблокированной проверке —
счётчик неудач вечно обнулялся, блок логина никогда не срабатывал. Фикс:
check не удаляет, сброс при истёкшем блоке перенесён в `recordLoginFailure`.
Подтверждено на живом контейнере: 6-я неудачная попытка → 429.

## Проверки

- `npm run build` + `npm run check` — PASS на каждом шаге.
- Auth-probe (headless, против живого стенда) — **17/17 PASS**: логин 200 + токен,
  refresh-токена нет в теле ответа, кука HttpOnly+Secure, `document.cookie` пуст,
  `GET /session` по куке; refresh без куки → 401; logout чистит куку; блок 429
  после 5 неудачных логинов; заголовки helmet; `x-powered-by` скрыт.
- Ролевой E2E — **26/26 PASS** (operator 6, otk 4, master 12, shift 4).
- Push-probe — **13/13 PASS** (токен через `/api/session`; 1 SKIP — реальная
  подписка в headless недоступна, `AbortError`, вынесена на телефон).
- `test_bizcycle.py` — **51/51 PASS ×2** финальных прогона.

### Гонка в тесте, выявленная прогонами
Перевод страниц на асинхронный бутстрап (`initSession()` → `loadAll()`) сдвинул
рендер секций на ~0.2 с: мгновенное `page.inner_text('body')` в проверках
«вход (happy-1/rework)» давало false-negative («Наряды в работе» ещё не
отрисована), а накопленные прерванными прогонами открытые смены ломали фазу
закрытия («Максимум 2 открытые смены»). Исправление — в тесте: проверки входа
переведены на `wait_text`; осадок смен зачищен. Сервер не менялся.

## Осталось

- Смена боевых паролей ролей (`npm run passwords`) — отложена пользователем.
- https до реверс-прокси / локального http — вне объёма (внешний контур Funnel
  уже https; терминирование на проде решить отдельно).
- Ручное подтверждение push на телефоне (Android/iOS 16.4+, установка PWA).

## Деплой

`docker compose up -d --build` (server/), миграция не требуется (схема без
изменений), `/health` → `{status:'ok', db:'connected'}`. Live-данные
пользователя на стенде не тронуты (запуски `ЗП-260918-051641/053835/053904`,
выданный наряд, push-подписки shift/master).