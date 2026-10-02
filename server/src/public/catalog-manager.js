/* Компонент «Справочник номенклатуры» — дерево + поиск + CRUD (общий для master/admin).
   Зависит от глобальных api/escHtml/showToast (api.js) и emptyBlock/fmtNum (ui.js). */
(function () {
  var treeData = [];
  var treeLoaded = false;
  var opts = { showMetrics: false, onChanged: null };
  var host = null;
  var queryEl = null;
  var treeEl = null;
  var matchesEl = null;
  var modal = null;
  var editingCode = null;
  var currentRole = null;
  var dictOptions = {};
  var nextCodeRequest = 0;
  var docCounts = {};

  var DICT_TYPES = ['blankType', 'material', 'materialGrade', 'blankSize', 'priority'];
  var DICT_LABELS = {
    blankType: 'вид заготовки',
    material: 'материал',
    materialGrade: 'марка материала',
    blankSize: 'размер заготовки',
    priority: 'приоритет'
  };

  var FIELDS = [
    { key: 'code', label: 'Код', type: 'text', required: true },
    { key: 'name', label: 'Наименование', type: 'text' },
    { key: 'designation', label: 'Обозначение', type: 'text' },
    { key: 'designation2', label: 'Обозначение (пред.)', type: 'text' },
    { key: 'parentQty', label: 'Кол-во на родителя', type: 'number' },
    { key: 'blankType', label: 'Тип заготовки', type: 'select' },
    { key: 'material', label: 'Материал', type: 'select' },
    { key: 'materialGrade', label: 'Марка материала', type: 'select' },
    { key: 'blankSize', label: 'Размер заготовки', type: 'select' },
    { key: 'wallThickness', label: 'Толщина стенки', type: 'number' },
    { key: 'cutLength', label: 'Длина резки', type: 'number' },
    { key: 'blankWeight', label: 'Масса заготовки', type: 'number' },
    { key: 'partWeight', label: 'Масса детали', type: 'number' },
    { key: 'priority', label: 'Приоритет', type: 'select' }
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

  function docsBadge(code) {
    var n = docCounts[code] || 0;
    if (!n) return '';
    return '<span class="tree-docs" title="Документов: ' + n + '">КД: ' + n + '</span>';
  }

  function actionsHtml(code, isVirtual, hasChildren) {
    if (typeof isVirtual === 'undefined') isVirtual = false;
    if (typeof hasChildren === 'undefined') hasChildren = false;
    var n = docCounts[code] || 0;
    var html = '<span class="tree-actions">' +
      '<a data-action="docs" data-code="' + escHtml(code) + '" href="#" onclick="return false;" title="Документы (' + n + ')">&#128196;</a> ';
    if (!isVirtual) {
      html += '<a data-action="edit" data-code="' + escHtml(code) + '" href="#" onclick="return false;" title="Редактировать">&#9998;</a> ';
    }
    if (hasChildren) {
      html += '<a data-action="delete-group" data-code="' + escHtml(code) + '" href="#" onclick="return false;" title="Удалить всю группу">&#128465;</a> ';
    }
    if (!isVirtual && !hasChildren) {
      html += '<a data-action="delete" data-code="' + escHtml(code) + '" href="#" onclick="return false;" title="Удалить">&#128465;</a>';
    }
    html += '</span>';
    return html;
  }

  function subtree(node) {
    var kids = node.children || [];
    var label = '<span class="tree-label">' + escHtml(leafLabel(node)) + '</span> ' + docsBadge(node.code) + metricsText(node);
    var isVirtual = !node.item; // виртуальная группа (нет строки в Catalog)
    var hasChildren = kids.length > 0;
    if (kids.length === 0) {
      return '<div class="tree-leaf">' + label + actionsHtml(node.code, isVirtual, false) + '</div>';
    }
    var rows = kids.map(subtree).join('');
    return '<details class="tree-node"><summary>' + label + actionsHtml(node.code, isVirtual, true) + '</summary>' + rows + '</details>';
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
    var findNode = function (code) {
      var found = null;
      var walk = function (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].code === code) { found = list[i]; return true; }
          if (list[i].children && walk(list[i].children)) return true;
        }
        return false;
      };
      walk(treeData || []);
      return found;
    };
    matchesEl.innerHTML = '<div class="tablewrap"><table class="table"><thead><tr>' +
      '<th>Код</th><th>Обозначение</th><th>Наименование</th><th>Кол-во</th><th>КД</th><th></th></tr></thead><tbody>' +
      items.map(function (it) {
        var node = findNode(it.code);
        var hasKids = !!(node && node.children && node.children.length > 0);
        return '<tr><td class="mono">' + escHtml(it.code) + '</td><td>' + escHtml(it.designation || '') +
          '</td><td>' + escHtml(it.name || '') + '</td><td class="num">' + fmtNum(it.parentQty) + '</td><td>' +
          docsBadge(it.code) + '</td><td>' +
          actionsHtml(it.code, false, hasKids) + '</td></tr>';
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

  function dictValue(row) {
    var value = row && typeof row === 'object' ? row.value : row;
    return value === null || value === undefined ? '' : String(value);
  }

  function dictOptionsHtml(f, val) {
    var v = val === null || val === undefined ? '' : String(val);
    var html = '<option value=""' + (v ? '' : ' selected') + '>Не задано</option>';
    var found = !v;
    (dictOptions[f.key] || []).forEach(function (row) {
      var optionValue = dictValue(row);
      if (!optionValue) return;
      if (optionValue === v) found = true;
      html += '<option value="' + escHtml(optionValue) + '"' + (optionValue === v ? ' selected' : '') + '>' + escHtml(optionValue) + '</option>';
    });
    if (v && !found) {
      html += '<option value="' + escHtml(v) + '" selected hidden>' + escHtml(v) + '</option>';
    }
    return html;
  }

  function fieldElement(f) {
    var id = f.key === 'code' && currentRole !== 'admin' ? 'cmCode' : 'cm-' + f.key;
    return document.getElementById(id);
  }

  function fieldHtml(f, val) {
    var v = val === null || val === undefined ? '' : val;
    if (f.key === 'code' && currentRole !== 'admin') {
      return '<div class="form-group"><label for="cmCode">Код</label>' +
        '<div id="cmCodeLine" class="cm-code-line">Код: <b id="cmCodeVal"></b> <span class="muted">(сгенерирован системой)</span><span id="cmCodeHint" class="muted"></span></div>' +
        '<input type="hidden" id="cmCode" value=""></div>';
    }
    if (DICT_TYPES.indexOf(f.key) !== -1 || f.type === 'select') {
      return '<div class="form-group"><label for="cm-' + f.key + '">' + escHtml(f.label) + '</label>' +
        '<div class="dict-wrap"><select id="cm-' + f.key + '" class="input cm-dict-select" required>' + dictOptionsHtml(f, v) + '</select>' +
        '<button id="cmAddDict-' + f.key + '" type="button" class="btn btn--sm" title="Добавить значение">+</button>' +
        '</div></div>';
    }
    return '<div class="form-group"><label for="cm-' + f.key + '">' + escHtml(f.label) + '</label>' +
      '<input type="' + (f.type === 'number' ? 'number' : 'text') + '" step="any" id="cm-' + f.key + '" class="input"' +
      (f.key === 'code' ? '' : ' placeholder="Не задано"') + (f.required ? ' required' : '') +
      ' value="' + escHtml(v) + '"></div>';
  }

  function setSelectValue(el, val) {
    if (!el) return;
    var v = val === null || val === undefined ? '' : String(val);
    if (v) {
      var found = Array.prototype.some.call(el.options, function (option) { return option.value === v; });
      if (!found) {
        var option = document.createElement('option');
        option.value = v;
        option.textContent = v;
        option.hidden = true;
        el.appendChild(option);
      }
    }
    el.value = v;
  }

  function setCodeValue(val, hint) {
    var v = val === null || val === undefined ? '' : String(val);
    var input = document.getElementById(currentRole === 'admin' ? 'cm-code' : 'cmCode');
    if (input) input.value = v;
    var line = document.getElementById('cmCodeLine');
    var valueEl = document.getElementById('cmCodeVal');
    var hintEl = document.getElementById('cmCodeHint');
    if (line && valueEl) line.setAttribute('data-code', v);
    if (valueEl) valueEl.textContent = v;
    if (hintEl) hintEl.textContent = hint || '';
  }

  function clearInputErrors() {
    FIELDS.concat(FLAGS).forEach(function (f) {
      var el = fieldElement(f);
      if (el) el.classList.remove('input-error');
    });
    var parent = document.getElementById('cmParent');
    if (parent) parent.classList.remove('input-error');
  }

  function flattenNodes(nodes, out) {
    (nodes || []).forEach(function (node) {
      if (!node || !node.code) return;
      out.push(node);
      flattenNodes(node.children || [], out);
    });
    return out;
  }

  function normalizedCode(code) {
    return String(code || '').split(/[./]/).map(function (part) { return part.trim(); }).filter(Boolean).join('/');
  }

  function parentFromCode(code) {
    var parts = String(code || '').split(/[./]/).map(function (part) { return part.trim(); }).filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  }

  function parentOptionCode(parent) {
    var normalized = normalizedCode(parent);
    if (!normalized) return '';
    var nodes = flattenNodes(treeData, []);
    for (var i = 0; i < nodes.length; i++) {
      if (normalizedCode(nodes[i].code) === normalized) return nodes[i].code;
    }
    return parent;
  }

  async function loadDictOptions() {
    if (DICT_TYPES.every(function (type) { return Object.prototype.hasOwnProperty.call(dictOptions, type); })) return;
    try {
      await Promise.all(DICT_TYPES.map(async function (type) {
        var rows = await api('/api/dictionaries/' + type);
        dictOptions[type] = rows || [];
      }));
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function ensureTreeData() {
    if (treeLoaded) return;
    try {
      treeData = await api('/api/catalog/tree/units');
      treeLoaded = true;
    } catch (e) {
      showToast(e.message, true);
    }
  }

  function nodeCode(node) {
    return node && node.code ? String(node.code) : '';
  }

  function findNodeByCode(code) {
    if (!code) return null;
    var needle = normalizedCode(code);
    var stack = treeData.slice();
    while (stack.length) {
      var node = stack.shift();
      if (normalizedCode(nodeCode(node)) === needle) return node;
      if (node.children) stack = stack.concat(node.children);
    }
    return null;
  }

  function parentPathCodes(code) {
    var parts = String(code || '').split(/[./]/).map(function (part) { return part.trim(); }).filter(Boolean);
    var out = [];
    var acc = '';
    for (var i = 0; i < parts.length; i++) {
      acc = acc ? acc + '/' + parts[i] : parts[i];
      out.push(acc);
    }
    return out;
  }

  function parentSubtree(node, selectedCode, pathSet) {
    var kids = Array.isArray(node.children) ? node.children : [];
    var code = nodeCode(node);
    var norm = normalizedCode(code);
    var label = code + ' — ' + escHtml(node.name || node.designation || '…');
    var isSel = norm === normalizedCode(selectedCode);
    var cls = isSel ? 'tree-leaf selected' : 'tree-leaf';
    var row = '<div class="' + cls + '" data-code="' + escHtml(code) + '" title="' + escHtml(label) + '">' +
      '<span class="tree-label">' + label + '</span></div>';
    if (kids.length === 0) return row;
    var open = isSel || (pathSet && pathSet[norm]);
    var rows = kids.map(function (k) { return parentSubtree(k, selectedCode, pathSet); }).join('');
    var selCls = isSel ? ' selected' : '';
    return '<details class="tree-node"' + (open ? ' open' : '') + '>' +
      '<summary data-code="' + escHtml(code) + '" class="' + selCls + '">' + label + '</summary>' + rows + '</details>';
  }

  function parentPickerHtml(selected) {
    var sel = selected || '';
    var rootCls = 'tree-parent-root' + (sel ? '' : ' selected');
    var pathSet = {};
    parentPathCodes(sel).forEach(function (p) { pathSet[p] = true; });
    var html = '<div class="' + rootCls + '" data-code="">— Корень —</div>';
    return html + treeData.map(function (n) { return parentSubtree(n, sel, pathSet); }).join('');
  }

  function setParentValue(value, label) {
    var hidden = document.getElementById('cmParent');
    if (!hidden) return;
    hidden.value = value || '';
    var valueEl = document.getElementById('cmParentValue');
    if (valueEl) valueEl.textContent = label || (value ? value : '— Корень —');
  }

  function selectParent(value, keepOpen) {
    var code = (value || '').trim();
    var node = findNodeByCode(code);
    var label = node ? nodeCode(node) + ' — ' + (node.name || node.designation || '…') : (code || '');
    setParentValue(code, label);
    var tree = document.getElementById('cmParentTree');
    if (tree) tree.innerHTML = parentPickerHtml(code);
    if (!keepOpen) {
      var picker = document.getElementById('cmParentPicker');
      if (picker) picker.style.display = 'none';
    }
    if (currentRole !== 'admin' && !editingCode) loadNextCode(code);
  }

  function renderParentTree(selected) {
    var tree = document.getElementById('cmParentTree');
    if (!tree) return;
    tree.innerHTML = parentPickerHtml(selected);
  }

  function populateParentSelect(selected) {
    var value = selected || '';
    var node = findNodeByCode(value);
    setParentValue(value, node ? nodeCode(node) + ' — ' + (node.name || node.designation || '…') : (value || ''));
    renderParentTree(value);
  }

  function searchParent(q) {
    var tree = document.getElementById('cmParentTree');
    if (!tree) return;
    var needle = (q || '').trim().toLowerCase();
    if (needle.length < 2) {
      renderParentTree(getSelectedParent());
      return;
    }
    var matches = flattenNodes(treeData, []).filter(function (n) {
      return [n.code, n.name, n.designation].filter(Boolean).some(function (s) {
        return String(s).toLowerCase().indexOf(needle) !== -1;
      });
    });
    if (!matches.length) {
      tree.innerHTML = '<div class="muted" style="padding:0.5rem">Ничего не найдено</div>';
      return;
    }
    tree.innerHTML = matches.map(function (n) {
      var code = nodeCode(n);
      var label = code + ' — ' + escHtml(n.name || n.designation || '…');
      var isSel = normalizedCode(code) === normalizedCode(getSelectedParent());
      return '<div class="tree-leaf' + (isSel ? ' selected' : '') + '" data-code="' + escHtml(code) + '" title="' + escHtml(label) + '">' +
        '<span class="tree-label">' + label + '</span></div>';
    }).join('');
  }

  function getSelectedParent() {
    var hidden = document.getElementById('cmParent');
    return hidden ? hidden.value : '';
  }

  function onParentTreeClick(e) {
    var row = e.target.closest('[data-code]');
    if (!row) return;
    var code = row.getAttribute('data-code') || '';
    var isFolder = e.target.closest('summary');
    if (isFolder) {
      selectParent(code, true);
      return;
    }
    selectParent(code, false);
  }

  function onParentSearchInput() {
    var input = document.getElementById('cmParentSearch');
    if (!input) return;
    searchParent(input.value);
  }

  function toggleParentPicker() {
    var picker = document.getElementById('cmParentPicker');
    if (!picker) return;
    var willShow = picker.style.display !== 'flex';
    picker.style.display = willShow ? 'flex' : 'none';
    if (willShow) {
      var input = document.getElementById('cmParentSearch');
      if (input) input.value = '';
      renderParentTree(getSelectedParent());
    }
  }

  function dictFieldFromError(e) {
    if (e && e.field) return e.field;
    var message = e && e.message ? e.message : '';
    if (message.toLowerCase().indexOf('не в пределах') === -1) return null;
    var orderedTypes = DICT_TYPES.slice().sort(function (a, b) { return DICT_LABELS[b].length - DICT_LABELS[a].length; });
    for (var i = 0; i < orderedTypes.length; i++) {
      if (message.toLowerCase().indexOf(DICT_LABELS[orderedTypes[i]].toLowerCase()) !== -1) return orderedTypes[i];
    }
    return null;
  }

  async function addDictionaryValue(key) {
    var field = FIELDS.find(function (f) { return f.key === key; });
    if (!field) return;
    var input = window.prompt('Новое значение для ' + field.label + ':');
    if (input === null) return;
    var value = input.trim().replace(/\s+/g, ' ');
    if (!value) return;
    try {
      var result = await api('/api/dictionaries/' + key, { method: 'POST', body: { value: value } });
      dictOptions[key] = dictOptions[key] || [];
      dictOptions[key].push({ id: result && result.id, value: value });
      var select = document.getElementById('cm-' + key);
      if (select) {
        var option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
        select.value = value;
      }
    } catch (e) {
      if (e && e.message && e.message.toLowerCase().indexOf('уже есть') !== -1) showToast('Значение уже есть в справочнике', true);
      else showToast(e.message || 'Ошибка запроса', true);
    }
  }

  async function loadNextCode(parentValue) {
    var requestId = ++nextCodeRequest;
    var input = document.getElementById('cmCode');
    if (!input) return;
    setCodeValue('');
    try {
      var result = await api('/api/catalog/next-code', { method: 'POST', body: { parent: parentValue || '' } });
      if (requestId !== nextCodeRequest) return;
      var code = result && result.code ? result.code : '';
      var hint = result && result.wouldMaterialize && result.wouldMaterialize.length
        ? '; будут созданы узлы-контейнеры: ' + result.wouldMaterialize.join(', ')
        : '';
      setCodeValue(code, hint);
    } catch (e) {
      if (requestId !== nextCodeRequest) return;
      setCodeValue('');
      showToast(e.message || 'Ошибка запроса', true);
    }
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
      '<div class="form-group"><label for="cmParent">Родитель</label>' +
      '<div class="cm-parent-wrap">' +
      '<span id="cmParentValue" class="cm-parent-value">— Корень —</span>' +
      '<button id="cmParentPick" type="button" class="btn btn--sm">Выбрать</button>' +
      '<input type="hidden" id="cmParent" value=""></div>' +
      '<div id="cmParentPicker" class="cm-parent-picker" style="display:none">' +
      '<input id="cmParentSearch" class="input cm-parent-search" placeholder="Поиск узла по коду, наименованию, обозначению...">' +
      '<div id="cmParentTree" class="cm-parent-tree"></div>' +
      '</div></div>' +
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
    var pickBtn = document.getElementById('cmParentPick');
    if (pickBtn) pickBtn.addEventListener('click', toggleParentPicker);
    var parentTree = document.getElementById('cmParentTree');
    if (parentTree) parentTree.addEventListener('click', onParentTreeClick);
    var parentSearch = document.getElementById('cmParentSearch');
    if (parentSearch) parentSearch.addEventListener('input', onParentSearchInput);
    DICT_TYPES.forEach(function (type) {
      var button = document.getElementById('cmAddDict-' + type);
      if (button) button.addEventListener('click', function () { addDictionaryValue(type); });
    });
    return modal;
  }

  async function openAdd() {
    editingCode = null;
    await loadDictOptions();
    await ensureTreeData();
    ensureModal();
    document.getElementById('cmTitle').textContent = 'Новая позиция';
    document.getElementById('cmCodeWarn').style.display = 'none';
    clearInputErrors();
    populateParentSelect('');
    FIELDS.forEach(function (f) {
      if (f.key === 'code') {
        setCodeValue('');
        return;
      }
      var el = fieldElement(f);
      if (!el) return;
      if (DICT_TYPES.indexOf(f.key) !== -1) setSelectValue(el, '');
      else el.value = '';
    });
    FLAGS.forEach(function (f) { document.getElementById('cm-' + f.key).checked = false; });
    showModal();
    if (currentRole !== 'admin') await loadNextCode('');
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
    await loadDictOptions();
    await ensureTreeData();
    ensureModal();
    document.getElementById('cmTitle').textContent = 'Редактирование: ' + editingCode;
    document.getElementById('cmCodeWarn').style.display = 'none';
    clearInputErrors();
    populateParentSelect(parentOptionCode(parentFromCode(item.code)));
    FIELDS.forEach(function (f) {
      if (f.key === 'code') {
        setCodeValue(item.code);
        return;
      }
      var el = fieldElement(f);
      var value = item[f.key] === null || item[f.key] === undefined ? '' : item[f.key];
      if (!el) return;
      if (DICT_TYPES.indexOf(f.key) !== -1) setSelectValue(el, value);
      else el.value = (f.type === 'number' && (!value || Number(value) === 0)) ? '' : value;
    });
    FLAGS.forEach(function (f) { document.getElementById('cm-' + f.key).checked = !!item[f.key]; });
    showModal();
  }

  function collectForm() {
    var body = {};
    FIELDS.forEach(function (f) {
      var el = fieldElement(f);
      var v = el && el.value !== undefined ? String(el.value).trim() : '';
      if (f.type === 'number') body[f.key] = parseFloat(v) || 0;
      else body[f.key] = v;
    });
    FLAGS.forEach(function (f) { body[f.key] = document.getElementById('cm-' + f.key).checked; });
    var parent = document.getElementById('cmParent');
    body.parent = parent && parent.value ? parent.value.trim() : '';
    return body;
  }

  async function save() {
    clearInputErrors();
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
      var message;
      if (changedCode) {
        var moved = result && result.moved || {};
        message = 'Код изменён. Обновлено ссылок: запуски=' + moved.launches + ', наряды=' + moved.workOrders + ', печать=' + moved.printQueue + ', очередь=' + moved.queue;
      } else if (editingCode) {
        message = 'Позиция сохранена';
      } else {
        message = 'Позиция добавлена';
        if (result && Array.isArray(result.materialized) && result.materialized.length) {
          message += ' (+ созданы контейнеры: ' + result.materialized.join(', ') + ')';
        }
      }
      showToast(message);
      if (typeof opts.onChanged === 'function') { opts.onChanged(); applyQuery(); }
      else refresh();
    } catch (e) {
      var field = dictFieldFromError(e);
      if (field) {
        var input = document.getElementById(field === 'code' && currentRole !== 'admin' ? 'cmCode' : 'cm-' + field);
        if (input) input.classList.add('input-error');
      }
      showToast(e && e.message || 'Ошибка запроса', true);
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
      var msg = e && e.message ? e.message : 'Ошибка запроса';
      if (/не найдено|не существует|not found/i.test(msg) || (e && e.status === 404)) {
        if (typeof opts.onChanged === 'function') { opts.onChanged(); applyQuery(); }
        else refresh();
        return;
      }
      showToast(msg, true);
    }
  }

  async function removeGroup(code) {
    if (!confirm('Удалить всю группу «' + code + '» и все вложенные позиции? Это действие необратимо.')) return;
    try {
      const r = await api('/api/catalog/prefix/' + encodeURIComponent(code), { method: 'DELETE' });
      showToast('Группа удалена' + (r && r.deleted ? ' (' + r.deleted + ')' : ''));
      if (typeof opts.onChanged === 'function') { opts.onChanged(); applyQuery(); }
      else refresh();
    } catch (e) {
      var msg = e && e.message ? e.message : 'Ошибка запроса';
      if (/не найдено|не существует|not found/i.test(msg) || (e && e.status === 404) || (e && e.status === 204)) {
        if (typeof opts.onChanged === 'function') { opts.onChanged(); applyQuery(); }
        else refresh();
        return;
      }
      showToast(msg, true);
    }
  }

  async function refresh() {
    try {
      treeData = await api('/api/catalog/tree/units');
      treeLoaded = true;
      await loadDocCounts();
      renderTree();
      applyQuery();
    } catch (e) {
      showToast(e.message, true);
    }
  }

  async function loadDocCounts() {
    try {
      docCounts = await api('/api/product-docs/counts') || {};
    } catch (e) {
      docCounts = {};
    }
  }

  function ensureDocsModal() {
    if (document.getElementById('cmDocsModal')) return document.getElementById('cmDocsModal');
    var el = document.createElement('div');
    el.id = 'cmDocsModal';
    el.className = 'modal';
    el.style.display = 'none';
    el.innerHTML = '<div class="modal-content modal-content--wide">' +
      '<h3 id="cmDocsTitle">Документы</h3>' +
      '<div id="cmDocsBody"></div>' +
      '<div class="modal-actions"><button id="cmDocsClose" type="button" class="btn btn--sm">Закрыть</button></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el) el.style.display = 'none'; });
    document.getElementById('cmDocsClose').addEventListener('click', function () { el.style.display = 'none'; });
    return el;
  }

  function docItemHtml(doc) {
    var others = (doc.parts || []).filter(function (p) { return p.code !== doc.partCode; });
    var shared = '';
    if (others.length) {
      shared = '<div class="cm-doc-shared">Также у: ' + others.map(function (p) {
        return '<span class="mono">' + escHtml(p.code) + '</span> ' + escHtml(p.designation || p.name || '');
      }).join('; ') + '</div>';
    }
    return '<li class="cm-doc-item">' +
      '<div class="cm-doc-file">' + escHtml(doc.file) + '</div>' +
      '<div class="cm-doc-path mono">' + escHtml(doc.path) + '</div>' +
      shared +
      '</li>';
  }

  async function openDocs(code) {
    var el = ensureDocsModal();
    var body = document.getElementById('cmDocsBody');
    el.style.display = 'flex';
    document.getElementById('cmDocsTitle').textContent = 'Документы: ' + code;
    body.innerHTML = emptyBlock('Загрузка…');
    var data;
    try {
      data = await api('/api/product-docs?partCode=' + encodeURIComponent(code));
    } catch (e) {
      body.innerHTML = emptyBlock(e.message);
      return;
    }
    if (!data || !data.groups || data.groups.length === 0) {
      body.innerHTML = emptyBlock('Документы не привязаны');
      return;
    }
    var title = data.part ? (data.part.designation || data.part.name || data.part.code) : code;
    var html = '<p class="muted">' + escHtml(title) +
      (data.part && data.part.name && data.part.designation ? ' — ' + escHtml(data.part.name) : '') +
      ' · всего ' + data.total + '</p>';
    html += data.groups.map(function (group) {
      return '<h4 class="cm-doc-group">' + escHtml(group.type) + ' <span class="muted">(' + group.docs.length + ')</span></h4>' +
        '<ul class="cm-doc-list">' + group.docs.map(function (doc) {
          var item = doc;
          item.partCode = data.partCode;
          return docItemHtml(item);
        }).join('') + '</ul>';
    }).join('');
    body.innerHTML = html;
  }

  function showModal() { modal.style.display = 'flex'; }
  function closeModal() {
    nextCodeRequest++;
    if (modal) modal.style.display = 'none';
  }

  function onActionClick(e) {
    var btn = e.target.closest('a[data-action]');
    if (!btn) return;
    var code = btn.getAttribute('data-code');
    if (!code) return;
    var action = btn.getAttribute('data-action');
    if (action === 'edit') openEdit(code);
    else if (action === 'docs') openDocs(code);
    else if (action === 'delete-group') removeGroup(code);
    else remove(code);
  }

  function mount(container, config) {
    currentRole = (typeof getCurrentUser === 'function' && getCurrentUser() || {}).role || '';
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
    treeLoaded = true;
    if (!host) return;
    loadDocCounts().then(function () { renderTree(); });
    renderTree();
    applyQuery();
    var parent = document.getElementById('cmParent');
    if (parent) populateParentSelect(parent.value);
  }

  window.CatalogManager = { mount: mount, setTree: setTree };
})();