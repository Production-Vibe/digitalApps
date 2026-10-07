# Справочники каталога + автогенерация кода — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать запись номенклатуры управляемой — 5 словарных полей + автогенерация кода по дереву + чистка существующих данных без изменения кодов.

**Architecture:** Одна таблица `DictionaryValue` (type/value/synonyms/isActive/sort) валидирует строки `Catalog` на сервере (поля остаются String, без FK, `code` не трогается). Генерация кода — чистая функция от дерева (`lib/codes.ts`): max+1 прямых детей, разделитель `/`, материализация-контейнеров по пути на `POST`. Строгий UI-ввод + лояльный Excel/VBA (нормировка синонимов, авто-добавление новых значений). Миграция данных — идемпотентный скрипт `dict:migrate` с `--dry`.

**Tech Stack:** Prisma (PostgreSQL), Express+TS, Vanilla JS (EJS), Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-09-25-dictionaries-catalog-design.md`

## Global Constraints

- `Catalog.code` **не изменять ни при каких операциях** (ссылки `Launches.partCode`, `WorkOrders.partCode` и т.д. целы).
- «Не задано» = пустая строка `''`; отдельного значения-заглушки в словарях не вводить.
- Код: `max(прямые дети)+1`, удалённые номера не переиспользуются, разделитель `/`, top `max+1` (22→23).
- Ручной ввод кода — только `admin` (superuser); master получает код от `next-code` (сервер пересчитывает сам).
- Дубликаты словаря `[type,value]` → 409; деактивированные значения не предлагаются и не принимаются.
- Роли: `GET /:type` и quick-add — `master` (+admin); put/deactivate — `admin`.
- Проверки перед деплоем: `cd server && npm run build && npm run check` (после `npx prisma generate`).
- Коммиты — Conventional на русском, один логический этап = один коммит. Секреты не коммитить.
- `server/.env` на диске восстановлен из контейнера (gitignored); дев-строка `production_user:CHANGE_ME` — placeholder.

---

### Task 1: Модель `DictionaryValue` + сид + `lib/dict.ts`

**Files:**
- Modify: `server/prisma/schema.prisma` (добавить модель `DictionaryValue` в конец)
- Create: `server/prisma/data/dictionaries.json`
- Modify: `server/prisma/seed.ts` (вызвать `seedDictionaryValues`)
- Create: `server/src/lib/dict.ts`
- Test: (косвенно — `tsc` + prisma generate + миграция)

**Interfaces:**
- Produces: `DICT_TYPES`, `DictType`, `DICT_LABELS`, `normalizeDictValue(v): string`, `listActive(type): Promise<DictionaryValue[]>`, `toCanonical(type, raw): Promise<string|null>` (пусто → `''`, неизвестное → `null`), `resolveOrCreate(type, raw): Promise<{value,created}>`, `isDictField(f): f is DictType`.

- [ ] **Step 1: Схема — модель**

`server/prisma/schema.prisma` (добавить):

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

- [ ] **Step 2: Сид-данные**

`server/prisma/data/dictionaries.json`:

```json
{
  "prior-it": []
}
```

(правильно — сид содержит `priority` и пустые заготовки для остальных типов, которые наполняет `dict:migrate`; подробно в Task 2):

```json
{
  "priority": [
    { "value": "высокий" },
    { "value": "средний" },
    { "value": "низкий" }
  ],
  "blankType": [],
  "material": [],
  "materialGrade": [],
  "blankSize": []
}
```

- [ ] **Step 3: `lib/dict.ts`**

```ts
import { Prisma, DictionaryValue } from '@prisma/client';
import { prisma } from './prisma';

export const DICT_TYPES = ['blankType', 'material', 'materialGrade', 'blankSize', 'priority'] as const;
export type DictType = (typeof DICT_TYPES)[number];

export const DICT_LABELS: Record<DictType, string> = {
  blankType: 'вид заготовки',
  material: 'материал',
  materialGrade: 'марка материала',
  blankSize: 'размер заготовки',
  priority: 'приоритет',
};

export function isDictField(f: string): f is DictType {
  return (DICT_TYPES as readonly string[]).includes(f);
}

