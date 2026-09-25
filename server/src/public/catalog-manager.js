/* Компонент «Справочник номенклатуры» — дерево + поиск + CRUD (общий для master/admin).
   Зависит от глобальных api/escHtml/showToast (api.js) и emptyBlock/fmtNum (ui.js). */
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
    return '<span class="muted">(в запуске: ' + fmtNum(node.totals.activeLaunches) + ', в работе: ' + fmtNum(node.totals.inWork) + ', закрыто: ' + fmtNum(node.totals.closed) + ')</span>';
  }

  function actionsHtml(code) {
    return '<span class="tree-actions">' +
      '<a data-action="edit" data-code="' + escHtml(code) + '" href="#" onclick="return false;" title="Редактировать">&#9998;</a> ' +
      '<a data-action="delete" data-code="' + escHtml(code) + '" href="#" onclick="return false;" title="Удалить">&#128465;</a></span>';
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
      showToast(e.message, true);
    }
  }

  async function refresh() {
    try {
      treeData = await api('/api/catalog/tree/units');
      renderTree();
      applyQuery();
    } catch (e) {
      showToast(e.message, true);
    }
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
      /* мастер: renderTree() сразу после mount передаст дерево через setTree() */
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