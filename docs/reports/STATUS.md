# STATUS.md — живое состояние проекта «ЦифровойНаряд»

> Единая всегда-актуальная сводка для быстрого входа в контекст нового диалога.
> Читать при старте каждого диалога (см. AGENTS.md → приоритет чтения).
> Обновлять по завершении каждого этапа (см. AGENTS.md → Definition of Done).

## Стек и ветки

- **`main`** — новый стек: Node/Express (TypeScript) + EJS + Prisma + PostgreSQL,
  JWT + bcrypt. Монолит без UI-фреймворков. Деплой — **Docker Desktop** (Windows,
  контекст `desktop-linux`, engine 29.7.2) + PM2 (в доводке).
  **Два контура БД (важно):** стендовый/комpose-контур — Docker-PG на
  host-порту **`5434:5432`** (в контейнере БД `digital_narad`, юзер `user`;
  внешние SQL-клиенты: `localhost:5434`); дев-контур (`npm run dev`,
  `server/.env`) — **локальный Windows-PostgreSQL** на `localhost:5432`/БД `MOSD`,
  `production_user` (на момент 14.09.2026 локальный PG
  фактически снова запущен; STATUS от 14.09 ранее утверждал «остановлен» — уже не
  так). Данные контуров различаются; E2E идёт против стендовой `digital_narad`.
- **`google-apps`** — легаси Google Apps Script (модули, GAS-скиллы, GAS-доки,
  E2E против `/exec`, манифест деплоя). В `main` не переносить без явного решения.
- Код-модули: `server/src/**`; схема БД (канон) — `server/prisma/schema.prisma`
  (11 моделей, 6 enum).

## Последний завершённый этап

- **17.09.2026 — Этап 9: полная номенклатура из Excel + правильное дерево.**
  Каталог заменён полным Excel-файлом («Номенклатура продукции.xlsm», лист
  «Продукция», 2208 позиций, данные с row 8): скрипт
  `server/scripts/import-excel.ts` (`npm run import:excel -- <путь>`) читает
  xlsx-архив без внешних зависимостей (zip + sharedStrings), маппит 14 колонок
  (код, наименование, обозначение, обозначение(пред.), КОЛИЧЕСТВО, Т/О,
  Покрытие, Длина, Тип, Материал, Марка, ф/S, Стенка, Массы),
  `dropOrphanRefs()` удаляет orphan-ссылки (запуски/наряды на коды, которых
  нет в новом каталоге — удалены историческая связка ЗП-260914-062420/
  Н-260914-062458 `partCode=1.1/1/1`), затем атомарно: `deleteMany` каталога +
  `createMany` пачками по 500. **Дерево номенклатуры читает смешанные
  разделители:** `catalog-tree.ts` переписан — `splitCode()` режет по
  `/[./]/`, узлы строятся по нормализованному ключу (все сегменты через `/`),
  исходный код позиции сохраняется через `byNorm`; `accumulateTotals()`
  аккумулирует метрики (в запуске/в работе/закрыто) по поддереву в `totals`.
  **UI:** вкладка «Номенклатура» мастера — рекурсивное сворачиваемое дерево
  (`master-app.ejs` renderTree, `<details class="tree-node">`; стили `.tree-*` в
  `styles.css`). **Сервер:** `/api/catalog` больше не режет вывод (`take:500`
  только при поиске/приоритете — отдаёт все 2208), `/tree/units` возвращает
  вложенное дерево с метриками; `analytics.ts` nomenclature — `units` вложенное
  дерево (`CatalogTreeUnit<CatalogMetricNode>`). `seed.ts`: сид каталога — только
  при пустой таблице (не затирает импортированный каталог). XLSM в git не
  трекается (`.gitignore`, путь — аргументом). **Деплой:** образ пересобран
  (`docker compose up -d --build`), `/health` ok. **Проверки:** `npm run build` +
  `npm run check` PASS (после `npx prisma generate` — npm ci не запускает
  postinstall); API-smoke против стенда: `GET /api/catalog`=2208, дерево 22
  топ-уровня (1–22), макс. глубина 7 (`21.1/1/2/1/1/7`), `21.1/9`=«Гидробак»
  с обозначением «МТ 03.01.010.00.000 СБ», агрегаты `totals`=0 на чистом
  стенде; браузерный probe **9/9 PASS** (разворачивание 21→21.1→Гидробак→лист
  «Штуцер G1», поиск «Гидробак» по каталогу с обозначением, без ошибок
  консоли); штатный E2E **26/26 PASS** (operator 6, otk 4, master 12, shift 4;
  селекторы вкладок не менялись). Стенд: Catalog=2208, Launches/WorkOrders=0
  (связка удалена), открытые смены Т1-2/Т1-1 сохранены.