export function normalizeDictValue(v: unknown): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

const FIND_VALUES = (type: DictType) => prisma.dictionaryValue.findMany({ where: { type } });

export async function listActive(type: DictType): Promise<DictionaryValue[]> {
  const rows = await FIND_VALUES(type);
  return rows
    .filter((r) => r.isActive)
    .sort((a, b) => (a.sort - b.sort) || a.value.localeCompare(b.value, 'ru'));
}

export async function toCanonical(type: DictType, raw: unknown): Promise<string | null> {
  const norm = normalizeDictValue(raw);
  if (!norm) return '';
  const rows = await FIND_VALUES(type);
  for (const r of rows) {
    if (!r.isActive) continue;
    if (normalizeDictValue(r.value) === norm) return r.value;
    if (r.synonyms.map((s) => normalizeDictValue(s)).includes(norm)) return r.value;
  }
  return null;
}

export async function resolveOrCreate(type: DictType, raw: unknown): Promise<{ value: string; created: boolean }> {
  const canon = await toCanonical(type, raw);
  if (canon === '') return { value: '', created: false };
  if (canon !== null) return { value: canon, created: false };
  const value = normalizeDictValue(raw);
  const created = await prisma.dictionaryValue.upsert({
    where: { type_value: { type, value } },
    update: { isActive: true },
    create: { type, value, synonyms: [] },
  });
  return { value: created.value, created: true };
}
```

- [ ] **Step 4: Миграция и сид**

`prisma migrate dev --name add_dictionary_values` (создаёт миграцию локально на `MOSD`). В `seed.ts` функция `seedDictionaryValues` (upsert по `type_value` из `dictionaries.json`, `update: {}` для существующих), вызвать в `main()` до `seedCatalog`. Проверить: `npx prisma generate` ок; `npm run build` + `npm run check` PASS.

- [ ] **Step 5: Коммит**

`git commit -m "feat: модель справочников DictionaryValue + сид + lib/dict"`

---

### Task 2: Скрипт миграции данных `normalize-catalog-dicts.ts`

**Files:**
- Create: `server/scripts/normalize-catalog-dicts.ts`
- Modify: `server/package.json` (script `dict:migrate`)
- Test: `--dry` прогон на стенде

**Interfaces:**
- Consumes: `lib/dict` `toCanonical`, `resolveOrCreate`, `DICT_TYPES`.
- Produces: независимый; отчёт в stdout (per type: rows normalized/cleared/dict-added).

- [ ] **Step 1: Пакет-скрипт**

`package.json` scripts: `"dict:migrate": "tsx scripts/normalize-catalog-dicts.ts"`.

- [ ] **Step 2: Скрипт**

`server/scripts/normalize-catalog-dicts.ts` (образец — `scripts/set-passwords.ts`, сам грузит `server/.env`):

```ts
import 'dotenv/config';
// 1) --dry: печатать, не записывать.
// 2) Таблицы чистки (value -> канон | ''):
//    blankType  {Круг:'Круг',Труба:'Труба',Лист:'Лист',Литье:'Литьё',Литьё:'Литьё',
//                 Шестигранник:'Шестигранник',Поковка:'Поковка',Полоса:'Полоса',
//                 0:'',—:'',1823:'', КРУГ:'Круг', ...} (заглушки-варианты -> канон)
//    material   {Сталь:'Сталь',Бронза:'Бронза',Алюминий:'Алюминий',Полиамид:'Полиамид',
//                 '—':'',0:'',0.6:'',68.47:''}
//    materialGrade: стоп-лист {'#N/A','2997','3'} и все чисто-числовые -> ''; остальное канон как есть
//    blankSize: стоп-лист {'#N/A'} + число<=? -> ''; остальное канон
//    priority: не трогаем Catalog (пусто); сид из dictionaries.json внесён Task 1.
// 3) по типу: читаем distinct, маппим, upsert DictionaryValue, updateMany Catalog
// 4) отчёт per type: {valuesInDict, rowsChanged, rowsCleared, dictAdded}
```

`Catalog` поля: `blankType/material/materialGrade/blankSize/priority` (из `STR_FIELDS` в `catalog.routes.ts`). `code` не читается на запись.

- [ ] **Step 3: Прогон `--dry` на стенде**

`DATABASE_URL=postgresql://user:<pw>@localhost:5434/digital_narad npx tsx scripts/normalize-catalog-dicts.ts --dry` (пароль из `server/.env` `POSTGRES_PASSWORD`). Ожидаем отчёт: `#N/A` → очищено, коды не менялись.

