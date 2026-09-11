# Runbook: запуск E2E-тестирования «ЦифровойНаряд» (new-стек)

Проверенный алгоритм запуска E2E-прогонов по ролям. Применять после каждого
деплоя (Docker) и при жалобах «пишет Загрузка…/пустая страница».

> Статус: харнесс `tests/e2e/` к новому стеку **адаптируется** (см.
> `docs/specs/architecture.md` и `docs/reports/2026-09-10-future-architecture-review.md`).
> Ниже — целевой алгоритм против `localhost:3000`. Пока адаптация не завершена,
> прогоны против GAS `/exec` живут только в ветке `google-apps`.

## Почему новый алгоритм (коротко)

Google-шлюз и sandboxed-iframe остались в прошлом:

1. Новый стек — обычный веб-сервер на `localhost:3000` (JWT внутри `localStorage`).
   **Никакой Google-сессии не нужно** — каждый прогон логинится по форме `/login`
   (bcrypt-сверка, `POST /api/login` → access+refresh токены).
2. Приложение рендерит **полную страницу** (EJS), а не sandboxed-iframe →
   селекторы — обычные запросы к top-frame, `#login` и весь UI ищутся напрямую.
3. Чистый контекст на прогон (как и раньше, `storage_state.json` уходит в прошлое)
   — localStorage приложения пуст → форма логина стабильно видна.

## Структура (целевая)

`tests/e2e/`:
- `config.py` — `APP_URL=http://localhost:3000`, учётные данные ролей из сида
  (env-переопределяемые), карта лендингов.
- `helpers.py` — вход по форме `/login`, скриншоты, ожидания.
- `runner.py` — общий прогон роли в чистом контексте + сводка PASS/FAIL.
- `test_operator.py`, `test_otk.py`, `test_master.py`, `test_shift.py` — ролевые сценарии.
- `profile/`, `screenshots/`, `.secrets/` — артефакты, **в git не идут** (`.gitignore`).

GAS-специфика (Google-сессия, фреймы, `session_setup.py`) перенесена в ветку
`google-apps`.

## Шаг 1. Подъём стека

```powershell
cd server
npm ci
# server/.env — из server/.env.example (DATABASE_URL=…@localhost:5432/MOSD)
npm run db:migrate
npm run db:seed
npm run dev
```

Smoke: `GET http://localhost:3000/health` → `{status:'ok', db:'ok'}`.

## Шаг 2. Прогон ролей

Проверяется: вход по форме `/login` → страница роли отрисована (текст из
top-frame) → **F5 не возвращает форму входа** → (оператор) вкладки.

```powershell
cd <корень проекта>
python tests/e2e/test_operator.py
python tests/e2e/test_otk.py
python tests/e2e/test_master.py
python tests/e2e/test_shift.py
```

Каждый тест выводит `[PASS]/[FAIL]` и сводку; код выхода `0` — все прошли,
`1` — есть падения. Скриншоты плюс лог консоли — в `screenshots/`.

Ожидаемые результаты: operator **6/6**, otk **4/4**, master **4/4**, shift **4/4**
(эталон 18/18).

## Шаг 3. Переопределение данных при необходимости

- URL: `$env:ND_APP_URL="http://localhost:3000"`.
- Учётные данные роли (fallback — сид: логины `master`/`operator`/`otk`/`shift`,
  пароль `123`):
  `$env:ND_LOGIN_OPERATOR`, `$env:ND_PASSWORD_OPERATOR`, `$env:ND_NAME_OPERATOR`
  (аналогично `_OTK/_MASTER/_SHIFT`).

## Когда прогонять

- После деплоя (Docker) или значимых правок сервера/вью.
- При «Загрузка…»/пустой странице — быстрая диагностика через `/health` и API-логи.
- При точечном изменении авторизации/вью роли — минимум затронутая роль, желательно все 4.

## Дальнейшее развитие

Текущие сценарии покрывают вход + рендер + re-логин. Полный бизнес-цикл
(shift выдаёт наряд → оператор → ОТК → закрытие/доработка) автоматизировать
после адаптации харнесса и фикса rework-цикла (`/my/list`).