# Аналитика мастера (Этап 3) — спецификация

Статус: план реализации Этапа 3 (согласован 14.09.2026). Живой код —
`server/src/lib/analytics.ts`, `server/src/routes/analytics.routes.ts`,
`server/src/views/master-app.ejs`.

## Цель

Вернуть роли `master` «полную картину» (паритет с GAS-противом) без дублей:
оперативная сводка + дерево номенклатуры с метриками + отчёты/история, всё из
единого серверного источника метрик.

## Принципы

1. **Единый источник метрик.** Все агрегации определены один раз в
   `server/src/lib/analytics.ts`. Единственный endpoint — `GET /api/analytics/dashboard`
   (роль `master`). Вью рендерят только отображение данных ответа; второй
   реализации метрики в UI нет.
2. **Ground truth — факты, а не хрупкие статусы.** «Загруженность» и
   «выполнение» считаются из `WorkOrders` / `Transitions` / `Shifts` /
   `ClosedOrders`. Поля-статусы `Launches.status` показываются отдельной
   карточкой как есть (`to_launch/issued/in_work/done`), но не смешиваются с
   фактологическими метриками.
3. **Калька структуры — один раз.** Группировка номенклатуры по узлам
   (`Catalog.code` — позиция в дереве; узел = `code` без последнего сегмента,
   подпись узла — его `name`) выносится в `server/src/lib/catalog-tree.ts` и
   используется и `/api/catalog/tree/units`, и аналитикой. Идентификация детали в
   UI — «Обозначение — Наименование»: позиции узлов не показываются.
   Смешанные разделители кодов (`.` и `/`) нормализуются при построении дерева:
   `splitCode()` режет по `/[./]/`, каждый узел определяется по нормализованному
   ключу (все сегменты, соединённые `/`), исходный код позиции сохраняется через
   `byNorm` (смешанные разделители не ломают иерархию: `21.1/9`, `1.1.1` — с
   корректной вложенностью).

## Термины (без дублей)

| Термин | Определение | Источник |
|---|---|---|
| «Загруженность ПА» | ПА, на которых есть активные запуски (`Launches.status ≠ done`), с числом запусков и суммарным объёмом | `Launches.paNumber` |
| «Занятые станки» | Станки с открытой сменой (`Shifts.status = open`), + оператор и время начала | `Shifts` × `Equipment` |
| «Свободные станки» | `Equipment` минус занятые | `Equipment` |
| «Активные наряды» | `WorkOrders` не `closed` (включая `rework`) по статусам | `WorkOrders.status` |

## Эндпоинт

`GET /api/analytics/dashboard` (Bearer `master`).

Query для отчётов: `?from=YYYY-MM-DD&to=YYYY-MM-DD` (по умолчанию `from` = 30
дней назад, `to` = сегодня). Фильтр применяется к `ClosedOrders.closedAt`.

Ответ одним JSON:

```jsonc
{
  "summary": {
    "launchesByStatus": { "to_launch": 0, "issued": 0, "in_work": 0, "done": 0 },
    "ordersByStatus": { "created": 0, "in_progress": 0, "waiting_otk": 0, "rework": 0, "closed": 0 },
    "paLoad": [ { "paNumber": "001", "launches": 2, "qty": 30 } ],
    "machinesBusy": [ { "machine": "Т1-1", "operator": "Иванов", "since": "2026-09-14T08:00:00Z" } ],
    "machinesIdle": [ "Т1-2" ]
  },
  "nomenclature": {
    "units": [
      {
        "code": "21",
        "name": "Подъёмные агрегаты",
        "designation": "",
        "item": null,
        "children": [
          {
            "code": "21.1",
            "name": "Полуприцеп",
            "item": null,
            "children": [
              {
                "code": "21.1/9",
                "name": "Гидробак",
                "item": null,
                "totals": { "activeLaunches": 1, "inWork": 2, "closed": 5 },
                "children": [
                  { "code": "21.1/9/18", "name": "Опора", "item": { "…": "…" },
                    "totals": { "activeLaunches": 0, "inWork": 0, "closed": 1 } }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "reports": {
    "from": "2026-08-15", "to": "2026-09-14",
    "exec": { "orders": 3, "qty": 45, "accepted": 42, "defect": 3, "defectPct": 7.1 },
    "operators": [
      { "operator": "Иванов", "orders": 2, "qty": 30, "accepted": 30, "defect": 0, "defectPct": 0, "time": 6.5 }
    ],
    "machines": [
      { "machine": "Т1-1", "orders": 2, "qty": 30, "accepted": 30, "defect": 0, "defectPct": 0, "time": 6.5 }
    ],
    "daily": [
      { "day": "2026-09-10", "orders": 1, "qty": 15, "accepted": 15, "defect": 0, "time": 4.0 }
    ]
  }
}
```