- [ ] **Step 4: Коммит**

`git commit -m "feat: скрипт чистки словарных полей каталога (dict:migrate, --dry)"`

---

### Task 3: Сервер — `next-code` + материализация + валидация кода и словарей

**Files:**
- Create: `server/src/lib/codes.ts`
- Modify: `server/src/routes/catalog.routes.ts` (POST/PUT, новый `/next-code`)
- Test: E2E в Task 8; на этом шаге `npm run build` + ручной API-smoke через curl на dev

**Interfaces:**
- Consumes: `lib/dict` `toCanonical`, `isDictField`.
- Produces: `computeNext(parent, codes): {code:string, wouldMaterialize:string[]}`, `findDirectChildren(parent, codes): string[]`, `materializePath(path, codes): string[]`, `POST /api/catalog/next-code`.

- [ ] **Step 1: `lib/codes.ts` — чистые функции**

```ts
const splitOf = (code: string) => code.split(/[./]/).map(s => s.trim()).filter(Boolean);

export function computeNext(parent: string, codes: string[]): { code: string; wouldMaterialize: string[] } {
  const segs = splitOf(parent);
  const allowed = new Set(codes);
  const missing: string[] = [];
  for (let i = 1; i <= segs.length; i++) {
    const p = segs.slice(0, i).join('/');
    if (!allowed.has(p)) missing.push(p);
  }
  const children = codes.filter(c => c.startsWith(parent + '/') && splitOf(c).length === segs.length + 1);
  const nums = children.map(c => Number(splitOf(c).at(-1))).filter(n => Number.isFinite(n));
  const next = (parent ? parent + '/' : '') + ((nums.length ? Math.max(...nums) : 0) + 1);
  return { code: next, wouldMaterialize: missing };
}

export function topLevelNext(codes: string[]): string {
  const tops = codes.map(c => Number(splitOf(c)[0])).filter(n => Number.isFinite(n));
  return String((tops.length ? Math.max(...tops) : 0) + 1);
}

export function materializePath(rootCode: string, codes: string[]): string[] {
  const segs = splitOf(rootCode);
  const allowed = new Set(codes);
  const created: string[] = [];
  for (let i = 1; i <= segs.length; i++) {
    const p = segs.slice(0, i).join('/');
    if (!allowed.has(p)) created.push(p);
  }
  return created;
}
```

- [ ] **Step 2: `POST /api/catalog/next-code`**

В `catalog.routes.ts` (до `router.post('/', ...)`) — `router.post('/next-code', requireAuth('master'), ...)`: body `{parent?}`; `codes = await prisma.catalog.findMany({select:{code:true}})` → `codes.map(c=>c.code)`; если `parent` задан и не является префиксом ни одного кода (`!codes.some(c => c === parent || c.startsWith(parent+'/'))`) → 400; ответ `{ code: parent? computeNext(...).code : topLevelNext(codes), wouldMaterialize: parent? computeNext(...).wouldMaterialize : [] }`. Метод POST (body), не GET.

- [ ] **Step 3: POST / — материализация + валидация кода**

`requireAuth('master')`. Тело: `parent?`, `code?`, поля каталога. Порядок:
1. `dictErr = await validateDictFields(data)` (см. Step 4) — при ошибке 400 `{error, field}`.
2. Мастер (`(req.user as any).role !== 'admin'`): если `parent` нет → 400 «Укажите родителя либо root»; иначе `next = computeNext(parent, codes)`, `expected = next.code`; `data.code` должен равняться `expected` → иначе 400 «Код позиции формируется автоматически». Подготовить `materialized` из `next.wouldMaterialize` — создать строки-контейнеры (`code`, `name` из узла дерева, если есть, иначе `''`, прочие тех. поля пустые) в той же транзакции до создания позиции, ответ `{ ...created, materialized }`.
3. Admin: `code` свободен (409 при дубле) — без авто-правил.

