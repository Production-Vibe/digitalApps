# Отчёт этапа: ADR-005 (вариант C) — общий словарь статусов наряда

**Дата:** 07.09.2026
**Модули:** `modules/Config.md`, `modules/NaryadAPI.md`, `modules/OtkUI.md`,
`modules/OperatorUI.md`, `modules/ShiftUI.md`, `modules/PlanningAPI.md`
**Документация:** `docs/specs/data-model.md` (раздел «Статусы жизненного цикла»)
**ADR:** `docs/specs/adr/ADR-005-rework-consistency.md` (вариант C — принят)

---

## Что сделано

### 1. Единый словарь статусов наряда — `modules/Config.md`
- `NARYAD_STATUS` — объект значений: `CREATED`, `IN_PROGRESS`, `WAITING_OTK`,
  `REWORK`, `CLOSED` (единственный источник значений).
- `NARYAD_STATUS_LABELS` — русские подписи для UI.
- Правки словаря/подписей требуют синхронного обновления `data-model.md` и
  клиентских страниц (инжекция в `<script>`).

### 2. Рефакторинг серверного кода на словарь
- `NaryadAPI.md`: `markNaryadStarted`, `createNaryad`, `closeNaryad`,
  `updateNaryadStatus`, `getNaryadForOperator`, `getOperatorInWork`,
  `getOperatorClosed`, `acceptWorkOrder` — литералы статусов заменены на
  `NARYAD_STATUS.*`.
- `OtkUI.md`: `getOtkQueue` (фильтры `waiting/rework/closed`),
  `otkReturnToRework` — на словарь.
- `setNaryadStatus` получил валидацию: записывает только значения словаря
  («основа для валидации» из ADR-005).
- `ShiftUI.md` / `PlanningAPI.md`: запись статуса нового WorkOrder — через
  `NARYAD_STATUS.CREATED` (тот же словарь).

### 3. Инжекция словаря в клиентские страницы
- `OperatorUI.md`: `<script>` получает `NARYAD_STATUS` и `STATUS_LABELS` из
  сервера (`${JSON.stringify(NARYAD_STATUS_LABELS)}`); дублирующая раньше карта
  подписей удалена; сравнение закрытого наряда — через `NARYAD_STATUS.CLOSED`.
- `OtkUI.md`: `<script>` получает `NARYAD_STATUS` и `NARYAD_STATUS_LABELS`;
  `statusChip` использует инжектированные подписи; фильтры и проверки —
  через `NARYAD_STATUS.*`.

### 4. Спека
- `docs/specs/data-model.md`: раздел «Статусы жизненного цикла» дополнен
  указанием на машиночитаемую копию словаря в `Config` и требование синхронности.

## Как проверено

- `node .opencode/skills/digitalapps-deploy/scripts/check-modules.js` — все 13
  модулей PASS (включая inline-скрипты UI).
- `grep \\' modules/*.md` — 0 вхождений (`\'` в inline-скриптах не вносилось).

## Что осталось / следующий шаг

- Деплой вручную (по согласию): скопировать изменённые модули в редактор Apps
  Script, «Новая версия», записать манифест (`deploy-manifest.md`).
- Следующий большой этап — реализация ADR-003 (вариант A): write-path,
  VBA→legacy, миграция (переезд после живых прогонов), полный E2E-бизнес-цикл.
- Открытый вопрос ADR-005 сохраняется: отображение `rework` в Dashboard/Planning
  Master — зафиксировать при реализации ADR-003.