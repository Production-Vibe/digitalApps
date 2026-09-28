# Справочники каталога и автогенерация кода

Статус: справочная спецификация (Этап 17, ADR-009). Источник правды:
`server/prisma/schema.prisma`, `server/src/lib/{dict,codes}.ts`,
`server/src/routes/{catalog,dictionaries}.routes.ts`.

## Цель

Запись номенклатуры в `Catalog` — управляемая и структурная: 5 полей
переведены в словари (выбор + серверная валидация), код новой позиции
формируется системой из дерева. Существующие 2208 позиций приведены к эталону
скриптом без изменения кодов.

## Модель `DictionaryValue`

`server/prisma/schema.prisma` (13-я модель):

```prisma
model DictionaryValue {
  id       Int      @id @default(autoincrement())
  type     String
  value    String
  synonyms String[]
  isActive Boolean  @default(true)
  sort     Int      @default(0)

  @@unique([type, value])
  @@index([type])
}
```

- `type` — одно из `DICT_TYPES` (`server/src/lib/dict.ts`): `blankType |
  material | materialGrade | blankSize | priority`.
- `value` — каноническое значение (после нормализации: trim + collapse
  пробелов); «не задано» = пустая строка `''` в `Catalog` (значения-заглушки в
  словаре нет).
- `synonyms` — варианты импорта/миграции (`#N/A`, `0`, `—`), учитываются при
  `toCanonical`/`resolveOrCreate`.
- `isActive=false` — значение не предлагается в UI и не принимается
  валидацией; существующие строки каталога не пересматриваются.
- `sort` — порядок в выпадающих списках (`0` = алфавитный fallback).

Строки `Catalog.blankType/material/materialGrade/blankSize/priority` остаются
`String` (без FK) — минимально инвазивно, миграция данных не трогает `code`.

## Автогенерация кода (`server/src/lib/codes.ts`)

Чистые функции от полного множества кодов `Catalog`:

| Функция | Правило |
|---|---|
| `computeNext(parent, codes)` | `parent + '/' + (max(числовые последние сегменты прямых детей) + 1)`; нет детей → `parent/1` |
| `topLevelNext(codes)` | `max(числовые первые сегменты) + 1` (22 → 23) |
| `missingPathRows(rootCode, codes)` | префиксы пути без строки в `Catalog` (строки-контейнеры к созданию) |
| `isPrefix(parent, codes)` | есть код `=== parent` или начинающийся с `parent/` (нормализованные) |

- Разделители `.` и `/` считаются взаимозаменяемыми по сегментам (нормализация
  через `splitCode`/`norm`).
- Код = стабильная идентичность: удалённые номера не переиспользуются.
- Узел дерева = реальная позиция; отсутствующая «строка-контейнер» по пути
  материализуется при создании под ней.
- Ручной ввод/смена кода — только `admin`; master получает код от `next-code`.

## API

### `POST /api/catalog/next-code` (`requireAuth('master')`)

Body `{ parent?: string }`, ответ `{ code, wouldMaterialize: string[] }`.
Чистое предложение (ничего не пишет): без `parent` = `topLevelNext`, с
`parent` = `computeNext`; `wouldMaterialize` — превью контейнеров, которые
будут созданы на POST. Непустой `parent`, не являющийся префиксом ни одного
кода → 400.

### `POST /api/catalog` (`requireAuth('master')`)

Порядок: словарная валидация (step ниже) → для не-admin: код обязан равняться
`computeNext(parent)` (для корня — `topLevelNext`), иначе 400 «Код позиции
формируется автоматически»; при `missingPathRows(data.code)` — материализация
контейнеров (upsert, `materialized: string[]` в ответе). Дубль кода → 409.

### Валидация словарей (POST/PUT `/api/catalog`)

Каждое из 5 полей (`isDictField`): пустое — валидно (остаётся `''`); непустое —
обязано совпасть с активным значением словаря по значению или синониму
(`toCanonical`), иначе **400** `{ error: 'Значение «<v>» не в пределах
<label>', field }`; на запись сохраняется каноническое значение.

### `PUT /api/catalog/:code`

Смена кода разрешена только admin (каскад `Launches/WorkOrders/PrintQueue/
Queue` + `materialized`; для не-admin — 400). PUT без смены кода — без
ограничений.

### `DELETE /api/catalog/:code`

Удаление только свободного кода; занятый → 409 `{error, refs}`.

### `server/src/routes/dictionaries.routes.ts` (`/api/dictionaries`)

| Метод | Роль | Поведение |
|---|---|---|
| `GET /:type` | master | активные значения `[{id, value, synonyms, isActive, sort}]`; admin — `?all=1` со всеми |
| `POST /:type` | master | quick-add `{value}`; пусто → 400; активный дубль → 409; деактивированный дубль → реактивация (201 `{reactivated:true}`); create → 201 |
| `PUT /:type/:id` | admin | значение/синонимы/сортировка; дубль значения → 409 |
| `POST /:type/:id/deactivate` | admin | `isActive=false` |

Неверный `type` → 400.

## Импорт

- `server/src/routes/vba.routes.ts` (`uploadCatalog`): перед upsert —
  `resolveOrCreate` для 5 полей (синонимы → канон, новые значения → create);
  в ответ добавляется `dictAdded`.
- `server/scripts/import-excel.ts`: те же `resolveOrCreate` на маппинге строк;
  в отчёт — счётчики добавлений по типу. Excel = источник новых значений;
  интеграция лояльна к написанию (в отличие от строгого UI).

## Утилита `dict:migrate`

`npm run dict:migrate` (`server/scripts/normalize-catalog-dicts.ts`), флаг
`--dry` — предпросмотр без записи. Идемпотентна. Эталоны:
- `blankType`: канон `[Круг, Труба, Лист, Литьё, Шестигранник, Поковка,
  Полоса]`; мусор `0/—/1823` → `''`.
- `material`: канон `[Сталь, Бронза, Алюминий, Полиамид]`; мусор
  `0/0.6/68.47/—` → `''`.
- `materialGrade`: все реальные марки из данных, кроме стоп-списка
  `#N/A/2997/3` и чисто-числовых → `''`.
- `blankSize`: реальные типоразмеры; `#N/A` и числовые-мусор → `''`.
- `priority`: сид `высокий/средний/низкий`.

`Catalog.code` при миграции не изменяется ни при каких условиях.

## Роли

`GET`/quick-add — master (+admin как superuser); ведение словаря
(PUT/deactivate/`?all=1`) — admin. Ручной код каталога — admin.

## См. также

- ADR-009 — мотивация и последствия.
- `data-model.md` — структура моделей.