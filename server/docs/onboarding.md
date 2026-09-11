# Onboarding: локальный запуск и Docker «ЦифровойНаряд»

Стек: Node/Express (TypeScript) + EJS + Prisma + PostgreSQL. Исходник —
`server/src/`, схема — `server/prisma/schema.prisma`.

## Требования

- Node.js 20+, npm
- PostgreSQL 16+ (для локального dev) **или** Docker (контуры dev/prod ниже)
- Windows: запускать команды из PowerShell

## Локальный dev (без Docker)

```powershell
cd server
npm ci
Copy-Item .env.example .env   # затем проставить реальные значения
# .env: DATABASE_URL=postgresql://production_user:…@localhost:5432/MOSD
npm run db:migrate            # prisma migrate dev (применит миграции)
npm run db:seed               # tsx prisma/seed.ts (каталог + 4 роли + станки)
npm run dev                   # tsx watch src/app.ts на :3000
```

Smoke: `GET http://localhost:3000/health` → `{status:'ok', db:'connected'}`.

Начальные учётные данные (сид, пароль `123`): `master`, `shift`, `operator`, `otk`.

## Docker: prod-контур

```powershell
cd server
Copy-Item .env.example .env   # при необходимости поменять POSTGRES_*/секреты
docker compose up --build
```

Что поднимается:
- **db** — `postgres:16-alpine`, БД `digital_narad`, учётка `user/password`
  (значения `${POSTGRES_USER/PASSWORD/DB}` из `.env`).
- **app** — собранный образ (`server/Dockerfile`): `prisma migrate deploy` →
  `prisma db seed` → `node dist/app.js`.

> `DATABASE_URL` сервиса `app` в compose **переопределяется** на
> `postgresql://user:password@db:5432/digital_narad` (host `db` внутри compose-сети).
> Значение из `server/.env` (`localhost:5432/MOSD`) здесь не задействуется —
> это конфигурация локального dev-контура.

Порты: приложение `:3000` (host), БД `:5432` (host). При конфликте с локальным
PostgreSQL на 5432 — остановить локальную службу или поменять маппинг.

## Docker: dev-контур (live-reload)

```powershell
cd server
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Дополнительный сервис `app` из `docker-compose.dev.yml` монтирует `src/`, `prisma/`
и `tsconfig.json` через volume и запускает `npm run dev` (tsx watch) вместо
`dist`; seed выполняется при старте. Правки на хосте перезапускают сервер.

## Проверки

```powershell
cd server
npm run build        # tsc (типы)
npm run check        # node --check dist/app.js
```

## Полезное

- Prisma Studio: `npm run db:studio` (только локальный контур).
- Живое состояние проекта, открытые баги и следующий шаг — `docs/reports/STATUS.md`.
- E2E (Playwright) против `localhost:3000` — `docs/testing/e2e-runbook.md`.
- VBA-интеграция (REST `/api/vba/ingest`) — `server/docs/vba-integration.md`.