- [ ] **Step 4: Валидация словарей POST/PUT**

`validateDictFields(data)` по `STR_FIELDS & dict`: для каждого словарного поля `f` (только не-пустого) `canon = await toCanonical(f, data[f])`; `null` → `{field: f, error:'Значение «'+v+'» не в пределах '+DICT_LABELS[f]}`; иначе `data[f] = canon`. Вызывать до `normalizeBody`-маппинга (после тоже нормируем значения).

- [ ] **Step 5: PUT — запрет смены кода для master**

При `newCode !== oldCode`: если `role !== 'admin'` → 400 «Код позиции формируется автоматически». Существующая каскадная логика (transaction create+updateMany+delete) остаётся для admin.

- [ ] **Step 6: Проверка**

`npm run build` + `npm run check` PASS. Ручной API-smoke против dev (`server/.env`): `POST /api/login` master → токен; `next-code {parent:'21.1/9'}` → `21.1/9/<max+1>`; POST без `code` → 400; POST с валидным словарём + корректным кодом → 201; POST с мусорным материалом → 400 `{field:'material'}`; созданные пробные записи удалить.

- [ ] **Step 7: Коммит**

`git commit -m "feat: сервер автогенерации кода каталога + валидация словарей"`

---

### Task 4: Сервер — `dictionaries.routes.ts`

**Files:**
- Create: `server/src/routes/dictionaries.routes.ts`
- Modify: `server/src/app.ts` (подключить `/api/dictionaries`)
- Test: E2E в Task 8; API-smoke на этом шаге

**Interfaces:**
- Consumes: `lib/dict` `listActive`, `normalizeDictValue`, `DICT_TYPES`, `DICT_LABELS`.
- Produces: `GET /api/dictionaries/:type`, `POST /api/dictionaries/:type`, `PUT /api/dictionaries/:type/:id`, `POST /api/dictionaries/:type/:id/deactivate`.

- [ ] **Step 1: Роутер**

```ts
const DICT_MIDDLEWARE = (roles: Role[]) => requireAuth(...roles);
router.get('/:type', DICT_MIDDLEWARE(['master']), (req,res) => {
  type валиден (иначе 400); all = queryStr==='all' && роль admin;
  res.json(listActive или все по запросу);
});
router.post('/:type', DICT_MIDDLEWARE(['master']), ...)  // {value} → normalize, '' → 400; create; P2002 → 409
router.put('/:type/:id', DICT_MIDDLEWARE(['admin']), ...) // {value?, synonyms?, sort?} ; изменение value — уникальность → 409
router.post('/:type/:id/deactivate', DICT_MIDDLEWARE(['admin']), ...) // isActive=false
```

Тип проверить через `(DICT_TYPES as readonly string[]).includes(param(req,'type'))`.

- [ ] **Step 2: Подключение в `app.ts`**

`app.use('/api/dictionaries', dictionariesRouter);` (рядом с остальными routes, в порядке до `/api/catalog/:code`-подобных конфликтов — отдельный префикс `/api/dictionaries` конфликтов не имеет).

- [ ] **Step 3: Проверка**

`npm run build` + `npm run check` PASS; API-smoke dev: `GET /api/dictionaries/priority` (после сида — 3 значения), `POST` новое значение → 201, дубль → 409, `PUT` синоним (admin) → 200, deactivate → `GET` его не показывает. Пробные значения удалить/реактивировать.

- [ ] **Step 4: Коммит**

`git commit -m "feat: CRUD справочников (quick-add master, ведение admin)"`

---

### Task 5: UI — модалка каталога (родитель + автокод + селекты словарей)

**Files:**
- Modify: `server/src/public/catalog-manager.js`
- Modify: `server/src/public/styles.css`
- Test: E2E в Task 8; ручной probe

