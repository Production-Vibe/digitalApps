# STATUS.md — живое состояние проекта «ЦифровойНаряд»

> Единая всегда-актуальная сводка для быстрого входа в контекст нового диалога.
> Читать при старте каждого диалога (см. AGENTS.md → приоритет чтения).
> Обновлять по завершении каждого этапа (см. AGENTS.md → Definition of Done).

## Стек и ветки

- **`main`** — новый стек: Node/Express (TypeScript) + EJS + Prisma + PostgreSQL,
  JWT + bcrypt. Монолит без UI-фреймворков. Локальная БД `MOSD`
  (`production_user`). Деплой — **Docker Desktop** (Windows, контекст
  `desktop-linux`, engine 29.7.2) + PM2 (в доводке). Локальный PostgreSQL на
  Windows остановлен; порт 5432 держит Docker-PG.
- **`google-apps`** — легаси Google Apps Script (модули, GAS-скиллы, GAS-доки,
  E2E против `/exec`, манифест деплоя). В `main` не переносить без явного решения.
- Код-модули: `server/src/**`; схема БД (канон) — `server/prisma/schema.prisma`
  (10 моделей, 6 enum).

## Последний завершённый этап

- **11.09.2026 — Стек переведён на Docker Desktop: глобальная ссылка перестала отваливаться.**
  Причина нестабильности `https://el-konstr04.tail13402b.ts.net` найдена: контейнеры
  крутил docker.io внутри Ubuntu-WSL, а сама Ubuntu-WSL **выключается по idle-таймауту
  (~60 с)** — контейнеры умирали вместе с виртуалкой, Funnel получал пустой
  `127.0.0.1:3000` → 502 → телефон «не может обработать запрос». Решение: Docker
  контекст выставлен в `desktop-linux` (Docker Desktop 4.90.0, engine 29.7.2), проект
  запущен через Docker Desktop (`docker compose up -d --build` в `server/`): образ
  `server-app` собран, миграции применены, сид залит, `server-db-1` healthy.
  docker.io в Ubuntu-WSL отключён (`systemctl disable --now docker docker.socket`) —
  два движка не конфликтуют за порты 3000/5432. Автозапуск Docker Desktop включён
  (`AutoStart: true` в `settings-store.json`, Run-ключ HKCU). **Проверка живучести:
  ссылка отвечает 200 непрерывно 5+ минут бездействия** (раньше падала за ~1 мин);
  контейнеры `Up 6 minutes` без рестарта, WSL-фон `docker-desktop` — `Running`,
  Ubuntu — `Stopped`. Проверено: `/health` 200 локально и через Funnel, `/login`
  рендерится, вход `operator/123` → `/api/login` выдаёт токен (роль operator).
- **11.09.2026 — Docker-стек поднят вживую на WSL + глобальный доступ через Tailscale Funnel.**
  Первый реальный `docker compose up --build` (`server/`), образ `server-app`
  собран, миграции применены, сид залит, `/health` → `{status:'ok', db:'connected'}`.
  В `docker-compose.yml` добавлен `restart: unless-stopped` обоим сервисам.
  (Исторический этап: позже заменён Docker Desktop см. выше.)
- **11.09.2026 — Глобальный error-handler: asyncHandler + Prisma JSON-ответы.**
  Создан `server/src/lib/async-wrap.ts` (`asyncHandler` + `wrapRouter`), который
  автоматически оборачивает все async-хендлеры в роутерах и перенаправляет
  неперехваченные исключения в Express `next()`. Финальный error-middleware
  (`server/src/app.ts`) возвращает JSON-ответ с понятным сообщением вместо
  ConnectionReset: P2003 → 400 «Ссылка на несуществующую запись», P2025 → 404,
  прочее → 500. Проверено: невалидный `partCode` в `/issue` теперь отдаёт 400,
  сервер не падает (health проверялся сразу после). E2E 18/18 PASS (без изменений
  в харнессе). Коммит: `5f161a7`.
- **11.09.2026 — Rework-цикл оператора восстановлен.**
  `GET /api/work-orders/my/list` (`server/src/routes/workorders.routes.ts:78`)
  теперь включает `rework` в фильтре статусов.
  Проверено end-to-end через API: rework → оператор видит → переход → waiting_otk →
  ОТК закрывает. Коммит: `4d304a1`.
- **11.09.2026 — E2E на `localhost:3000` адаптирован (JWT-стек), 18/18 PASS.**
  Харнесс `tests/e2e/` переписан под новый стек: `config.py` (APP_URL
  `http://localhost:3000`, CREDS из сида, LANDING → `/master|/shift|/operator|/otk`),
  `helpers.py`/`runner.py` (full-page селекторы, JWT-логин через `/login`, без
  Google-сессии/фреймов), `test_{operator,otk,master,shift}.py` — проверка
  входа, отрисовки страницы роли и F5-редиректа. GAS-харнесс
  (`session_setup.py`, `flows.py`, `seed_*.py`, `test_bizcycle.py`,
  `test_otk_full.py`) удалён из `main` (копия — ветка `google-apps`).
  Прогоны: operator 6/6, otk 4/4, master 4/4, shift 4/4 — итого **18/18 PASS**.
  `docs/testing/e2e-runbook.md` актуализирован.
