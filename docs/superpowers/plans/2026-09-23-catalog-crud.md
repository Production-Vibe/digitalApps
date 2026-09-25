# Справочник номенклатуры (CRUD каталога) — план реализации

> **Для агентных исполнителей:** обязательный суб-скилл — исполнять этот план
> задача-за-задачей (шаги в формате чекбоксов `- [ ]`). Задачи идут по порядку.

**Goal:** Дать мастеру и админу вести номенклатуру из приложения: создавать,
редактировать (в т.ч. менять код с каскадом ссылок) и удалять позиции каталога.

**Architecture:** Монолит Node/Express. Бэкенд — три новых write-эндпоинта в
существующем `catalog.routes.ts` (POST/PUT/DELETE под `requireAuth('master')`;
admin — superuser). Клиент — общий Vanilla-JS компонент `public/catalog-manager.js`
(дерево + поиск + CRUD-модалка), монтируемый во вкладку «Номенклатура» `/master`
(с метриками из дэшборда) и в новый таб «Номенклатура» `/admin` (сам грузит дерево).

**Tech Stack:** Node/Express + TypeScript, Prisma/PostgreSQL, EJS + Vanilla JS,
существующие `public/api.js`/`public/ui.js` и токены CSS.

**Spec:** `docs/superpowers/specs/2026-09-23-catalog-crud-design.md`

## Global Constraints

- Стиль проекта: EJS-страницы без inline-бизнес-логики; данные через `api()`.
- Общие хелперы: `escHtml`, `showToast`, `emptyBlock`, `fmtNum`, `roundSmart`,
  `api()` — из `server/src/public/api.js` / `ui.js`.
- Числовые поля округляются `roundSmart` при сохранении (и сервер, и клиент).
- Новые эндпоинты — только под `requireAuth('master')` (shift/operator/otk → 403;
  admin проходит любой фильтр). GET-маршруты каталога не меняются.
- Код — PK модели `Catalog`; дубли запрещены; FK-ссылки в `Launches/WorkOrders/
  PrintQueue/Queue` переезжают при смене кода, удаление занятого кода — 409.
- Коммиты — Conventional на русском; сообщение — `<тип>: <что> (<зачем>)`.
- Формат E2E-харнесса: `tests/e2e/*.py`, креды из
  `tests/e2e/.secrets/e2e-env.ps1` (dot-source), api через Playwright
  `APIRequestContext.fetch`.

---

## Task 1: Бэкенд — write-эндпоинты каталога

**Files:**
- Modify: `server/src/routes/catalog.routes.ts` (весь файл)

