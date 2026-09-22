# Этап 15: Смена боевых паролей + защита seed от сброса — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use executing-plans approach task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Задать один боевой пароль (≥8) всем 5 сидовым аккаунтам на обоих контурах так, чтобы деплой/seed больше не сбрасывал его к `123`.

**Architecture:** Точечные правки двух TS-файлов (`set-passwords.ts` += admin + dotenv; `seed.ts` — пароль только при create), применение через `npm run passwords` на `MOSD` и на стенд `digital_narad:5434`, пересборка образа стенда, E2E с env-кредами.

**Tech Stack:** tsx, Prisma, bcrypt, Docker Compose, Playwright-E2E.

**Spec:** bounded-дизайн, одобренный пользователем в чате (22.09.2026).

## Global Constraints

- Один общий пароль на роли `admin/master/shift/operator/otk`; минимум 8 символов.
- Пароль не записывать в код, git, отчёты — только в БД и gitignored-файл E2E.
- Оба контура: локальный `MOSD` (`localhost:5432`) и стенд `digital_narad` (host-порт `5434`).
- Деплой стенда — только после явного согласия пользователя.
- Коммиты: русские, Conventional-ish. Перед коммитом: `cd server && npm run build && npm run check`.
- Секреты E2E — только `tests/e2e/.secrets/` (`.gitignore`).
- Тест-фреймворка в `server/` нет — верификация функциональными пробами (bcrypt-сверка, HTTP-login, E2E).

---

### Task 1: Код — скрипт паролей и фикс seed

**Files:**
- Modify: `server/scripts/set-passwords.ts` — `import 'dotenv/config'` первой строкой, `logins` += `'admin'`.
- Modify: `server/prisma/seed.ts` (`seedEmployees`) — upsert `update: {}` (пароль/роль/ФИО только при create).

- [ ] Step 1. Правки двух файлов.
- [ ] Step 2. `npm run build` + `npm run check` → PASS.
- [ ] Step 3. Коммит `fix: скрипт паролей включает admin и грузит .env; seed не сбрасывает пароли существующих аккаунтов`.

### Task 2: Применение паролей на обоих контурах

- [ ] Step 1. Стенд: `DATABASE_URL` на `localhost:5434` (креды из `server/.env` POSTGRES_*) → `npm run passwords -- "<ПАРОЛЬ>"` → 5× `ok`.
- [ ] Step 2. MOSD: `npm run passwords -- "<ПАРОЛЬ>"` (DATABASE_URL из `server/.env`) → 5× `ok`.
- [ ] Step 3. Доказательства (оба контура): bcrypt `compare(<ПАРОЛЬ>, hash)=true`, `compare('123', hash)=false` (tsx-проба).

### Task 3: Деплой стенда + устойчивость к seed

- [ ] Step 1. Явное «да» пользователя на пересборку.
- [ ] Step 2. `docker compose up -d --build` → `/health` ok.
- [ ] Step 3. После рестарта (seed прогонян): login новым паролем → 200, `123` → 401; `docker compose restart app` + login 200.

### Task 4: E2E с боевым паролем

- [ ] Step 1. `tests/e2e/.secrets/e2e.env` (gitignored): `ND_PASSWORD_{ADMIN,OPERATOR,OTK,MASTER,SHIFT}` = ПАРОЛЬ; `git check-ignore` → ignored.
- [ ] Step 2. Ролевой E2E: operator 6 + otk 4 + master 12 + shift 4 + admin 5 → **31/31 PASS**.
- [ ] Step 3. `test_bizcycle.py` → **51/51 PASS**, стенд чист.

### Task 5: Документация, STATUS, финальный коммит

- [ ] Step 1. `docs/testing/e2e-runbook.md` (Шаг 3: `.secrets/e2e.env`, `ND_PASSWORD_*` вкл. `_ADMIN`), `server/docs/onboarding.md`, `server/prisma/data/README.md` (seed: пароль только при create).
- [ ] Step 2. `docs/reports/STATUS.md` (Этап 15, закрыть пункт «Смена паролей»; пароль не писать) + датированный отчёт `docs/reports/2026-09-22-passwords-seed-fix.md`.
- [ ] Step 3. Финальный коммит `docs:`; тег — по согласию пользователя.

## Self-review

Покрытие дизайна: admin в скрипте ✓, dotenv ✓, seed `update:{}` ✓, оба контура ✓, деплой ✓, E2E env ✓, доки/STATUS ✓. Плейсхолдеров нет; `<ПАРОЛЬ>` — секрет сознательно вне документа. Имена файлов/команд сверены с репозиторием.