- **17.09.2026 — Этап 8: уведомления ролей (внутри приложения) + скрипты запуска.**
  Внутренние уведомления нового события → получателю: колокольчик «Уведомления»
  в шапке всех 4 ролей (`initNotifications()` в `ui.js`, поллинг `GET
  /api/notifications/my` каждые 15 с), бейдж непрочитанных на токене `--error`,
  тост при появлении, dropdown со списком (клик → `read` + переход по `link`).
  **БД:** модель `Notification` (11-я; `targetLogin`/`targetRole`, type, title,
  message, link, isRead; индексы по `[targetLogin, isRead]`/`[targetRole,
  isRead]`), миграция `20260917034617_add_notifications`. **Сервер:**
  `lib/notify.ts` (`notifyOperator(fullName,…)` по ФИО → `Employees.login`,
  `notifyRole(role,…)`), `notifications.routes.ts` (`/my`, `/:id/read`,
  `/read-all`, все под `requireAuth`). **Хуки:** `workorders/issue` → оператор
  (`naryad_issued`), `transition-logic.updateNaryadStatus` → ОТК при переходе в
  `waiting_otk` (только при смене статуса — без дублей), `otk/rework` → оператор
  (`rework`), `launches POST` → shift (`launch_created`), `otk/close` →
  оператор+master+shift (`naryad_closed`). Описано в `docs/specs/notifications.md`.
  **Деплой:** образ пересобран (`docker compose up -d --build`), миграция
  применена в контейнере (`migrate deploy` + seed), `/health` ok; открытые смены
  оператора (Т1-2, Т1-1) не тронуты. **Проверки:** `npm run build` +
  `npm run check` PASS; E2E **26/26 PASS** (в тексте оператора появилась кнопка
  «Уведомления», селекторы не менялись); API-smoke **14/14 PASS** полного цикла
  (запуск→shift, выдача→оператор, переход→ОТК, rework→оператор, закрытие→
  мастер+shift+оператор, mark-read, read-all); браузерный probe: бейдж=1,
  dropdown с текстом, клик → переход по `link`, бейдж скрывается. Тест-данные
  удалены — стенд чист. **Также:** запущены в git скрипты старта
  (`run-site.cmd` + bat-обёртки локально/глобально), волатильный Funnel-URL
  остаётся настройкой пользователя (обёртки в репозитории).
- **16.09.2026 — Этап 7: смены оператора — «вторая смена» и сворачиваемая история.**
  `renderShifts()` в `operator.ejs` переработан: (1) открытые смены всегда видны сверху
  панели «Смены» (ID, станок, дата, кнопка «Закрыть»); (2) форма «Открыть смену»
  видна, пока открытых смен **меньше 2** — подписи «Откройте смену на станке» (0)
  и «Можно открыть ещё одну смену» (1); при 2 открытых форма скрыта и показывается
  «Максимум 2 открытые смены» (лимит сервера, `shifts.routes.ts`, == 2); (3) история
  сворачивается в `<details><summary>История смен (N)</summary>` (закрыта по
  умолчанию; внутри — закрытые/авто-закрытые смены, без «Закрыть»). Сервер не
  менялся — только вью. **Деплой:** образ пересобран (`docker compose up -d --build`),
  `/health` ok. **Проверки:** `npm run build` + `npm run check` PASS; E2E **26/26 PASS**;
  браузерный probe против станда: история свёрнута → клик по summary раскрывает/
  скрывает; закрытие одной смены → форма «ещё одну» возвращается; открытие второй →
  форма скрыта, «Максимум 2»; зачищено — смены стенда приведены к исходному виду
  (открыты Т1-2 + Т1-1).