**Interfaces:**
- Consumes: `prisma` (`../lib/prisma`), `requireAuth`, `param` (уже импортированы).
- Produces:
  - `POST /api/catalog` → 201 запись | 400 «Код обязателен» | 409 «Код уже существует»
  - `PUT /api/catalog/:code` → 200 {запись} | 200 {…, `codeChanged:true, moved:
    {launches,workOrders,printQueue,queue}}` | 404 | 409
  - `DELETE /api/catalog/:code` → 200 `{ok:true}` | 404 | 409 `{error, refs}`
  - Клиент: `catalog-manager.js` (Task 2) обращается к этим трём эндпоинтам.

- [ ] **Step 1: Добавить импорты и хелперы**

В начало `catalog.routes.ts` (после существующих импортов):

```typescript
import { Prisma } from '@prisma/client';
import { roundSmart } from '../lib/round';
```

После `const router = Router();` добавить:

```typescript
const FLAG_FIELDS = ['cutting', 'heatTreatment', 'plasma', 'turning', 'milling', 'drilling', 'fitting', 'bending', 'coating'] as const;
const NUM_FIELDS = ['parentQty', 'wallThickness', 'cutLength', 'blankWeight', 'partWeight'] as const;
const STR_FIELDS = ['code', 'name', 'designation', 'designation2', 'blankType', 'material', 'materialGrade', 'blankSize', 'ppb', 'priority'] as const;

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  return ['+', '1', 'да'].includes(String(v).trim().toLowerCase());
}

function normalizeBody(body: unknown): Prisma.CatalogUncheckedCreateInput {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const f of STR_FIELDS) {
    const val = raw[f];
    data[f] = typeof val === 'string' ? val.trim() : String(val ?? '').trim();
  }
  for (const f of NUM_FIELDS) {
    const n = Number(raw[f] ?? 0);
    data[f] = roundSmart(Number.isFinite(n) ? n : 0);
  }
  for (const f of FLAG_FIELDS) data[f] = toBool(raw[f]);
  return data as Prisma.CatalogUncheckedCreateInput;
}

function isP2002(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: string }).code === 'P2002';
}
```

- [ ] **Step 2: Добавить POST `/` (create)**

Вставить **перед** `router.get('/:code'` (важно: GET `/:code` срабатывает и на
неизвестный метод, но `:code` перехватил бы `POST /` — поэтому POST/PUT/DELETE
ставятся до GET по конкретным маршрутам или с явным методом; ставим все три после
`GET /` и ДО `GET /:code`):

```typescript
router.post('/', requireAuth('master'), async (req, res) => {
  const data = normalizeBody(req.body);
  if (!data.code) { res.status(400).json({ error: 'Код обязателен' }); return; }
  const existing = await prisma.catalog.findUnique({ where: { code: data.code } });
  if (existing) { res.status(409).json({ error: 'Код уже существует' }); return; }
  try {
    const created = await prisma.catalog.create({ data });
    res.status(201).json(created);
  } catch (e) {
    if (isP2002(e)) { res.status(409).json({ error: 'Код уже существует' }); return; }
    throw e;
  }
});
```

- [ ] **Step 3: Добавить PUT `/:code` (редактирование + смена кода)**

```typescript
router.put('/:code', requireAuth('master'), async (req, res) => {
  const oldCode = param(req, 'code');
  const existing = await prisma.catalog.findUnique({ where: { code: oldCode } });
  if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
  const data = normalizeBody(req.body);
  const newCode = data.code || oldCode;
  if (newCode !== oldCode) {
    const taken = await prisma.catalog.findUnique({ where: { code: newCode } });
    if (taken) { res.status(409).json({ error: 'Код уже существует' }); return; }
    const moved = await prisma.$transaction(async (tx) => {
      await tx.catalog.create({ data: { ...data, code: newCode } });
      const l = await tx.launches.updateMany({ where: { partCode: oldCode }, data: { partCode: newCode } });
      const w = await tx.workOrders.updateMany({ where: { partCode: oldCode }, data: { partCode: newCode } });
      const p = await tx.printQueue.updateMany({ where: { partCode: oldCode }, data: { partCode: newCode } });
      const q = await tx.queue.updateMany({ where: { code: oldCode }, data: { code: newCode } });
      await tx.catalog.delete({ where: { code: oldCode } });
      return { launches: l.count, workOrders: w.count, printQueue: p.count, queue: q.count };
    });
    const fresh = await prisma.catalog.findUnique({ where: { code: newCode } });
    res.json({ ...fresh, codeChanged: true, moved });
    return;
  }
  const updated = await prisma.catalog.update({
    where: { code: oldCode },
    data: data as Prisma.CatalogUncheckedUpdateInput,
  });
  res.json(updated);
});
```

- [ ] **Step 4: Добавить DELETE `/:code`**

```typescript
router.delete('/:code', requireAuth('master'), async (req, res) => {
  const code = param(req, 'code');
  const existing = await prisma.catalog.findUnique({ where: { code } });
  if (!existing) { res.status(404).json({ error: 'Не найдено' }); return; }
  const [launches, workOrders, printQueue, queue] = await Promise.all([
    prisma.launches.count({ where: { partCode: code } }),
    prisma.workOrders.count({ where: { partCode: code } }),
    prisma.printQueue.count({ where: { partCode: code } }),
    prisma.queue.count({ where: { code } }),
  ]);
  if (launches + workOrders + printQueue + queue > 0) {
    res.status(409).json({ error: 'Код используется', refs: { launches, workOrders, printQueue, queue } });
    return;
  }
  await prisma.catalog.delete({ where: { code } });
  res.json({ ok: true });
});
```

- [ ] **Step 5: Проверить типы и синтаксис**

Run (в `server/`): `npm run build` и `npm run check`
Expected: PASS (без ошибок типов).

- [ ] **Step 6: Коммит**

```bash
git add server/src/routes/catalog.routes.ts
git commit -m "feat: write-эндпоинты каталога POST/PUT/DELETE со сменой кода и защитой удаления (CRUD номенклатуры)"
```

---

## Task 2: Клиент — общий компонент `catalog-manager.js`

**Files:**
- Create: `server/src/public/catalog-manager.js`

**Interfaces:**
- Consumes: глобальные `api`, `escHtml`, `showToast`, `emptyBlock`, `fmtNum`
  (из `api.js`/`ui.js`); эндпоинты `/api/catalog`, `/api/catalog/:code`,
  `/api/catalog/tree/units` (Task 1).
- Produces: `window.CatalogManager` с методами
  - `mount(containerEl, { showMetrics, onChanged })` — строит DOM, вешает события;
  - `setTree(units)` — обновляет дерево (для мастера: units из дэшборда с totals).
  - Используется Task 3 (master) и Task 4 (admin).

- [ ] **Step 1: Написать компонент полностью**

Создать файл со следующим содержимым:

```javascript
/* Компонент «Справочник номенклатуры» — дерево + поиск + CRUD (общий для master/admin). */
(function () {
  var treeData = [];
  var opts = { showMetrics: false, onChanged: null };
  var host = null;
  var queryEl = null;
  var treeEl = null;
  var matchesEl = null;
  var modal = null;
  var editingCode = null;

  var FIELDS = [
    { key: 'code', label: 'Код', type: 'text', required: true },
    { key: 'name', label: 'Наименование', type: 'text' },
    { key: 'designation', label: 'Обозначение', type: 'text' },
    { key: 'designation2', label: 'Обозначение (пред.)', type: 'text' },
    { key: 'parentQty', label: 'Кол-во на родителя', type: 'number' },
    { key: 'blankType', label: 'Тип заготовки', type: 'text' },
    { key: 'material', label: 'Материал', type: 'text' },
    { key: 'materialGrade', label: 'Марка материала', type: 'text' },
    { key: 'blankSize', label: 'Размер заготовки', type: 'text' },
    { key: 'wallThickness', label: 'Толщина стенки', type: 'number' },
    { key: 'cutLength', label: 'Длина резки', type: 'number' },
    { key: 'blankWeight', label: 'Масса заготовки', type: 'number' },
    { key: 'partWeight', label: 'Масса детали', type: 'number' },
    { key: 'priority', label: 'Приоритет', type: 'text' }
  ];
  var FLAGS = [
    { key: 'cutting', label: 'Резка' },
    { key: 'heatTreatment', label: 'Термообработка' },
    { key: 'plasma', label: 'Плазма' },
    { key: 'turning', label: 'Токарная' },
    { key: 'milling', label: 'Фрезерная' },
    { key: 'drilling', label: 'Сверлильная' },
    { key: 'fitting', label: 'Слесарная' },
    { key: 'bending', label: 'Гибка' },
    { key: 'coating', label: 'Покрытие' }
  ];

  function leafLabel(node) {
    var ref = node.item || node;
    if (ref.designation) return ref.designation + ' — ' + (ref.name || node.code);
    return ref.name || node.code;
  }

  function metricsText(node) {
    if (!opts.showMetrics || !node.totals) return '';
    return '<span class="muted">(в запуске: ' + fmtNum(node.totals.activeLaunches) +
      ', в работе: ' + fmtNum(node.totals.inWork) + ', закрыто: ' + fmtNum(node.totals.closed) + ')</span>';
  }

  function actionsHtml(code) {
    return '<span class="tree-actions">' +
      '<a data-action="edit" data-code="' + escHtml(code) + '" title="Редактировать">&#9998;</a> ' +
      '<a data-action="delete" data-code="' + escHtml(code) + '" title="Удалить">&#128465;</a></span>';
  }

  function subtree(node) {
    var kids = node.children || [];
    var label = '<span class="tree-label">' + escHtml(leafLabel(node)) + '</span> ' + metricsText(node);
    if (kids.length === 0) {
      return '<div class="tree-leaf">' + label + actionsHtml(node.code) + '</div>';
    }
    var rows = kids.map(subtree).join('');
    return '<details class="tree-node"><summary>' + label + actionsHtml(node.code) + '</summary>' + rows + '</details>';
  }

  function renderTree() {
    if (!treeEl) return;
    if (!treeData || treeData.length === 0) {
      treeEl.innerHTML = emptyBlock('Каталог пуст');
      return;
    }
    treeEl.innerHTML = '<div class="tree">' + treeData.map(subtree).join('') + '</div>';
  }

  async function renderSearch(q) {
    if (!matchesEl || !treeEl) return;
    var items;
    try {
      items = await api('/api/catalog?search=' + encodeURIComponent(q));
    } catch (e) {
      matchesEl.innerHTML = emptyBlock(e.message);
      return;
    }
    if (!items || items.length === 0) {
      matchesEl.innerHTML = emptyBlock('Ничего не найдено');
      return;
    }
    matchesEl.innerHTML = '<div class="tablewrap"><table class="table"><thead><tr>' +
      '<th>Код</th><th>Обозначение</th><th>Наименование</th><th>Кол-во</th><th></th></tr></thead><tbody>' +
      items.map(function (it) {
        return '<tr><td class="mono">' + escHtml(it.code) + '</td><td>' + escHtml(it.designation || '') +
          '</td><td>' + escHtml(it.name || '') + '</td><td class="num">' + fmtNum(it.parentQty) + '</td><td>' +
          actionsHtml(it.code) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function applyQuery() {
    var q = (queryEl && queryEl.value || '').trim();
    if (q.length >= 2) {
      treeEl.style.display = 'none';
      matchesEl.style.display = '';
      renderSearch(q);
    } else {
      matchesEl.style.display = 'none';
      treeEl.style.display = '';
    }
  }

  function fieldHtml(f, val) {
    var v = val === null || val === undefined ? '' : val;
    return '<div class="form-group"><label for="cm-' + f.key + '">' + escHtml(f.label) + '</label>' +
      '<input type="' + (f.type === 'number' ? 'number' : 'text') + '" step="any" id="cm-' + f.key + '" class="input"' +
      (f.required ? ' required' : '') + ' value="' + escHtml(v) + '"></div>';
  }

  function flagHtml(f, val) {
    return '<label class="checkbox-label cm-flag"><input type="checkbox" id="cm-' + f.key + '"' + (val ? ' checked' : '') + '> ' + escHtml(f.label) + '</label>';
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'catalogModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML =
      '<div class="modal-content modal-content--wide">' +
      '<h3 id="cmTitle">Позиция</h3>' +
      '<p id="cmCodeWarn" class="alert alert--error" style="display:none">Код будет изменён — ссылки запусков/нарядов будут обновлены</p>' +
      '<div class="form-grid">' +
      FIELDS.map(function (f) { return fieldHtml(f, ''); }).join('') +
      '</div>' +
      '<div class="form-grid cm-flags">' +
      FLAGS.map(function (f) { return flagHtml(f, false); }).join('') +
      '</div>' +
      '<div class="modal-actions">' +
      '<button id="cmCancel" type="button" class="btn btn--sm">Отмена</button>' +
      '<button id="cmSave" type="button" class="btn btn--primary">Сохранить</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.getElementById('cmCancel').addEventListener('click', closeModal);
    document.getElementById('cmSave').addEventListener('click', save);
    return modal;
  }

  function openAdd() {
    editingCode = null;
    ensureModal();
    document.getElementById('cmTitle').textContent = 'Новая позиция';
    document.getElementById('cmCodeWarn').style.display = 'none';
    FIELDS.forEach(function (f) { document.getElementById('cm-' + f.key).value = ''; });
    FLAGS.forEach(function (f) { document.getElementById('cm-' + f.key).checked = false; });
    showModal();
  }

  async function openEdit(code) {
    var item;
    try {
      item = await api('/api/catalog/' + encodeURIComponent(code));
    } catch (e) {
      showToast(e.message, true);
      return;
    }
    editingCode = item.code;
    ensureModal();
    document.getElementById('cmTitle').textContent = 'Редактирование: ' + editingCode;
    document.getElementById('cmCodeWarn').style.display = 'none';
    FIELDS.forEach(function (f) { document.getElementById('cm-' + f.key).value = item[f.key] === null || item[f.key] === undefined ? '' : item[f.key]; });
    FLAGS.forEach(function (f) { document.getElementById('cm-' + f.key).checked = !!item[f.key]; });
    showModal();
  }

  function collectForm() {
    var body = {};
    FIELDS.forEach(function (f) {
      var el = document.getElementById('cm-' + f.key);
      var v = el.value.trim();
      if (f.type === 'number') body[f.key] = parseFloat(v) || 0;
      else body[f.key] = v;
    });
    FLAGS.forEach(function (f) { body[f.key] = document.getElementById('cm-' + f.key).checked; });
    return body;
  }

  async function save() {
    var body = collectForm();
    if (!body.code) { showToast('Код обязателен', true); return; }
    var changedCode = editingCode && body.code !== editingCode;
    if (changedCode && !confirm('Код будет изменён с «' + editingCode + '» на «' + body.code + '».\nСсылки запусков, нарядов и очереди печати будут обновлены. Продолжить?')) {
      return;
    }
    var url = editingCode ? '/api/catalog/' + encodeURIComponent(editingCode) : '/api/catalog';
    var method = editingCode ? 'PUT' : 'POST';
    try {
      var result = await api(url, { method: method, body: body });
      closeModal();
      showToast(changedCode
        ? 'Код изменён. Обновлено ссылок: запуски=' + result.moved.launches + ', наряды=' + result.moved.workOrders + ', печать=' + result.moved.printQueue + ', очередь=' + result.moved.queue
        : (editingCode ? 'Позиция сохранена' : 'Позиция добавлена'));
      if (typeof opts.onChanged === 'function') { opts.onChanged(); applyQuery(); }
      else refresh();
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function remove(code) {
    if (!confirm('Удалить позицию «' + code + '»?')) return;
    try {
      await api('/api/catalog/' + encodeURIComponent(code), { method: 'DELETE' });
      showToast('Позиция удалена');
      if (typeof opts.onChanged === 'function') { opts.onChanged(); applyQuery(); }
      else refresh();
    } catch (e) {
      if (e.message && e.message.indexOf('Код используется') === 0) {
        showToast(e.message, true);
      } else {
        showToast(e.message, true);
      }
    }
  }

  async function refresh() {
    try {
      treeData = await api('/api/catalog/tree/units');
      renderTree();
      applyQuery();
    } catch (e) {
      toastError(e);
    }
  }

  function toastError(e) {
    showToast((e && e.message) || 'Ошибка', true);
  }

  function showModal() { modal.style.display = 'flex'; }
  function closeModal() { if (modal) modal.style.display = 'none'; }

  function onActionClick(e) {
    var btn = e.target.closest('a[data-action]');
    if (!btn) return;
    var code = btn.getAttribute('data-code');
    if (!code) return;
    if (btn.getAttribute('data-action') === 'edit') openEdit(code);
    else remove(code);
  }

  function mount(container, config) {
    host = container;
    opts = config || {};
    var wrap = document.createElement('div');
    wrap.className = 'panel';
    wrap.innerHTML =
      '<h3>Справочник номенклатуры</h3>' +
      '<div class="catalog-toolbar">' +
      '<input type="text" id="cmSearch" class="input" placeholder="Поиск по коду, наименованию или обозначению...">' +
      '<button id="cmAdd" type="button" class="btn btn--primary">+ Добавить позицию</button>' +
      '</div>' +
      '<div id="cmTree"></div>' +
      '<div id="cmMatches" style="display:none"></div>';
    host.innerHTML = '';
    host.appendChild(wrap);
    queryEl = document.getElementById('cmSearch');
    treeEl = document.getElementById('cmTree');
    matchesEl = document.getElementById('cmMatches');
    document.getElementById('cmAdd').addEventListener('click', openAdd);
    queryEl.addEventListener('input', applyQuery);
    wrap.addEventListener('click', onActionClick);
    if (typeof opts.onChanged === 'function') {
      /* мастер: дерево передаст renderTree() сразу после mount через setTree() — не грузим сами */
    } else {
      refresh();
    }
  }

  function setTree(units) {
    treeData = units || [];
    if (!host) return;
    renderTree();
    applyQuery();
  }

  window.CatalogManager = { mount: mount, setTree: setTree };
})();
```

- [ ] **Step 2: Проверка синтаксиса и сборки**

Run (в `server/`): `npm run build` и `npm run check`
Expected: PASS (static-файлы TS не трогает, но подтверждаем, что ничего не сломано).

- [ ] **Step 3: Коммит**

```bash
git add server/src/public/catalog-manager.js
git commit -m "feat: общий компонент справочника номенклатуры (дерево+поиск+CRUD)"
```

---

## Task 3: Интеграция в `/master` — вкладка «Номенклатура»

**Files:**
- Modify: `server/src/views/master-app.ejs`

**Interfaces:**
- Consumes: `CatalogManager.mount/setTree` (Task 2); `renderTree(d)` переиспользует
  `d.nomenclature.units` из `/api/analytics/dashboard` (метрики).
- Produces: единая точка входа для мастера; `data-nomenclature` новых тестов.

- [ ] **Step 1: Подключить скрипт компонента**

В `<head>`/подвал `master-app.ejs` после `<script src="/ui.js"></script>`
(строка 114) добавить:

```html
<script src="/catalog-manager.js"></script>
```

- [ ] **Step 2: Переустроить вкладку «Номенклатура»**

Заменить блок `<section id="tab-nomenclatura" ...>` (строки 85–91) на:

```html
<section id="tab-nomenclatura" class="tab-panel" hidden>
  <div class="page-header">
    <h1>Номенклатура</h1>
    <button onclick="loadDashboard()" class="btn btn--primary">Обновить</button>
  </div>
  <div id="treeSection"></div>
</section>
```

- [ ] **Step 3: Переписать `renderTree` на монтирование компонента**

Заменить всё тело функции `renderTree(d)` (строки 280–309) на:

```javascript
function renderTree(d) {
  var el = document.getElementById('treeSection');
  var units = (d.nomenclature && d.nomenclature.units) || [];
  if (!window.__catalogManagerMounted) {
    CatalogManager.mount(el, { showMetrics: true, onChanged: loadDashboard });
    window.__catalogManagerMounted = true;
  }
  CatalogManager.setTree(units);
}
```

`loadDashboard()` (строка 350) уже вызывает `renderTree(dashboard)` — после любой
операции CRUD компонент дёргает `onChanged: loadDashboard`, метрики
пересчитываются на сервере и дерево перерисовывается.

- [ ] **Step 4: Коммит**

```bash
git add server/src/views/master-app.ejs
git commit -m "feat: вкладка «Номенклатура» мастера — редактор справочника (дерево+метрики+CRUD)"
```

---

## Task 4: Интеграция в `/admin` — таб «Номенклатура» + стили

**Files:**
- Modify: `server/src/views/admin.ejs`
- Modify: `server/src/public/styles.css`

**Interfaces:**
- Consumes: `CatalogManager.mount(container, {})` (Task 2) в новом табе.
- Produces: навигация «Сотрудники | Номенклатура»; контейнер `#adminCatalogManager`.

- [ ] **Step 1: Подключить скрипт компонента в `/admin`**

После `<script src="/ui.js"></script>` (строка 70) добавить:

```html
<script src="/catalog-manager.js"></script>
```

- [ ] **Step 2: Навигация — два таба**

Заменить `<nav class="top-bar__nav">` (строки 19–21) на:

```html
<nav class="top-bar__nav">
  <button class="tab-btn active" data-panel="employees" type="button" onclick="switchPanel('employees')">Сотрудники</button>
  <button class="tab-btn" data-panel="catalog" type="button" onclick="switchPanel('catalog')">Номенклатура</button>
</nav>
```

- [ ] **Step 3: Разделить контент на две панели**

Обернуть существующий `<main class="container">…</main>` контент в панель
сотрудников и добавить панель справочника:

```html
<main class="container">
  <section id="panel-employees">
    <div class="page-header">
      <h1>Администрирование сотрудников</h1>
      <button onclick="loadEmployees()" class="btn btn--primary">Обновить</button>
    </div>
    <!-- форма и таблица сотрудников — как были -->
  </section>

  <section id="panel-catalog" hidden>
    <div class="page-header">
      <h1>Номенклатура</h1>
      <button onclick="window.__CM_RELOAD && window.__CM_RELOAD()" class="btn btn--primary">Обновить</button>
    </div>
    <div id="adminCatalogManager"></div>
  </section>
</main>
```

- [ ] **Step 4: JS переключения табов + монтирование**

В скрипте `admin.ejs` (внутри `<script>` секции IIFE) добавить (после блока
`(async function() {...})();`, например перед `var ROLE_LABELS = ...`):

```javascript
function switchPanel(name) {
  document.querySelectorAll('.top-bar__nav .tab-btn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-panel') === name);
  });
  var emp = document.getElementById('panel-employees');
  var cat = document.getElementById('panel-catalog');
  if (emp) emp.hidden = name !== 'employees';
  if (cat) { cat.hidden = name !== 'catalog'; }
  if (name === 'catalog' && !window.__catalogManagerAdminMounted) {
    CatalogManager.mount(document.getElementById('adminCatalogManager'), { showMetrics: false, onChanged: null });
    window.__catalogManagerAdminMounted = true;
  }
}
window.__CM_RELOAD = function () {
  if (window.__catalogManagerAdminMounted) {
    var el = document.getElementById('adminCatalogManager');
    if (el) el.innerHTML = '';
    window.__catalogManagerAdminMounted = false;
    CatalogManager.mount(el, { showMetrics: false, onChanged: null });
    window.__catalogManagerAdminMounted = true;
  }
};
```

- [ ] **Step 5: Стили компонента**

Добавить в конец `server/src/public/styles.css`:

```css
.catalog-toolbar { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin: .25rem 0 .75rem; }
.catalog-toolbar .input { flex: 1 1 240px; }
.tree-actions { margin-left: .5rem; font-size: .8rem; white-space: nowrap; opacity: .3; }
.tree-leaf:hover .tree-actions, .tree-node > summary:hover .tree-actions { opacity: 1; }
.tree-actions a { cursor: pointer; padding: 0 .2rem; color: var(--ink-2); text-decoration: none; }
.tree-actions a:hover { color: var(--primary); }
.cm-flags { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .35rem .75rem; margin-top: .5rem; }
.cm-flags .checkbox-label { font-weight: 400; }
```

- [ ] **Step 6: Проверка**

Run (в `server/`): `npm run build` + `npm run check`
Expected: PASS.

- [ ] **Step 7: Коммит**

```bash
git add server/src/views/admin.ejs server/src/public/styles.css
git commit -m "feat: таб «Номенклатура» в /admin на общем компоненте + стили справочника"
```

---

## Task 5: E2E-тест `tests/e2e/test_catalog_crud.py`

**Files:**
- Create: `tests/e2e/test_catalog_crud.py`

**Interfaces:**
- Consumes: `config`/`runner` из харнесса; креды ролей из `config.CREDS`
  (логин-пароль из `e2e-env.ps1`); эндпоинты Task 1; UI Task 3/4.
- Produces: эталон **13/13 PASS**; стенд после прогона чист.

- [ ] **Step 1: Написать тест**

Скопировать каркас из `tests/e2e/test_auth_flow.py` (импорты, `run_sql()`,
`main()` с `sync_playwright`) и добавить:

#### API-часть

```python
def create_item(req, token, code, name="Тест"):
    return api(req, "POST", "/api/catalog", {"code": code, "name": name, "designation": "TST-ОБОЗН"}, token=token)
```

Основной сценарий (в `main()`):

```python
API_TOKEN = {r: login(...) for r in ["master", "shift", "admin"]}  # login() из test_auth_flow
```

(Перенести локальные `api()`/`login()` хелперы из `test_auth_flow.py` в этот
файл, или импортировать их из общего модуля.)

Кейсы (строго по порядку, `runner.check`) — коды префиксом `TST-` + случайная
метка, например `CODE_A = "TST-" + TS`:

1. create `CODE_A` master → 201, тело `.code == CODE_A`
2. create `CODE_A` повторно → 409
3. create с пустым `code` → 400
4. create под токеном shift → 403
5. PUT без смены кода (name="Тест2") → 200 и `result["name"] == "Тест2"`
6. смена кода: создать запуск ссылкой на `CODE_A`
   (`POST /api/launches` master, `partCode=CODE_A`, `paNumber="TST-PA"`) → 201;
   затем `PUT /api/catalog/CODE_A` c `code=CODE_B` → 200,
   `result["codeChanged"] is True`, `result["moved"]["launches"] >= 1`
7. удаление занятого `CODE_B` → 409 (тело содержит `refs` и `error`)
8. удалить тестовый запуск (`DELETE /api/launches/:id` master) → 200
9. `DELETE /api/catalog/CODE_B` → 200
10. `GET /api/catalog` → список **не** содержит `CODE_A`/`CODE_B`
11. UI `/admin`: `page.goto(BASE + "/admin")` → wait `#tab`-кнопки →
    клик кнопки «Номенклатура» → ждать `#cmAdd` (компонент смонтирован)
12. UI `/master`: `page.goto(BASE + "/master")` → клик таба «Номенклатура» →
    ждать `#cmAdd`
13. ОБЯЗАТЕЛЬНЫЙ cleanup: `run_sql(...)` удалить `Catalog` по `CODE_A/CODE_B`
    и `Launches` по `TST-PA` (страховка FK-очередью: сначала Launches, затем
    Catalog), затем проверить `SELECT count(*) ... = 0`.

Кейс 6 требует, чтобы запуск ссылался на живой код — создание запуска
подтверждает корректность каскада смены кода.

- [ ] **Step 2: Прогнать тест против стенда**

Сначала деплой (Task 6. Step 1), затем:

```powershell
. tests/e2e/.secrets/e2e-env.ps1
python tests/e2e/test_catalog_crud.py
```

Expected: **13/13 PASS**. Если сервер ещё не пересобран — дождаться Task 6.

- [ ] **Step 3: Коммит**

```bash
git add tests/e2e/test_catalog_crud.py
git commit -m "test: e2e CRUD номенклатуры (create/dup/403/смена кода с каскадом/delete-блокировка/UI)"
```

---

## Task 6: Деплой, полная проверка, документация

**Files:**
- Modify: `docs/specs/data-model.md` (строка о заполнении `Catalog`)
- Modify: `docs/reports/STATUS.md`
- Create: `docs/reports/2026-09-23-catalog-crud.md`

**Interfaces:**
- Consumes: все задачи 1–5.

- [ ] **Step 1: Деплой на стенд**

```powershell
cd server
docker compose up -d --build
```

Затем: `Invoke-WebRequest http://localhost:3000/health` → `{status:'ok'}`.
После деплоя — слово «тестируй».

- [ ] **Step 2: Прогон E2E**

Прогнать `tests/e2e/test_catalog_crud.py` (Task 5). Дополнительно — быстрый
регресс штатных ролей:

```powershell
python tests/e2e/test_admin.py
python tests/e2e/test_master.py
```

Expected: test_catalog_crud 13/13; test_admin 5/5; test_master 12/12.

- [ ] **Step 3: Проверить чистоту стенда**

`run_sql` равенств: `Launches`/`WorkOrders`/`Catalog` по `TST-*` = 0; живой
каталог (2208) не тронут.

- [ ] **Step 4: Обновить документацию**

- `docs/specs/data-model.md`: в строке `Catalog` секции «Модель данных» (или
  описание способов заполнения) добавить: «…дополнительно ведётся из UI:
  master/admin (CRUD через `/api/catalog` POST/PUT/DELETE)».
- `docs/reports/2026-09-23-catalog-crud.md`: отчёт этапа (что сделано, как
  проверено, что осталось, следующий шаг — автозаполнение).
- `docs/reports/STATUS.md`: после раздела «Последний завершённый этап» добавить
  блок **«23.09.2026 — Этап 16: справочник номенклатуры в UI (CRUD каталога)»**
  с метриками проверок и чистотой стенда.

- [ ] **Step 5: Финальные коммиты**

```bash
git add docs/specs/data-model.md
git commit -m "docs: каталог ведётся из UI (master/admin) — дополнение data-model"

git add docs/reports/2026-09-23-catalog-crud.md docs/reports/STATUS.md
git commit -m "docs: Этап 16 — справочник номенклатуры (CRUD) в UI; проверки и стенд чисты"
```

Тег этапа (по завершении): `git tag v0.19-catalog-crud` (по согласованию с
пользователем).

---

## Self-Review

- **Покрытие спеки:** раздел 2 (эндпоинты) → Task 1; раздел 3.3 (компонент) →
  Task 2; 3.1 (master) → Task 3; 3.2 (admin) → Task 4; раздел 7 (проверки) →
  Tasks 5–6; раздел 4 (инварианты) → Task 1 (каскад, защита удаления) и
  `roundSmart` в `normalizeBody`. Раздел 5 (импорт) — вне объёма, зафиксирован в
  спёке как ограничение. Раздел 6 (дорожка) → автозаполнение — отдельный шаг после.
- **Плейсхолдеры:** нет TBD — все код-блоки конкретны.
- **Консистентность типов:** `CatalogManager.mount/setTree` в Task 2 и вызовы в
  Task 3/4 совпадают; поля формы и `normalizeBody` — по модели `Catalog`;
  `moved`-структура Task 1 = чтение в Task 2 (`.moved.launches` и т.д.).