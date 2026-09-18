# Дизайн — Этап 13: безопасность перед публикацией

Дата: 18.09.2026. Статус: утверждено (решения приняты в сессии 18.09.2026).

## Цель и проблемы

Перед боевым использованием системы закрыть известные дыры авторизации и
доступа:

1. **Оба токена в `localStorage`/`sessionStorage`** — XSS-скрипт может украсть
   access и refresh.
2. **Отсутствует защита от перебора паролей** (rate-limit).
3. **Dev-секреты как дефолты** в `config.ts` (`dev-secret`, `dev-vba-secret`) и
   тестовые пароли сотрудников (`123`).
4. **Нет security-заголовков** (helmet) и нет флага `Secure`/`SameSite` у кук.
5. https на границе даёт Tailscale Funnel (TLS) — app за ним по http; флаг
   `Secure` куки нужен при этом работать.

## Принятые решения

- **Хранилище access-токена: только в памяти JS** (`let accessToken`), refresh —
  в httpOnly-куке. `localStorage` для токенов больше не используется.
- **Сроки:** access 12ч, refresh 7д (кука с Max-Age 7д при «Запомнить меня»,
  session-кука без Max-Age — если не запоминать).
- **Rate-limit — гибрид:** express-rate-limit per-IP на `/login` и `/refresh`
  (120/15 мин — цех за NAT не блокируется) + in-memory блокировка по логину
  (5 неудач → 15 мин; сброс при успешном входе).
- **Security-заголовки:** `helmet` с `contentSecurityPolicy: false` (иначе ломает
  инлайн-скрипты EJS).
- **Секреты:** реальные `JWT_SECRET`/`VBA_SECRET` в `server/.env`; при
  `NODE_ENV=production` отсутствие секретов — ошибка запуска, dev-дефолты только
  для локального dev.
- **https / куки:** TLS на границе — Tailscale Funnel; флаг `Secure` включается
  через `COOKIE_SECURE=true`; `app.set('trust proxy', 1)` через `TRUST_PROXY=true`
  (реальный IP для rate-limit под Funnel).

## Модель сессий

```
POST /login {login, password, remember}
  → 200 { accessToken, user }         (refresh — в куке nd_refresh)
  → 401 «Неверный логин или пароль»
  → 429 «Слишком много попыток. Попробуйте позже» (rate-limit per-IP)
  → 429 «Логин заблокирован на 15 минут»          (блок по логину)

GET /api/session   (только кука nd_refresh)
  → 200 { user, accessToken }        (восстановление после перезагрузки)
  → 401

POST /api/refresh  (только кука nd_refresh; тело не принимается)
  → 200 { accessToken } + ротация куки
  → 401 + удаление куки

POST /api/logout
  → 200 «ok», кука очищается
```

Куки: `nd_refresh` — httpOnly, `SameSite=Strict`, `Secure` по конфигу, Max-Age
7д либо session; `nd_persist` — несекретная, хранит стратегию (`1`/`0`) для
корректной ротации Max-Age.

## Состав изменений

### Сервер
- Зависимости: `cookie-parser`, `express-rate-limit`, `helmet` (+ типы).
- `config.ts`: `cookieSecure`, `trustProxy`, `nodeEnv`; валидация секретов при
  `NODE_ENV=production`.
- `auth.routes.ts`: новый `/session`, `/logout`; `refresh` — только кука;
  `login` — куки + throttle.
- `lib/login-throttle.ts`: in-memory блокировка по логину (Map, TTL).
- `app.ts`: `cookie-parser`, `helmet`, `trust proxy`, limiter на маршруты auth.

### Клиент
- `api.js`: убрать `tokenStore`/`localStorage`; `accessToken`+`currentUser` в
  памяти; `initSession()`; `logout()` → POST `/api/logout`; `api()` с
  тихим refresh.
- 4 вью ролей: guard на `initSession()` вместо `localStorage.user`.
- `login.ejs`: `remember` в body; больше не сохраняется в storage.

### Секреты и пароли
- Генерация `JWT_SECRET`, `VBA_SECRET` в `server/.env`; `NODE_ENV=production` и
  `COOKIE_SECURE=true` в docker-compose app.
- `scripts/set-passwords.ts` — смена bcrypt-паролей сотрудников (реальные
  пароли — от пользователя).
- `POSTGRES_PASSWORD` НЕ меняем на текущем стенде (риск потери живых данных);
  фиксируем шаг в продакшн-деплое.

## Известные ограничения (принято)

- In-memory throttle: сброс счётчиков при рестарте процесса; при PM2
  cluster/нескольких инстансах — счётчик не общий. Сейчас один процесс —
  корректно. Путь на будущее: Redis-бэкенд rate-limit/блокировок (roadmap,
  вне объёма этапа).

## Проверки

- `npm run build` + `npm run check`.
- API-smoke: login/refresh по куке/session/logout; ротация куки; httpOnly
  (кука не видна из JS); 429 по IP; блок после 5 неудач; перезагрузка без
  `remember` → session-кука.
- Ролевой E2E 26/26 + bizcycle 51/51 (обновить сборку токена в push-probe:
  через `/api/session`).
- Деплой на стенд по согласию.