- **15.09.2026 — Этап 6: правило округления чисел «максимум 2 знака, мелкие — до первой значащей цифры».**
  Единое «умное» округление во всех числовых данных: `|x| ≥ 0.01` → максимум 2 знака
  (`2.567 → 2.57`), `0 < |x| < 0.01` → до 1 значащей цифры (`0.0005643 → 0.0006`),
  `0 → 0`, хвостовые нули в отображении убираются (`2.50 → «2.5»`). Одна функция
  `roundSmart(n)` в **`server/src/lib/round.ts`** применяется и при сохранении в БД,
  и в агрегатах, и в UI (JS-зеркало в `server/src/public/ui.js` — `roundSmart` +
  `fmtNum`). **Сервер:** округление на записи в `launches` (POST/PUT qty),
  `workorders/issue` (qty в WorkOrders+PrintQueue), `transitions` (POST time/qty,
  `/check` accepted/defect), `otk/close` (суммы accepted/defect), `vba/ingest`
  (time/qty переходов); агрегаты `analytics.ts` — `paLoad`, `daily`, `exec`,
  `toGroupRow` (qty/accepted/defect/time) отдают уже округлённые значения.
  **UI:** все интерполяции чисел в master-app («ПА», итоги/разрезы, «Запуски», дерево
  «Номенклатуры»), shift-app (таблицы + модалка выдачи, `issueQty`), operator-app
  (наряд/модалка перехода, `trTime`/`trQty`), otk-app (очередь, переходы
  time/qty/accepted/defect, prompt ОТК) переведены на `fmtNum`/`roundSmart`;
  underline: `accepted`/`defect` = 0 показывает «0», null — пусто; подписи осей
  графиков (`y1` — precision 2). **Деплой:** Docker-образ пересобран
  (`docker compose up -d --build`), применён на live-стенде :3000; `/health`
  `{status:'ok', db:'connected'}`. **Проверки:** `npm run build` + `npm run check`
  PASS; unit-probe `roundSmart` (0, 2, 2.567→2.57, 2.55, 2.5, 0.0005643→0.0006,
  0.009, 0.005, 0.05, 1234.5678→1234.57, 0.01) и клиентское зеркало `fmtNum`
  совпадают; API-smoke `/api/launches` POST/DELETE: `0.0005643 → сохранено 0.0006`,
  `2.567 → 2.57`, `2.55 → 2.55` (HTTP 201/200, из контейнера; тест-запуски удалены,
  стенд чист — осталась только связка ЗП-260914-062420); штатный E2E **26/26 PASS**
  (operator 6, otk 4, master 12, shift 4; селекторы не менялись). Правило округления
  зафиксировано в `docs/specs/architecture.md` (технические конвенции).
- **14.09.2026 — Этап 5: идентификация деталей «Обозначение — Наименование» + доступ к стендовой БД на порту 5434.**
  Устранены «косяки» отображения: позиции узлов (`Catalog.code`: «1.1/1/10») больше
  не выдаются за коды деталей; везде, где деталь идентифицируется, показывается
  «Обозначение — Наименование» (напр. «МТ 03.01.010.00.000 СБ — Гидробак»).
  **Сервер:** `Launches` не имел `designation` → `GET /api/launches[/:id]` теперь
  отдаёт `include: { catalog }` (`server/src/routes/launches.routes.ts`); при
  выдаче наряда пустые `name`/`designation` заполняются из `Catalog` по `partCode`
  в `WorkOrders` и `PrintQueue` (`server/src/routes/workorders.routes.ts`, `/issue`).
  **Дерево номенклатуры:** группировка в `server/src/lib/catalog-tree.ts` переведена
  с `designation.split('-')[0]` (почти каждая деталь — своя группа) на реальные
  узлы: узел = `code` без последнего сегмента, подпись узла — его наименование.
  **UI:** таблицы запусков/нарядов и модалки master/shift/operator/otk показывают
  колонку «Обозначение» (fallback `designation` из каталога/наряда) вместо
  «Деталь»-позиции; поиск по запускам shift дополнительно ищет по обозначению.
  **Доступ к БД:** стендовый контур перевешан на host-порт **5434** (конфликт с
  локальным Windows-PG на 5432; `docker port server-db-1` → `5432/tcp ->
  0.0.0.0:5434`). Внешние SQL-клиенты: `localhost:5434`, БД `digital_narad`,
  юзер `user`. Спека: `docs/specs/analytics-master.md` (правило группировки),
  `docs/specs/data-model.md` (подстановка designation при выдаче).
  **Деплой:** Docker-образ пересобран (`docker compose up -d --build`), применён на
  live-стенде :3000. **Проверки:** `npm run build` + `npm run check` PASS; штатный
  E2E **26/26 PASS** (селекторы не менялись); API-smoke — `POST /issue` с пустыми
  `name`/`designation` и реальным `launchId` → наряд создан с `designation`
  «УБРСП 80», `name` «Полуприцеп» (HTTP 201, изнутри контейнера; P2003 в
  PowerShell-smoke — артефакт кодировки PS-скрипта, не серверный баг). Стендовая БД
  приведена в чистый вид (удалены тестовые наряды/запуски/PrintQueue; осталась
  только связка из probe этапа 3 — ЗП-260914-062420/Н-260914-062458, не трогалась).
