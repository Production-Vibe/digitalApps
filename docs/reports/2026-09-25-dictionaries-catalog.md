# Этап 17 — справочники каталога + автогенерация кода

Дата: 25.09.2026. Контур: `main` (Node/Express + EJS + Prisma + PostgreSQL).
Дизайн: `docs/superpowers/specs/2026-09-25-dictionaries-catalog-design.md`,
план: `docs/superpowers/plans/2026-09-25-dictionaries-catalog.md` (в git не
трекается), ADR: `docs/specs/adr/ADR-009-dictionaries-catalog.md`.

## Что сделано

Запись номенклатуры в `Catalog` переведена с произвольного текста на
**управляемую**: 5 словарных полей + автогенерация кода по дереву + чистка
данных без изменения кодов.

**БД и библиотеки (Tasks 1–2):**
- Модель **`DictionaryValue`** (13-я; `type/value/synonyms/isActive/sort`,
  `@@unique([type, value])`), миграция `20260925094825_add_dictionary_values`;
  сид-значения (`priority: высокий/средний/низкий`, пустые заготовки) —
  `server/prisma/data/dictionaries.json`.
- `server/src/lib/dict.ts` — `DICT_TYPES/DICT_LABELS/isDictField`,
  `normalizeDictValue`, `listActive`, `toCanonical` (вариант → канон/`null`),
  `resolveOrCreate` (для импорта: синонимы → канон, новое значение → create).
- `server/scripts/normalize-catalog-dicts.ts` — `npm run dict:migrate`
  (`--dry` — предпросмотр; идемпотентность): мусор `#N/A/0/—/числа` → '',
  синонимы-варианты → канон; `Catalog.code` не меняется ни при каких условиях.

**Сервер (Tasks 3–4):**
- `server/src/lib/codes.ts` — чистые функции автокода: `computeNext`
  (max прямых детей +1), `topLevelNext` (22→23), `missingPathRows`
  (строки-контейнеры по пути), `isPrefix`; разделители `.`/`/`
  взаимозаменяемы.
- `catalog.routes.ts` — `POST /api/catalog/next-code` (превью
  `{code, wouldMaterialize}`); `POST /` — словарная валидация (400
  `{error, field}`), для не-admin код обязан равняться `next-code`, иначе 400,
  **материализация контейнеров** по пути (`materialized` в ответе); `PUT` —
  смена кода только admin (каскад ссылок сохранён), master → 400;
  корневое создание для master по `topLevelNext` (фикс в ходе Task 8).
- `dictionaries.routes.ts` (`/api/dictionaries`, подключён в `app.ts`) —
  `GET /:type` (master; admin — `?all=1`), `POST /:type` quick-add (дубль 409,
  деактивированный дубль → реактивация 201), `PUT /:type/:id` и
  `POST /:type/:id/deactivate` (admin).

**UI (Tasks 5–6):**
- Модалка `catalog-manager.js` («+ Добавить позицию»): поле «Родитель»
  (комбобокс узлов дерева), строка «Код: <next-code> (сгенерирован системой)»
  (ручной ввод — только admin), 5 dict-селектов с кнопкой «+» (quick-add, при
  409 — тост «Уже есть»), подсветка поля при 400 `{field}`, запись канона.
- `/admin` — таб «Справочники» (навигация «Сотрудники | Номенклатура |
  Справочники»): `dict-manager.js` — выбор типа, таблица значений
  (value/синонимы chips/сортировка/активен), добавить/переименовать/
  деактивировать. Стили `.dict-*`, `.cm-parent*`, `.input-error` в
  `styles.css`.

**Импорт (Task 7):**
- `vba.routes.ts` (`uploadCatalog`) и `import-excel.ts` — перед записью
  `resolveOrCreate` для 5 полей; новые значения автоматически добавляются в
  словарь (`dictAdded`). Excel остаётся источником новых марок/типов.

## Как проверено

- `cd server && npm run build` + `npm run check` — PASS.
- Деплой: образ пересобран (`docker compose up -d --build`), миграция и сид
  применены на старте, `/health` → `{status:'ok', db:'connected'}`;
  `dict:migrate` прогнан LIVE на **оба** контура (стенд `digital_narad` через
  `localhost:5434`, локальный `MOSD` через dev `.env`): `--dry` → предпросмотр,
  затем применение. На стенде: `#N/A` в `materialGrade` → **0** (было 105),
  `DictionaryValue` = **167** (blankSize 93, materialGrade 60, blankType 7,
  material 4, priority 3), `Catalog` = 2208, `code`-множество не изменилось;
  живые данные целы (Launches 3, WorkOrders 1).
- **E2E `tests/e2e/test_dict_catalog.py` — 34/34 PASS** (креды боевые через
  env): next-code top (23) и под родителем (`…/1` → `…/2`); POST корневой
  позиции по next-code → 201; POST без `code` → 400, чужой `code` → 400;
  словари: валидные значения → 201, `materialGrade:'#N/A'` → 400 `field`,
  пустой material → 201; quick-add словаря 201/дубль 409/виден в GET; PUT
  синонимов+sort (admin) 200; deactivate → скрыт из GET, каталог с ним → 400
  `field`, реактивация → 201 `reactivated:true`; материализация: несуществующий
  top `86` → 400, глубокий код через admin → виртуальный родитель, `next-code`
  с `wouldMaterialize`, POST → `materialized` содержит `22/TST-…`; UI `/admin`
  (таб «Справочники», quick-add, переключение типа); cleanup = 0 тестовых
  артефактов.
- Регресс: `test_catalog_crud.py` **15/15 PASS** (переведён на ручной код через
  admin — автокод-контракт master), `test_admin.py` **5/5**, `test_master.py`
  **12/12**. Стенд чист: Catalog 2208, TST-позиций/значений нет, Launches 3,
  WorkOrders 1, Notification не вырос.

## Нюансы

- Новый контракт: master не вводит код руками (только `next-code`), поэтому
  `test_catalog_crud.py` (Этап 16) создаёт/меняет код как admin — иначе 400.
- Вход shift в E2E-подготовке словарей не нужен — токен не используется,
  вход убран (избегаем зависимость от лишней роли).
- `dict:migrate` — идемпотентный; повторный прогон не создаёт дублей.

## Что осталось / следующий шаг

- Этап закрывает «управляемую запись номенклатуры» (словари + автокод +
  чистка). Живые старые пустые значения пересматриваются мастером через
  редактор (вне объёма, §11 спеки).
- (опц.) Excel-импорт как merge (Excel = резерв, БД+UI = источник правды).
- (опц.) Поле `ppb` (всё пусто, этапом не занято).

## Коммиты

`4fd0aee` feat: модель справочников DictionaryValue + сид + lib/dict —
`3ec272f` feat: скрипт чистки словарных полей каталога (dict:migrate, --dry) —
`8e4b885` feat: сервер автогенерации кода каталога + валидация словарей —
`5779ee3` fix: нормализация разделителей в автокоде (смешанные . и /) —
`4c8ab00` feat: CRUD справочников (quick-add master, ведение admin) —
`c6b05e3` feat: модалка каталога — выбор родителя, автокод, справочные
селекты — `da33e6e` feat: таб «Справочники» в /admin (ведение словарей) —
`fb5b8f7` feat: словари каталога авто-пополняются при импорте (VBA/Excel) —
`dc1176e` fix: master создаёт корневую позицию с кодом из next-code —
`a39d5e6` test: e2e словарей и автокода каталога — затем `docs` (ADR-009,
`dictionaries-catalog.md`, data-model/architecture, отчёт, STATUS).