# Отчёт этапа: ОТК-интерфейс (приёмка/брак/закрытие/доработка нарядов)

**Дата:** 04.09.2026
**Модули:** `modules/OtkUI.md` (новый), `modules/Auth.md`, `modules/NaryadAPI.md`,
`modules/OperatorUI.md`
**Документация:** `AGENTS.md`, `README.md`, `docs/specs/roles.md`,
`docs/specs/data-model.md`, `docs/specs/architecture.md`

---

## Что сделано

### 1. Новый модуль `OtkUI.md` — полная страница `?page=otk-app`
ОТК после логина попадает на собственную полную страницу (паттерн master/shift,
`renderOtkAppPage` определён в OtkUI и вызывается из `doGet`).

Серверные функции (защищены `isRole(name,'otk')`):
- `getOtkQueue()` — наряды `!= closed` по категориям: **Ждут ОТК** (`waiting_otk`),
  **Доработка** (`rework`), **В работе** (`in_progress`/`created`); у каждого —
  агрегат по `Переходы` (проверено/всего, принято/брак) и причина доработки.
- `getOtkNaryad(id)` — карточка наряда (наряд + переходы + closingInfo).
- `otkCheckTransition(...)` — отметить переход `checked` + принято/брак.
- `otkReturnToRework(...)` — статус `rework` + запись «Причины доработки».
- `otkClose(...)` — закрытие наряда (обёртка `closeNaryad`).

UI: очередь по вкладкам → карточка наряда → по каждому переходу поля
«Принято/Брак» + «Проверить» → панель решения (disposition):
принято / принято с отклонением / брак-частичный / **вернуть на доработку**.

### 2. Новый статус наряда `rework` («Доработка»)
- Жизненный цикл: `created → in_progress → waiting_otk → closed`, а также
  `rework`: ОТК вернул оператору → оператор правит → снова `waiting_otk` → `closed`.
- `updateNaryadStatus` (derived) учитывает `rework`: после добавления оператором
  перехода наряд возвращается в `waiting_otk`.
- `operatorSubmitTransition` теперь вызывает `updateNaryadStatus` (раньше наряд
  после переходов оставался `in_progress` и не доходил до `waiting_otk` — это
  блокировало очередь ОТК).
- Отображение `rework` добавлено: `OperatorUI` (statusLabels + `.status-rework`),
  `OtkUI` (чип и категория «Доработка»).

### 3. Расширение листа `Наряды`
Колонка **«Причина доработки»** (опциональная, пишется ОТК при возврате).
**Ручной шаг пользователя:** вставить эту колонку в лист `Наряды` (вне кода).

### 4. Отказ от адресного (позиционного) чтения в ОТК-потоке
Рефакторинг `NaryadAPI` для листов `Наряды`, `Переходы`, `Закрытые`: чтение и
запись полей **по именам колонок** (`headers.indexOf`) через helper'ы
`colIndexByName`, `sheetHeaders`, `rowByName`. Затронуты: `naryadRowToObject`,
`transitionRowToObject`, `getClosingInfo`, `getNaryad`/`getNaryady`,
`getTransitions`, `getAllTransitionsRaw`, `createNaryad`, `createTransition`,
`operatorSubmitTransition`, `completeTransition`, `checkTransition`,
`updateNaryadStatus`, `closeNaryad`, `markNaryadStarted` (+ новые
`getNaryadStatus`/`setNaryadStatus`). Листы теперь устойчивы к перестановке/удалению
колонок.

### 5. Роутинг и авторизация (`Auth.md`)
- `doGet`: добавлен `case 'otk-app' → renderOtkAppPage(name)`.
- Пост-логин: `otk → ?page=otk-app` (branch `master/shift/otk` → полная страница).
- `getAfterLoginFragment` для `otk` больше не используется как основной путь.

---

## Как проверено

- `node .opencode/skills/digitalapps-deploy/scripts/check-modules.js`
  (все модули, включая `OtkUI` с inline-`<script>`) → **exit 0**.
- Ручная проверка `\'` в `OtkUI`/`OperatorUI`/`Auth` → **0 вхождений**
  (onclick-кавычки через `&#39;`/`&quot;`).
- Проверка уникальности глобальных функций (нет коллизий с другими модулями).
- Документация синхронизирована (DoD).

---

## Что осталось / на что обратить внимание при тестировании

- **Ручной деплой** (только ручной, без clasp):
  1. Создать модуль `OtkUI` в Apps Script-редакторе (копировать
     `modules/OtkUI.md` целиком) + заменить тела `Auth`/`NaryadAPI`/`OperatorUI`.
  2. Вставить колонку **«Причина доработки»** в лист `Наряды`.
  3. «Новая версия» активного `/exec`.
- **Тест-сценарии:** `otk/123` → попадает на `otk-app`; в «Ждут ОТК» виден наряд;
  отметить переход «Проверить» (принято/брак); закрыть наряд (в `Закрытые`
  появилась запись, наряд `closed`); вернуть на доработку (статус `rework`,
  причина в `Наряды`); оператор (`operator/123`) видит наряд в «В работе»,
  дописывает переход → снова «Ждёт ОТК»; ОТК повторно проверяет и закрывает.
- **Поведение derived-статуса изменилось** для оператора: после добавления
  перехода наряд уходит в `waiting_otk` (раньше оставался `in_progress`).
  Проверить, что это ожидаемо для реального потока.

---

## Следующий шаг

Перенести на чтение по именам колонок **остальные** листы, читаемые по индексам
(`WorkOrders`, `Planning`, `Queue` и др.) — отдельный этап (зафиксировано в
`AGENTS.md` roadmap). Перед этим — деплой и тестирование ОТК-интерфейса.