Поля метрик позиции номенклатуры (аккумулируются снизу вверх в `totals` узла):
- `activeLaunches` — число запусков `status ≠ done` по `partCode`;
- `inWork` — наряды `created | in_progress | rework`;
- `closed` — наряды `closed`.

## Импорт номенклатуры

Полный каталог загружается из Excel-файла («Номенклатура продукции.xlsm»,
лист «Продукция», данные с row 8) скриптом `server/scripts/import-excel.ts`:

```powershell
cd server
npm run import:excel -- "C:\путь\Номенклатура продукции.xlsm"   # DATABASE_URL → стенд
```

Скрипт: читает xlsx-архив без внешних зависимостей (zip + sharedStrings),
маппит колонки (код, наименование, обозначение, обозначение(предыдущее),
КОЛИЧЕСТВО, Т/О, Покрытие, Длина, Тип, Материал, Марка, ф/S, Стенка, Масса
на дет., Масса), `dropOrphanRefs()` удаляет orphan-ссылки (запуски/наряды на
коды, отсутствующие в новом каталоге), затем атомарно (в транзакции) —
`deleteMany` каталога + `createMany` пачками по 500. X-файл в git не хранится
(путь — аргументом). Историческая связка ЗП-260914-062420/Н-260914-062458
(`partCode=1.1/1/1`) при импорте удалена как orphan.

## Поля отчётов

- `exec` — из `ClosedOrders` за период: нарядов, суммарный объём (`WorkOrders.qty`),
  принято/брак (суммы `acceptedTotal`/`defectTotal`), доля брака %.
- `operators` / `machines` — те же показатели, сгруппированные по
  `WorkOrders.operator` / `WorkOrders.machine`; `time` — суммарные нормо-часы
  (`Transitions.time`) нарядов группы. Сортировка — по убыванию `orders`.
- `daily` — временной ряд закрытых нарядов по дням (`closedAt`): нарядов, объём,
  принято/брак, нормо-часы. Питает график «Динамика закрытия нарядов» на
  вкладке «Отчёты» (добавлено на Этапе 4).

## UI `/master` (вкладки)

Навигация в шапке — вкладки (JS-переключение панелей, активна «Сводка»):

| Вкладка | Содержимое |
|---|---|
| Сводка | карточки статусов запусков и нарядов; Загруженность ПА; Занятые/свободные станки; Активные наряды (вкл. «Доработка») |
| Планирование | текущий экран без изменений (сводка статусов + создание запуска + список) |
| Номенклатура | сворачиваемое дерево узлов; колонки: код, наименование, в запуске, в работе, закрыто; итоги по узлу |
| Отчёты | период-picker (от/до, по умолчанию 30 дней) + «Выполнение за период» + таблицы по операторам и станкам |

Один запрос `/api/analytics/dashboard` питает Сводку, Номенклатуру и Отчёты;
вкладка «Планирование» использует существующую `loadAll()` (`/api/launches`,
`/api/catalog`).

## Файлы

- new `server/src/lib/catalog-tree.ts` — `buildCatalogTree(items)` (вложенное
  дерево, нормализация `.`/`/`, `accumulateTotals()`).
- new `server/src/lib/analytics.ts` — `getDashboard({ from, to })`.
- new `server/src/routes/analytics.routes.ts`.
- edit `server/src/app.ts` — mount `/api/analytics`.
- edit `server/src/routes/catalog.routes.ts` — `/tree/units` на `buildCatalogTree`.
- edit `server/src/views/master-app.ejs` — вкладки + секции; renderTree —
  рекурсивные `<details class="tree-node">`.
- new `server/scripts/import-excel.ts` — импорт полного каталога из Excel в `Catalog`
  (`npm run import:excel`), атомарная замена + `dropOrphanRefs()`.
- docs: `docs/specs/architecture.md` (таблица модулей), `docs/specs/roles.md`
  (назначение страницы мастера), STATUS.md, отчёт в `docs/reports/`.

## Вне объёма

- «Брак по причинам» (`defectReason`) — бэклог (дёшево добавить позже).
- Очередь печати — экрана нет; `PrintQueue` продолжает писаться при выдаче.
- Выставление `Launches.status = in_work` динамически — отдельный вопрос.
- Сервисный слой инвариантов — отдельный вопрос.

## Проверка

- `npm run build` + `npm run check` PASS.
- API-smoke: `/api/analytics/dashboard` с токеном `master` (shape, `?from/to`).
- Playwright: 4 вкладки рендерятся; цифры согласованы с БД.
- E2E: `test_master.py` → вкладки; полный прогон (18/18 после обновления мастера).