- **14.09.2026 — Этап 4: наладка интерфейса «Пульт цеха» + графики (ADR-006).**
  Остаёмся на EJS+Vanilla (React-переплатформа отложена). Дизайн-система на
  CSS-токенах в `server/src/public/styles.css`: тёмная шапка-планка (sticky),
  светлые панели, «светофор цеха» (`.badge--info/ok/warn/error`), табулярные
  цифры/моно-коды, `.empty-block`, `:focus-visible`, `prefers-reduced-motion`,
  mobile-first (Funnel с телефона). Общий JS-слой `server/src/public/ui.js`
  (`badge`, `emptyBlock`, `statCards`, `drawChart`). **Графики Chart.js v4
  вендором** (`public/vendor/chart.umd.min.js`, без CDN): Сводка — bar «Наряды по
  статусам» + bar «Загруженность ПА»; Отчёты — «Динамика закрытия нарядов»
  (bar+line, две оси) на новых данных **`reports.daily`** в
  `server/src/lib/analytics.ts` (единственная серверная правка). Выравнены
  пустые состояния на operator/otk/shift. **Деплой:** Docker-образ пересобран
  (`docker compose up -d --build`), применение на live-стенде :3000.
  **Проверки:** `npm run build` + `npm run check` PASS; штатный E2E **26/26 PASS**
  (селекторы не менялись); probe-прогон **12/12 PASS** на стенде — пустые
  состояния при пустой БД, canvas НЕ рисуется без данных, после пробного запуска
  (ЗП-260914-060800) canvas `paChart` отрисован с подписью «999», timeline —
  пустое состояние, консоль без error, mobile `/login` (390×800) ок; пробный
  запуск удалён, стенд чист (Orders/Closed/Transitions/Launches=0, Shifts=4).
- **14.09.2026 — Этап 3: аналитика мастера (сводка + номенклатура + отчёты).**
  Роль `master` получила «полную картину» из **единого серверного источника**
  метрик — `GET /api/analytics/dashboard` (`server/src/routes/analytics.routes.ts`,
  `requireAuth('master')`, `?from=&to=` для отчётов). Все агрегации — один раз в
  `server/src/lib/analytics.ts` (ground truth — факты `WorkOrders`/`Transitions`/
  `Shifts`/`ClosedOrders`, не хрупкий `Launches.status`). Ответ:
  `summary` (launches/orders по статусам, вкл. `rework`; **«Загруженность ПА»** —
  активные запуски по `paNumber`; **«Занятые станки»** — открытые смены +
  `machinesIdle`), `nomenclature` (дерево узлов + метрики позиции: активные
  запуски / в работе `created|in_progress|rework` / закрыто), `reports`
  (выполнение за период: закрыто/объём/принято/брак %/нормо-часы + разрезы по
  операторам и станкам, join `ClosedOrders→WorkOrders→Transitions`).
  UI `/master` — вкладки «Сводка / Планирование / Номенклатура / Отчёты»
  (`master-app.ejs`), «Планирование» — без изменений, дефолт — «Сводка».
  Группировка номенклатуры вынесена в `server/src/lib/catalog-tree.ts`
  (используют `/api/catalog/tree/units` и аналитика). Спека —
  `docs/specs/analytics-master.md`. **Деплой:** Docker-образ пересобран
  (`docker compose up -d --build`), применён на live-стенде :3000.
  **Проверки:** `npm run build` + `npm run check` PASS; API-smoke (shape,
  `?from/to`, агрегация на реальном заказе: qty=10, брак 1→10%, время 0.5,
  `paLoad` create→delete); штатный E2E **26/26 PASS** (operator 6, otk 4,
  shift 4, master **12** — добавлены проверки вкладок); браузерный
  probe на стенде с созданным запуском — Сводка/Номенклатура/Отчёты **ALL PASS**
  (пробный запуск удалён, стендовая БД в чистом виде: Orders/Closed/Transitions/
  Launches=0, Shifts=3 — тестовые смены пользователя сохранены).
