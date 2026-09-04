# Роли, права и роутинг «ЦифровойНаряд»

Статус: справочная спецификация. Роутинг живёт в `modules/Auth.md`; лист ролей — `Сотрудники`.

## Хранилище ролей

Лист `Сотрудники`, колонки `login | password | ФИО | role` (индексы 0..3).

| # | Колонка | Использование |
|---|---|---|
| 0 | `login` | Идентификатор входа |
| 1 | `password` | Пароль (открытым текстом, MVP) |
| 2 | `ФИО` | Отображаемое имя (`name`) |
| 3 | `role` | Роль (`master` / `shift` / `operator` / `otk`) |

## Роли

| role | Интерфейс | Страница | Реализация |
|---|---|---|---|
| `master` | Начальник цеха: дерево номенклатуры, запуски на ПА, Dashboard, очередь печати | `?page=master-app` | `modules/MasterUI.md`, полная страница |
| `shift` | Начальник смены: выдача нарядов операторам из запусков | `?page=shift-app` | `modules/ShiftUI.md`, полная страница |
| `operator` | Оператор: смены, назначенные наряды, тех. переходы | `?page=operator` | `modules/OperatorUI.md`, фрагмент |
| `otk` | ОТК: приёмка/брак/закрытие/доработка нарядов | `?page=otk-app` | `modules/OtkUI.md`, полная страница |

## Роутинг (`modules/Auth.doGet`)

Параметр `page` в URL (`modules/Auth.md:36-62`):

| `?page=` | Обработчик |
|---|---|
| `login` | `renderLogin(naryadId)` — страница входа (default) |
| `operator` | `renderOperatorPage(name, naryadId)` |
| `otk` | `renderAfterLogin(name, role)` |
| `master` | `renderAfterLogin(name, role)` |
| `master-app` | `renderMasterAppPage(name)` |
| `shift-app` | `renderShiftAppPage(name)` |
| `otk-app` | `renderOtkAppPage(name)` |
| `naryad` | `renderNaryad(naryadId, role, name)` |
| прочее | `renderLogin(naryadId)` |

## Логика входа (`modules/Auth.md`)

- `checkAuth(login, password)` читает `Сотрудники`, сверяет по `login`+`password`,
  возвращает `{ success, name, role, execUrl }`.
- После успешного логина:
  - `operator` → страница оператора (`?page=operator`).
  - `shift` → `?page=shift-app`.
  - `otk` → `?page=otk-app`.
  - остальные (включая `master`) → `?page=master-app` (`modules/Auth.md:243-272`).
- `renderAfterLogin` / `getAfterLoginFragment` — промежуточная экранная страница
  с role-badge и переходом (используется для `master`, `otk` при прямом заходе).
- `appBaseUrl()` — абсолютный URL WebApp для верхнеуровневой навигации
  (логин/выход); относительные `?page=` из песочницы не работают.

## Роль `otk`

Полный интерфейс в `modules/OtkUI.md` (`?page=otk-app`): очередь нарядов по
категориям (Ждут ОТК / Доработка / В работе), карточка наряда с переходом
(принято/брак), закрытие наряда (disposition) и возврат на доработку
(статус `rework`). Все операции защищены `isRole(name, 'otk')`.

## Расхождения в источниках (актуально на момент написания spec)

- `docs/Мастер-промпт.md` описывает распределение по ролям — сверять с кодом
  модулей `modules/Auth.md` и `modules/ShiftUI.md` перед реализацией.
- Роль `shift` выходит на полную страницу `shift-app`; при этом «выдать в никуда»
  нельзя — `ShiftUI` показывает активные смены операторов.

## См. также

- `architecture.md` — модули и точки входа.
- `data-model.md` — структура записей.