**Interfaces:**
- Consumes: `POST /api/catalog/next-code`, `GET/POST /api/dictionaries/:type`, `POST /api/catalog`.
- Produces: модалка с полем «Родитель» (комбобокс узлов дерева), строкой «Код: … (сгенерирован)», 5 dict-селектов с «+».

- [ ] **Step 1: Данные и состояние**

`mount(treeData, opts)`: при открытии «Добавить»:
- `nodes` = flat список всех узлов дерева (рекурсивно из `treeData`, `code` из `node.code`; label = `code + ' — ' + (name||designation||'…')`);
- `dictCache` = `{ type: values[] }` — загрузить через `api('/api/dictionaries/'+type)` для 5 типов;
- parent picker: контейнер `.cm-parent` с `<input list>` (комбобокс: input + datalist по node labels; при выборе — `loadNextCode(parent)`).

- [ ] **Step 2: Автокод**

`loadNextCode(parent)` → `api('/api/catalog/next-code', {method:'POST', body:{parent}})` → заполняет скрытый `#cm-code` (readonly) и подпись «Код: `{code}` (сгенерирован системой)»; поле видимо как текст, не редактируется (кроме `role==='admin'` — переключатель «ручной ввод» включает input). При выборе «корень» (родитель пуст) — `code` от `topLevelNext`.

- [ ] **Step 3: Дикт-селекты**

Для полей из `DICT_TYPES` вместо `<input type="text">` — `<select id="cm-<key>">` с опцией `—` (не задано, value ''), затем значения из dictCache, + кнопка «+» (quick-add inline: prompt/мини-инпут → `POST /api/dictionaries/<type>` → на 201 добавить в select и выбрать, на 409 тост «Уже есть»). `collectForm()` собирает select-значения. `openEdit` — значение из позиции вставляется в option, если его нет в словаре (после миграции такое маловероятно, но защита).

- [ ] **Step 4: Обработка 400 `{field}`**

В `save()` при `res.status===400 && body.field` — подсветить `#cm-<field>` (класс `.input-error`) и тост `body.error`; авто-код при мастере не требует сборки кода руками.

- [ ] **Step 5: Стили**

`.cm-parent`, `.cm-parent-sel`, `.input-error`, `.dict-select-wrap`, `.cm-code-line` (моно-строки) в `styles.css`.

- [ ] **Step 6: Проверка**

`npm run build`/`check` (JS в public не типизируется tsc — но синтаксис через `node --check` отдельно: `node --check server/src/public/catalog-manager.js`). Ручной браузерный probe: open `/master`, таб «Номенклатура», «+ Добавить», выбрать родителя «Гидробак», код `21.1/9/<max+1>`, выбрать материал «Сталь», сохранить → 201 (пробную запись удалить).

- [ ] **Step 7: Коммит**

`git commit -m "feat: модалка каталога — выбор родителя, автокод, справочные селекты"`

---

### Task 6: UI — таб «Справочники» в `/admin`

**Files:**
- Modify: `server/src/views/admin.ejs`
- Create: `server/src/public/dict-manager.js`
- Modify: `server/src/public/styles.css`
- Test: E2E в Task 8

**Interfaces:**
- Consumes: `GET/POST/PUT /api/dictionaries/*`.
- Produces: третий таб навигации `/admin` «Сотрудники | Номенклатура | Справочники».

- [ ] **Step 1: Вью**

`admin.ejs`: добавить кнопку `data-panel="dicts"`, контейнер `#panel-dicts` с `#dictManager`; включить `<script src="/dict-manager.js">`; в `switchPanel` добавить кейс `dicts` → `window.__DICT_RELOAD && window.__DICT_RELOAD()`.

- [ ] **Step 2: `dict-manager.js`**

`DictManager.mount(host)`: селект типа (5), кнопка «+ значение», таблица значений (value, синонимы chiptable через запятую editable, сортировка, активен/деактивировать) — все операции через `api()`; деактивация с confirm; `window.DictManager = {mount}`; `window.__DICT_RELOAD` перечитывает активный тип.

- [ ] **Step 3: Стили**

`.dict-*` — таблица значений, `.chips` (синонимы), активный/неактивный (badge), toolbar. `styles.css`.

- [ ] **Step 4: Проверка**