- **14.09.2026 — Красная зона устранена: оператор снова открывает смены; добавлено «Запомнить меня».**
  Аудит живого UI всех ролей (Playwright против Docker-стенда) выявил блокер:
  в `server/src/views/operator.ejs` форма «Открыть смену» рисовалась **только при
  пустой истории смен** (`shifts.length === 0`), поэтому при наличии любой
  закрытой смены оператор не мог открыть новую → роль operator «умирала» и поток
  (выдача → оператор → ОТК) не стартовал. Триггером был smoke-хвост
  `СМ-260911-093821`. Фикс: форма «Открыть смену» показывается, когда **нет
  открытой** смены (закрытые в истории не мешают), таблица истории рендерится
  всегда. **Авторизация:** добавлен чекбокс «Запомнить меня» (`login.ejs`, по
  умолчанию включён) + `tokenStore()` в `server/src/public/api.js` — галка →
  токены/`user` в `localStorage` (переживают закрытие браузера), снята →
  `sessionStorage` (вход при каждом открытии вкладки); общий `logout()` чистит оба
  хранилища, кнопки «Выйти» всех ролей переведены на него. Проф-эволюция
  (refresh-токен в `httpOnly`-cookie) отложена в этап безопасности.
  **Деплой:** Docker-образ пересобран (`docker compose up -d --build` в `server/`),
  изменения применены на live-стенде (localhost:3000 + Funnel); БД приведена в
  чистый вид (Shifts/Launches/WorkOrders/Transitions/ClosedOrders/PrintQueue = 0,
  Catalog 29, Equipment 8, Employees 4). **Проверки:** `npm run build` +
  `npm run check` PASS; штатный E2E **18/18 PASS** (operator 6, otk 4, master 4,
  shift 4); целевой probe **14/14 PASS** (открытие смены при пустой истории →
  закрытие → форма снова видна при закрытой в истории; remember ON → localStorage,
  OFF → sessionStorage; «Выйти» чистит оба хранилища).
- **11.09.2026 — Стек переведён на Docker Desktop: глобальная ссылка перестала отваливаться.**
  Причина нестабильности `https://el-konstr04.tail13402b.ts.net` найдена: контейнеры
  крутил docker.io внутри Ubuntu-WSL, а сама Ubuntu-WSL **выключается по idle-таймауту
  (~60 с)** — контейнеры умирали вместе с виртуалкой, Funnel получал пустой
  `127.0.0.1:3000` → 502 → телефон «не может обработать запрос». Решение: Docker
  контекст выставлен в `desktop-linux` (Docker Desktop 4.90.0, engine 29.7.2), проект
  запущен через Docker Desktop (`docker compose up -d --build` в `server/`): образ
  `server-app` собран, миграции применены, сид залит, `server-db-1` healthy.
  docker.io в Ubuntu-WSL отключён (`systemctl disable --now docker docker.socket`) —
  два движка не конфликтуют за порты 3000/5432. Автозапуск Docker Desktop: Run-ключ
  HKCU присутствует (запуск при входе в Windows); флаг `AutoStart` в
  `settings-store.json` Docker Desktop сбросил на `false` при перезаписи настроек —
  проверить чекбокс «Start Docker Desktop when you sign in» в Settings→General.
  **Проверка живучести:
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

- [ ] **E2E покрывает вход+рендер+refresh+вкладки** (26/26 PASS); полный
  бизнес-цикл (выдача → оператор → ОТК → rework → закрытие) не автоматизирован —
  кандидат следующего этапа. Кейс «закрытая смена в истории → форма открытия
  видна» и содержимое вкладок аналитики покрыты probe-прогонами (14/14 и ALL
  PASS), в харнесс пока не вынесены.