- **11.09.2026 — Документация и Docker-контур под new-стек (docs+Docker).**
  Переписаны под Node/Express+Prisma+PostgreSQL: `AGENTS.md`, `README.md`,
  `docs/specs/`, `docs/testing/e2e-runbook.md`, `instructions/{safety,verification}.md`,
  `.opencode/agents/e2e.md`, `server/docs/vba-integration.md`, STATUS.md.
  Docker: исправлен `docker-compose.yml` (context/`dockerfile`/`env_file` через
  `server/`, `DATABASE_URL` сервиса `app` → host `db`, `prisma db seed`),
  добавлены `docker-compose.dev.yml`, `.dockerignore`, обновлён `Dockerfile`
  (build-tools bcrypt, `prisma/` целиком), `server/docs/onboarding.md`,
  `.env.example`. Проверки: `npm run build` + `npm run check` PASS, `/health` OK.
  Docker-CLI нет — `docker compose up --build` не прогонялся.
- **10.09.2026 — Адаптация репозитория под новый стек.** Создана ветка
  `google-apps`, `main` fast-forward на `future` + удалены Google-артефакты
  (modules/, digitalapps-deploy-скилл, GAS-доки, `Мастер-промпт.md`).
- **09.09.2026 — Проверка локального стека (пробы A–E, все PASS).** MCP-postgres
  против локального `MOSD` (PG 18.1, `production_user`): миграция
  `20260910105412_init` применена; 6 enum соответствуют `schema.prisma`; сид —
  каталог 29 позиций, 4 роли (bcrypt), станки Т1-1..Т1-8;
  бизнес-таблицы пусты (Shifts: 1 хвост smoke). Playwright: `localhost:3000`
  рендерит `/login`. Версия рабочего стека без деплоя (локальный dev).

## Открытые баги / TODO

- [ ] **E2E покрывает только вход+рендер+refresh** (18/18 PASS); полный
  бизнес-цикл (выдача → оператор → ОТК → rework → закрытие) не автоматизирован —
  кандидат следующего этапа после восстановления rework-цикла.
- [ ] **Master урезан против GAS:** нет Dashboard/дерева/сводки занятости ПА,
  нет read-эндпоинта и экрана очереди печати (`PrintQueue` пишется при выдаче).
- [ ] (опц.) Выделить сервисный слой инвариантов (закрытие, accepted+defect≤qty,
  занятость станка) — пока rules живут в хендлерах.
- [ ] (опц.) Модель `Queue` в схеме, но не питается ни одним route: использовать
  или удалить.
- [ ] (опц.) `ClosedOrders` — запись-дубликат итогов; рассмотреть пересчёт
  проекцией из переходов.
- [ ] Безопасность перед публикацией: rate-limit на `/login`, сменa dev-секретов
  (`config.ts`), https, политика `localStorage`-токенов.

## Закрытые баги (new-стек)

- ✅ **Авторизация роль-в-URL → JWT роли-в-токене** (ADR-002 осн. узел).
  Спуфинг роли через URL невозможен: роль в подписанном сервером payload,
  пароли bcrypt.
- ✅ **Канон наряда сведён к `WorkOrders`** (ADR-003) в новом стеке; переходы —
  `Transitions` (FK, уникальность `[orderNumber, number]`); итоги — `ClosedOrders`.
- ✅ **Rework-статус есть в enum** (ADR-005): `created/in_progress/waiting_otk/
  rework/closed` — единый словарь `NARYAD_STATUS` + `NARYAD_STATUS_LABELS`
  (`server/src/lib/naryad-status.ts`).
- ✅ **Перф-проблем GAS нет** (реляционная БД, индекс по `orderNumber`) —
  очередь ОТК/списки мастеров отвечают мгновенно.

## Следующий шаг

1. **Master: Dashboard + очередь печати (минимум)**; далее безопасность
   (rate-limit, секреты вне defaults).
2. (опц.) Проверить автовосстановление стека после полной перезагрузки
   Windows (ожидается: Docker Desktop поднимается сам, `restart: unless-stopped`
   поднимает контейнеры без ручных команд).

## Активный URL

- Локальный dev: `http://localhost:3000` (`GET /health` — `{status:'ok', db:'ok'}`).
- **Глобальный (Tailscale Funnel):** `https://el-konstr04.tail13402b.ts.net`
  (проброс на `127.0.0.1:3000`, без установки чего-либо на клиенте). Проверен
  через интернет: `/health` 200, `/login` рендерится.

## Справочники

- Архитектура/роли/данные: `docs/specs/architecture.md`, `docs/specs/roles.md`,
  `docs/specs/data-model.md`.
- E2E-алгоритм запуска: `docs/testing/e2e-runbook.md` (актуален: 18/18 PASS
  против `localhost:3000`).
- VBA REST-интеграция: `server/docs/vba-integration.md`.
- Отчёт с приоритетами паритета: `docs/reports/2026-09-10-future-architecture-review.md`.