`node --check server/src/public/dict-manager.js`. Браузерный probe `/admin` → «Справочники»: список priority (высокий/средний/низкий), добавить/деактивировать тестовое значение → cleanup.

- [ ] **Step 5: Коммит**

`git commit -m "feat: таб «Справочники» в /admin (ведение словарей)"`

---

### Task 7: Интеграция — VBA `uploadCatalog` и `import-excel.ts`

**Files:**
- Modify: `server/src/routes/vba.routes.ts`
- Modify: `server/scripts/import-excel.ts`
- Test: API-smoke; стендовый прогон импорта не требуется (атомарная замена затронет каталог — отложить сценарий)

**Interfaces:**
- Consumes: `lib/dict` `resolveOrCreate`.
- Produces: VBA-ответ `{ok, inserted, dictAdded}`; отчёт импорта + счётчики dict-добавлений.

- [ ] **Step 1: VBA**

В `handleUploadCatalog` перед составлением `create` — `resolveOrCreate` для `blankType/material/materialGrade/blankSize/priority` (поля «Тип заготовки» и пр.); результат в `create`, `dictAdded += created ? 1 : 0`; возврат `{ok:true, inserted:count, dictAdded}`.

- [ ] **Step 2: `import-excel.ts`**

После `parseRows` (в цикле маппинга строк) — те же `resolveOrCreate` для 5 полей; аккумулировать `dictAdded` per type в отчёт.

- [ ] **Step 3: Проверка**

`npm run build` + `npm run check` PASS. VBA-smoke: `POST /api/vba/ingest` с действием `uploadCatalog`, одна тестовая строка с новым материалом → 200 `dictAdded≥1`; строку и значение удалить (в тесте Task 8 будет полноценно).

- [ ] **Step 4: Коммит**

`git commit -m "feat: импорт VBA/Excel — нормировка словарей + авто-добавление значений"`

---

### Task 8: E2E `tests/e2e/test_dict_catalog.py` + регресс

**Files:**
- Create: `tests/e2e/test_dict_catalog.py`
- Modify: `tests/e2e/config.py` (добавить CREDS['admin'] при env) — проверить, что уже есть.
- Test: прогон на стенде

**Interfaces:**
- Consumes: все API выше + UI. Креды env: `ND_LOGIN_*`/`ND_PASSWORD_*` (лойные) — для admin использовать пароль пользователя.

- [ ] **Step 1: Тест**

Кейсы (runner.check; API через login master/admin; UI-кейсы через Playwright):
1. `next-code` топ (master) → 200, `int(code) > 22` (или top-уровня нет — пропуск через try).
2. `next-code` под новым родителем (создать родителя admin-ом с ручным кодом `TST-DD`) → `TST-DD/1`; после POST ребёнка `TST-DD/2`.
3. POST master без `code` → 400; с чужим кодом (`TST-XX`) → 400.
4. POST c валидными словарями (blankType `Круг`, material `Сталь`) → 201; мусор `material:'#N/A'` → 400 `{field:'material'}`; пустой material → 201.
5. `POST /api/dictionaries/blankType` quick-add `TST-Значение` → 201; дубль → 409; `GET` содержит.
6. admin `PUT` значение (синоним `tst`) → 200; `POST deactivate` → в `GET` нет, POST каталога с ним → 400.
7. `materialized`: `next-code {parent:'86/TST'}` где `86` нет в дереве → 400; `{parent:'22/TST'}` (если `22` есть строка — то материализация только TST-узла) → POST ребёнка → в ответе `materialized` содержит `22/TST`.
8. cleanup: удалить созданные позиции (каскад через admin PUT/DELETE), значения словаря — оставить неизвестные TST-значения деактивированными/удалить (удаление записи словаря допустимо, т.к. на неё нет FK).

- [ ] **Step 2: Прогон**

`python tests/e2e/test_dict_catalog.py` (env-креды, admin пароль пользователя) → PASS. Затем регресс: `test_catalog_crud.py` 15/15, `test_admin.py` 5/5, `test_master.py` 12/12. Стенд чист (TST=0 в Catalog/Launches), Notification не вырос.