- [ ] (опц.) Экран очереди печати отсутствует (`PrintQueue` пишется при выдаче,
  read-эндпоинта нет); объёмно выведен из «полной картины» мастера.
- [ ] (опц.) `auto_closed` есть в `SHIFT_STATUS` (`naryad-status.ts`), но нигде не
  выставляется; подпись «Авто-закрыта» в UI недостижима — решить судьбу статуса.
- [ ] (опц.) `POST /api/work-orders/issue` не сверяет оператора с активной сменой
  и станок с занятостью — наряд может уйти на «мёртвые» комбинации.
- [ ] (опц.) Выделить сервисный слой инвариантов (закрытие, accepted+defect≤qty,
  занятость станка) — пока rules живут в хендлерах.
- [ ] (опц.) Модель `Queue` в схеме, но не питается ни одним route: использовать
  или удалить.
- [ ] (опц.) `ClosedOrders` — запись-дубликат итогов; рассмотреть пересчёт
  проекцией из переходов.
- [ ] Безопасность перед публикацией: rate-limit на `/login`, refresh-токен в
  `httpOnly`-cookie (проф. продолжение «Запомнить меня»), смена dev-секретов
  (`config.ts`), https.

## Закрытые баги (new-стек)

- ✅ **Идентификация деталей «Обозначение — Наименование».** Позиции узлов
  (`Catalog.code`: «1.1/1/10») больше не выдаются за коды деталей; наряды/запуски
  не теряли обозначение при выдаче (`/issue` подставляет наполненный
  `designation`/`name` из `Catalog`); дерево номенклатуры группируется по реальным
  узлам (Этап 5).
- ✅ **Master урезан против GAS.** Этап 3 вернул «полную картину»: оперативная
  сводка + дерево номенклатуры с метриками + отчёты/история из единого источника
  (`/api/analytics/dashboard`). Очередь печати осталась вне объёма (задокумен­тировано).
- ✅ **Оператор не мог открыть новую смену при наличии истории.** Форма
  «Открыть смену» была видна только при пустом списке смен; любая закрытая смена
  в истории блокировала роль. Теперь форма показывается при отсутствии открытой
  смены, история рендерится всегда (`operator.ejs`).
- ✅ **«Запомнить меня».** Чекбокс входа; выбор хранилища
  (`localStorage`/`sessionStorage`) через `tokenStore()`; общий `logout()` чистит
  оба хранилища.
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

1. **Полный E2E бизнес-цикла** (выдача наряда shift → оператор смены/переходы →
   ОТК → rework → закрытие) поверх JWT-стека против `localhost:3000`; вынести в
   харнесс кейсы «закрытая смена в истории», «уведомления» и содержимое
   вкладок/графиков аналитики мастера.
2. **Web Push уведомления на телефон (Фаза 2 уведомлений):** PWA
   (`manifest.webmanifest` + Service Worker), `PushSubscriptions` +
   `POST /api/push/subscribe`, `web-push` (VAPID из `.env`) при
   `createNotification`; iOS — «на главный экран» (см. `docs/specs/notifications.md`).
3. **Безопасность перед публикацией:** rate-limit `/login`, refresh-токен в
   `httpOnly`-cookie (проф. «Запомнить меня»), секреты из env, https.
4. (опц.) Проверить автовосстановление стека после полной перезагрузки Windows
   (ожидается: Docker Desktop поднимается сам, `restart: unless-stopped` поднимает
   контейнеры без ручных команд).

## Активный URL

- Локальный dev: `http://localhost:3000` (`GET /health` — `{status:'ok', db:'ok'}`).
- **Глобальный (Tailscale Funnel):** `https://el-konstr04.tail13402b.ts.net`
  (проброс на `127.0.0.1:3000`, без установки чего-либо на клиенте). Проверен
  через интернет: `/health` 200, `/login` рендерится.

## Справочники

- Архитектура/роли/данные: `docs/specs/architecture.md`, `docs/specs/roles.md`,
  `docs/specs/data-model.md`.
- E2E-алгоритм запуска: `docs/testing/e2e-runbook.md` (актуален: 26/26 PASS
  против `localhost:3000`).
- VBA REST-интеграция: `server/docs/vba-integration.md`.
- Отчёт с приоритетами паритета: `docs/reports/2026-09-10-future-architecture-review.md`.