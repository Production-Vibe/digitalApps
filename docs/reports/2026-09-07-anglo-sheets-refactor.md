# Отчёт этапа: перестройка флоу на англоязычные листы (реализация ADR-003, вариант A)

**Дата:** 07.09.2026
**Модули:** `modules/Config.md`, `modules/NaryadAPI.md`, `modules/OtkUI.md`,
`modules/Auth.md`, `modules/PlanningAPI.md`, `modules/ShiftUI.md`
**Документация:** `docs/specs/data-model.md`, `docs/specs/roles.md`,
`docs/specs/architecture.md`, `README.md`, `AGENTS.md`, `docs/reports/STATUS.md`
**ADR:** `docs/specs/adr/ADR-003-workorders-naryady-single-source.md` (вариант A)

---

## Решение (согласовано с пользователем)

- `WorkOrders` — канон наряда (добавлена колонка `Причина доработки`);
- переходы — англоязычный лист `Transitions`;
- итоги закрытия — англоязычный лист `ClosedOrders`;
- сотрудники — `Employees` (переименование `Сотрудники`);
- кириллические листы `Наряды`/`Переходы`/`Закрытые`/`Сотрудники` — легаси,
  в флоу не участвуют;
- оператор/ОТК читают карточку наряда напрямую из канона `WorkOrders`;
- VBA-функции переведены на новые листы (не заглушены), полный переезд VBA — отдельным этапом.

## Что сделано

### 1. `modules/Config.md`
- `SHEET_EMPLOYEES = 'Employees'`, `SHEET_NARYADY = 'WorkOrders'`,
  `SHEET_TRANSITIONS = 'Transitions'`, `SHEET_CLOSED = 'ClosedOrders'`;
- комментарии актуализированы (канон наряда — `WorkOrders`, кириллица выведена из флоу).

### 2. `modules/NaryadAPI.md` (основной объём)
- `getNaryady`/`getNaryad`/`getNaryadStatus`/`setNaryadStatus` — читают/пишут
  канон `WorkOrders` (колонка `Номер`, статус `Статус`).
- `naryadRowToObject` — маппинг на колонки `WorkOrders`: `Номер`, `Наименование`
  (→ `detail_name`), `Код детали`, `Кол-во`, `Статус`, `Причина доработки`.
  Выходные имена полей (`id`, `detail_name`, `status`, ...) не изменились —
  клиент Operator/Otk менять не потребовалось.
- `getTransitions`/`transitionRowToObject`/`readTransitionRawField`/
  `getAllTransitionsRaw` — лист `Transitions` (заголовки `Номер наряда`,
  `№ перехода`, ...).
- `getClosingInfo`/`closeNaryad` — лист `ClosedOrders` (заголовок `Номер наряда`).
- `operatorSubmitTransition` — проверка закрытого статуса через объект
  (`naryadRowToObject`), не по сырому индексу.
- `renderNaryad` (страница `?page=naryad`) — переведён на объекты
  (`naryadRowToObject`/`transitionRowToObject`), без сырых индексов.
- `createNaryad` (VBA) — пишет в `WorkOrders` (колонки `Номер`/`Код детали`/
  `Наименование`/`Кол-во`/`Статус`); при существующем номере возвращает `exists`
  (не дублируем канон, ADR-003).
- `createTransition`/`completeTransition`/`checkTransition` — лист `Transitions`
  с заголовками `Номер наряда`/`№ перехода`/`Принято`/`Брак`.

### 3. `modules/OtkUI.md`
- `setNaryadReworkReason` — по колонке `Номер` листа `WorkOrders`;
- шапка модуля актуализирована (работа с каноном `WorkOrders`).
- `getOtkQueue` при этом теперь строится из `WorkOrders` (исходный код
  `getNaryady` + `naryadRowToObject`) — это закрывает «пустую OTK-очередь».

### 4. `modules/Auth.md`
- сообщение об ошибке авторизации: «Лист Employees не найден».
  (`checkAuth` уже читал `SHEET_EMPLOYEES`.)

### 5. `modules/PlanningAPI.md`, `modules/ShiftUI.md` (робастность)
- создание заголовков `WorkOrders` при вставке листа дополнено колонкой
  `Причина доработки` (в `createWorkOrderFromQueue` — колонка 13,
  в `issueWorkOrder` — колонка 14 после `Launch ID`).

### 6. Документация
- `docs/specs/data-model.md`: канон `WorkOrders` (+ `Launch ID`, `Причина доработки`,
  статус `rework`), перехода — `Transitions`, итоги — `ClosedOrders`,
  сотрудники — `Employees`; статусная таблица приведена к `WorkOrders`.
- `docs/specs/roles.md`, `docs/specs/architecture.md`: листы/роли/статусы
  приведены к новой модели.
- `README.md`, `AGENTS.md`: списки листов/ролей актуализированы (11 листов флоу).
- `docs/reports/STATUS.md`: живое состояние обновлено (этап, TODO подготовки листов,
  открытые/закрытые баги, следующим шаг, активный URL + ожидание нового деплоя).

## Как проверено

- `node .opencode/skills/digitalapps-deploy/scripts/check-modules.js` — все 13
  модулей PASS (включая inline-скрипты UI): Config, NaryadAPI, OtkUI, Auth,
  PlanningAPI, ShiftUI и остальные.
- Сверка «нет жёстких кириллических адресов листов» в `modules/*.md` — остались
  только UI-подписи (табы «Переходы»/«Закрытые»), комментарии и сообщения.
- `grep \\' modules/*.md` — 0 вхождений в изменённых UI-модулях.

## Что осталось / следующий шаг

1. **Подготовка листов вручную (пользователь):** переименовать `Сотрудники` →
   `Employees`; создать `Transitions` (`Номер наряда, № перехода, Описание,
   Оператор, Время, Плавка, Станок, Кол-во, Статус, Дата, Принято, Брак`);
   создать `ClosedOrders` (`Номер наряда, Принято всего, Брак всего,
   Причина брака, Комментарий, Кем закрыт, Дата`); добавить колонку
   `Причина доработки` в `WorkOrders` (код читает по имени, позиция не важна;
   если лист вставляется кодом — создаётся автоматически).
2. **Деплой (ручной, по согласию):** скопировать изменённые модули
   (Config, NaryadAPI, OtkUI, Auth, PlanningAPI, ShiftUI) в редактор Apps Script,
   «Новая версия», зафиксировать новый URL, записать манифест
   (`deploy-manifest.md`).
3. **E2E-бизнес-цикл на новом деплое:** shift выдача → оператор (смена, приём,
   переходы) → `waiting_otk` → ОТК приёмка/закрытие/доработка → итог в
   `ClosedOrders`. В т.ч. довести OTK-шаги, зависавшие из-за пустой очереди.
4. Полный переезд VBA и печати — отдельным этапом.

## Замечания

- `createNaryad` (VBA) переведён на `WorkOrders` буквально: при совпадении номера
  возвращает `exists` (не дублирует канон). Возможные нестыковки при параллельной
  выдаче shift-пути и VBA — resolved при полном переезде VBA.
- Колонка `Причина доработки` в `WorkOrders` может соседствовать с `Launch ID`
  (зависит от того, создавался ли лист через `issueWorkOrder`); чтение/запись —
  по имени колонки, поэтому позиция не критична.