- [ ] **Step 3: Коммит**

`git commit -m "test: e2e словарей и автокода каталога"`

---

### Task 9: Деплой на стенд + `dict:migrate` на оба контура

**Files:**
- Modify: (нет кода; деплой)
- Test: `/health`, SQL-проверка чистоты

- [ ] **Step 1: Собрать и запустить**

`cd server && docker compose up -d --build` (образ с новой схемой; на старте `migrate deploy` + seed → `DictionaryValue` сид priority). `/health` → 200.

- [ ] **Step 2: `dict:migrate`**

Прогон на стенд: `docker exec -e DATABASE_URL=postgresql://user:<POSTGRES_PASSWORD>@db:5432/digital_narad server-app-1 npx tsx scripts/normalize-catalog-dicts.ts` (или локально на `localhost:5434`). Прогон на `MOSD`: `npm run dict:migrate` (dev `server/.env`). Проверить отчёт + `--dry` перед применением (в течение реального применения — `--dry` для предпросмотра, затем без флага).

- [ ] **Step 3: Проверка стенда SQL**

`Catalog` count = 2208; `#N/A` в `materialGrade` = 0; пустые `blankType` осмысленны; `code`-множества до/после совпадают (подсчёт `SELECT count(DISTINCT code) FROM "Catalog"` = 2208). Живые запуски/наряды целы (Launches 3, WorkOrders 1).

- [ ] **Step 4: Коммит не требуется** (деплой без кода). Зафиксировать в отчёте Task 10.

---

### Task 10: Документы и финальные коммиты

**Files:**
- Create: `docs/specs/dictionaries-catalog.md`
- Create: `docs/superpowers/adr/2026-09-25-dictionaries-catalog.md` (если папка есть; иначе — секция в спеку)
- Create: `docs/reports/2026-09-25-dictionaries-catalog.md`
- Modify: `docs/reports/STATUS.md`
- Modify: `docs/specs/architecture.md` (модель `DictionaryValue` → таблица моделей)
- Modify: `docs/specs/data-model.md` (секция `DictionaryValue`)

- [ ] **Step 1: Спецфайлы**

`docs/specs/dictionaries-catalog.md` — справочная: модель, DICT_TYPES, автокод, правила чистки (таблицы из Task 2), роли.

- [ ] **Step 2: ADR**

Зафиксировать: строковые поля каталога + словарь нет-FK; код = автогенерация max+1, материализация контейнеров; «не задано» = пустая строка; импорт-лояльность.

- [ ] **Step 3: Отчёт и STATUS**

Отчёт по схеме (что сделано / как проверено / осталось / следующий шаг). `STATUS.md`: «Последний завершённый этап» + «Следующий шаг» + открытые баги.

- [ ] **Step 4: Финальные коммиты**

`docs`-коммит(ы). По согласованию — тег `v0.20-dictionaries-catalog`.

---

## Self-Review

**Spec coverage:** §3→Task1; §4→Task1 (lib/dict)+Task7; §5→Task2; §6.1→Task3; §6.2→Task3; §6.3→Task4; §7.1→Task5; §7.2→Task6; §7.3→Tasks5-6; §8.1→Task7; §8.2→Task7; §9→Task8; §10→Tasks9-10; §11 (вне объёма) — не реализуем.

**Placeholder scan:** единственное место с формулировкой «х» — `lib/codes.ts` regex/detali в Step 1 — это полный код. Мусорные словари в Task 2 Step 2 перечислены явно. Синонимы «заглушки-варианты» — разрешены описательно (скрипт заполнит фактическими из distinct`, что и есть требование задания). ОК.

**Type consistency:** `toCanonical`/`resolveOrCreate` сигнатуры совпадают Task1/3/7; `computeNext`/`topLevelNext`/`materializePath` — Task 3 едины; `/next-code` ответ `{code, wouldMaterialize}` — Task 3 Step 2 и Task 5 (из `loadNextCode`) согласованы; «materialized» в POST-ответе — Task 3 Step 3 (совпадает со спекой §6.1). DictManager/__DICT_RELOAD — Task 6 согласовано с admin.ejs.