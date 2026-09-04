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
| `otk` | ОТК: приёмка/брак/закрытие нарядов | в разработке | не реализован |

## Роутинг (`modules/Auth.doGet`)

Параметр `page` в URL (`modules/Auth.md:29-63`):

| `?page=` | Обработчик |
|---|---|
| `login` | `renderLogin(naryadId)` — страница входа (default) |
| `operator` | `renderOperatorPage(name, naryadId)` |
| `otk` | `renderAfterLogin(name, role)` (заглушка до реализации OТК) |
| `master` | `renderAfterLogin(name, role)` |
| `master-app` | `renderMasterAppPage(name)` |
| `shift-app` | `renderShiftAppPage(name)` |
| `naryad` | `renderNaryad(naryadId, role, name)` |
| прочее | `renderLogin(naryadId)` |

## Логика входа (`modules/Auth.md`)

- `checkAuth(login, password)` читает `Сотрудники`, сверяет по `login`+`password`,
  возвращает `{ success, name, role, execUrl }`.
- После успешного логина:
  - `operator` → страница оператора (`?page=operator`).
  - `shift` → `?page=shift-app`.
  - остальные (включая `master`, `otk`) → `?page=master-app` (`modules/Auth.md:240-270`).
- `renderAfterLogin` / `getAfterLoginFragment` — промежуточная экранная страница
  с role-badge и переходом (используется для `master`, `otk`, прямого захода).
- `appBaseUrl()` — абсолютный URL WebApp для верхнеуровневой навигации
  (логин/выход); относительные `?page=` из песочницы не работают.

## Заметка о роли `otk`

Роль `otk` назначить в `Сотрудники` можно, но полноценного интерфейса пока нет:
при логине она попадёт на `master-app` (заглушка в роутинге `Auth.md:43-46`).
Реализация ОТК — следующий блок работ (см. `docs/чек-лист внедрения...`, ФАЗА 4).

## Расхождения в источниках (актуально на момент написания spec)

- README/чек-лист упоминают `OtkUI.gs` как будущий модуль — ещё не создан.
- `docs/Мастер-промпт.md` описывает распределение по ролям — сверять с кодом
  модулей `modules/Auth.md` и `modules/ShiftUI.md` перед реализацией.
- Роль `shift` выходит на полную страницу `shift-app`; при этом «выдать в никуда»
  нельзя — `ShiftUI` показывает активные смены операторов.

## См. также

- `architecture.md` — модули и точки входа.
- `data-model.md` — структура записей.