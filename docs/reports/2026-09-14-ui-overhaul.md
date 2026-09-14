# СТАП 2026-09-14 — Наладка интерфейса: «Пульт цеха» + графики

Дата: 14.09.2026. Ветка `main`, Этап 4 (ADR-006).

## Что сделано

### Дизайн-система «Пульт цеха» (`server/src/public/styles.css`)
- Полная перелицовка стилей на CSS-токены: гранитная шапка-планка (sticky),
  светлые рабочие панели, семантика статусов «светофор цеха»
  (`.badge--info/ok/warn/error`), табулярные цифры (`.num`), моноширинные коды
  (`.mono`).
- Компоненты: `.panel`, `.stat-card` (акцентная кромка), `.table` (заголовки
  капсом, hover), `.empty-block` (пустое состояние с маркером), `.chart-box`,
  модальные, тосты, `.alert`.
- Доступность: `:focus-visible`, `prefers-reduced-motion`, разумный контраст.
- Mobile-first (доступ через Funnel с телефона): компактная шапка, сетка
  карточек 120px, горизонтальный скролл таблиц, нижние тосты, `@media 640px`.

### Общий JS-слой (`server/src/public/ui.js`)
`badge`, `emptyBlock`, `fmtNum`, `statCards` (вынесен из master),
`chartBoxHtml`, `drawChart` (регистр графиков, destroy на перерисовку),
`resetCharts`. Подключён ко всем четырём ролевым страницам.

### Графики (Chart.js вендором, без CDN)
- `server/src/public/vendor/chart.umd.min.js` (Chart.js v4.4.7, ~201 КБ).
- **Сводка:** bar «Наряды по статусам» (цвета по статусам) и bar «Загруженность
  ПА» (объёмы по `paNumber`). Без данных — `.empty-block` вместо графика.
- **Отчёты:** «Динамика закрытия нарядов» за период (bar нарядов + line объёма,
  две оси) на новых данных `reports.daily`.

### Сервер (`server/src/lib/analytics.ts`)
- `reports.daily` — временной ряд закрытых нарядов по дням (`closedAt`):
  нарядов/объём/принято/брак/нормо-часы. Единственная серверная правка этапа.

### Страницы
- `login.ejs` — единые токены, disable кнопки на время запроса, конкретная
  подпись.
- `master-app.ejs` — контейнеры графиков на Сводке и в Отчётах, пустые состояния,
  mono-коды ПА, табулярные числа.
- `operator.ejs` / `otk-app.ejs` / `shift-app.ejs` — единые пустые состояния
  (`emptyBlock`), «По запросу ничего не найдено» при пустом фильтре shift.

## Проверки (доказательства)

- `npm run build` (`tsc`) + `npm run check` — **PASS**.
- Штатный E2E против стенда: **26/26 PASS** (operator 6, otk 4, shift 4,
  master 12; селекторы не менялись).
- Playwright-probe на стенде **12/12 PASS**: пустые состояния при пустой БД
  (8 empty-block), canvas НЕ рисуется без данных; после создания пробного
  запуска (ЗП-260914-060800) — canvas `paChart` отрисован с данными, подпись
  «999» в легенде; timeline — пустое состояние; номенклатура отрисована;
  console без error; mobile `/login` (390×800) рендерится. Пробный запуск
  удалён, стенд приведён в чистый вид: Launches/WorkOrders/Transitions/
  ClosedOrders = 0, Shifts=4 (смены пользователя).
- Деплой: Docker-образ пересобран и применён (`docker compose up -d --build`),
  `/health` → 200 `{status:'ok', db:'connected'}`.

## Осталось / бэклог

- Full E2E бизнес-цикла (выдача → оператор → ОТК → rework → закрытие) — не
  автоматизировано (следующий этап).
- Безопасность перед публикацией (rate-limit `/login`, refresh в httpOnly-cookie,
  секреты из env, https).
- Очередь печати (`PrintQueue`) — read-эндпоинта нет (вне объёма).
- «Брак по причинам» (`defectReason`) — график/разрез отложен.

## Файлы этапа

- `server/src/public/styles.css` — переписана (токены/компоненты).
- `server/src/public/ui.js` — новый.
- `server/src/public/vendor/chart.umd.min.js` — новый (вендор).
- `server/src/views/{login,master-app,operator,otk-app,shift-app}.ejs` — правки.
- `server/src/lib/analytics.ts` — `reports.daily`.
- `docs/specs/adr/ADR-006-ui-tech.md` — решение по технологии UI.
- `docs/specs/analytics-master.md` — поле `daily` в shape.
- `docs/reports/STATUS.md` — живое состояние.

## Следующий шаг

Полный E2E бизнес-цикла (администраторский стек: _Функционал смен/нарядов →
оператор → ОТК → rework → закрытие_) или этап безопасности.