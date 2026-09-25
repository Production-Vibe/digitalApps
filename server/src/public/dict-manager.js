(function () {
  var host = null;
  var typeEl = null;
  var newValueEl = null;
  var addBtn = null;
  var tableEl = null;
  var renderRequest = 0;

  var DICT_TYPES = [
    { value: 'blankType', label: 'Тип заготовки' },
    { value: 'material', label: 'Материал' },
    { value: 'materialGrade', label: 'Марка материала' },
    { value: 'blankSize', label: 'Размер заготовки' },
    { value: 'priority', label: 'Приоритет' }
  ];

  function tableHtml(items) {
    var rows = items && items.length ? items.map(function (item) {
      var id = escHtml(item.id);
      var synonyms = Array.isArray(item.synonyms) ? item.synonyms.join(', ') : '';
      var status = item.isActive
        ? '<span class="badge badge--ok">активно</span>'
        : '<span class="badge badge--error">неактивно</span>';
      var deactivate = item.isActive
        ? '<button type="button" class="btn btn--sm" data-action="deactivate" data-id="' + id + '" data-value="' + escHtml(item.value) + '">Деактивировать</button>'
        : '';

      return '<tr class="dict-row' + (item.isActive ? '' : ' row-inactive') + '">' +
        '<td>' + escHtml(item.value) + '</td>' +
        '<td><input type="text" class="input" data-syn="' + id + '" value="' + escHtml(synonyms) + '" placeholder="синоним1, синоним2" autocomplete="off"></td>' +
        '<td><input type="number" class="input" data-sort="' + id + '" value="' + escHtml(item.sort) + '" step="1"></td>' +
        '<td>' + status + '</td>' +
        '<td>' +
          '<button type="button" class="btn btn--sm btn--primary" data-action="save" data-id="' + id + '">Сохранить</button>' +
          (deactivate ? ' ' + deactivate : '') +
        '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5">' + emptyBlock('Значения отсутствуют') + '</td></tr>';

    return '<div class="tablewrap"><table class="table"><thead><tr>' +
      '<th>Значение</th><th>Синонимы</th><th>Сорт.</th><th>Статус</th><th>Действия</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  async function render() {
    if (!typeEl || !tableEl) return;
    var type = typeEl.value;
    var request = ++renderRequest;
    tableEl.innerHTML = emptyBlock('Загрузка...');
    try {
      var items = await api('/api/dictionaries/' + encodeURIComponent(type) + '?all=1');
      if (request !== renderRequest || !typeEl || typeEl.value !== type) return;
      tableEl.innerHTML = tableHtml(items || []);
    } catch (e) {
      if (request !== renderRequest || !typeEl || typeEl.value !== type) return;
      tableEl.innerHTML = emptyBlock('Не удалось загрузить значения');
      showToast(e && e.message ? e.message : 'Ошибка запроса', true);
    }
  }

  async function saveValue(id) {
    var synEl = document.querySelector('[data-syn="' + id + '"]');
    var sortEl = document.querySelector('[data-sort="' + id + '"]');
    if (!synEl || !sortEl) return;
    var sort = Number(sortEl.value);
    if (!Number.isFinite(sort)) {
      showToast('Сортировка должна быть числом', true);
      return;
    }

    var synonyms = synEl.value.split(',').map(function (value) {
      return value.trim();
    }).filter(Boolean);

    try {
      await api('/api/dictionaries/' + encodeURIComponent(typeEl.value) + '/' + encodeURIComponent(id), {
        method: 'PUT',
        body: { synonyms: synonyms, sort: sort }
      });
      await render();
      showToast('Сохранено');
    } catch (e) {
      showToast(e && e.message ? e.message : 'Ошибка запроса', true);
    }
  }

  async function deactivateValue(id, value) {
    if (!confirm('Деактивировать значение «' + value + '»?')) return;
    try {
      await api('/api/dictionaries/' + encodeURIComponent(typeEl.value) + '/' + encodeURIComponent(id) + '/deactivate', {
        method: 'POST'
      });
      await render();
      showToast('Значение деактивировано');
    } catch (e) {
      showToast(e && e.message ? e.message : 'Ошибка запроса', true);
    }
  }

  async function addValue() {
    if (!typeEl || !newValueEl) return;
    var value = newValueEl.value.trim().replace(/\s+/g, ' ');
    if (!value) {
      showToast('Введите значение', true);
      newValueEl.focus();
      return;
    }

    newValueEl.disabled = true;
    addBtn.disabled = true;
    try {
      var result = await api('/api/dictionaries/' + encodeURIComponent(typeEl.value), {
        method: 'POST',
        body: { value: value }
      });
      newValueEl.value = '';
      await render();
      showToast(result && result.reactivated ? 'Значение активировано' : 'Значение добавлено');
    } catch (e) {
      var message = e && e.message ? e.message : 'Ошибка запроса';
      showToast(message.indexOf('уже есть') !== -1 ? 'Значение уже есть' : message, true);
    } finally {
      newValueEl.disabled = false;
      addBtn.disabled = false;
      newValueEl.focus();
    }
  }

  function mount(container) {
    host = container;
    if (!host) return;

    var panel = document.createElement('div');
    panel.id = 'dictPanel';
    panel.className = 'panel';
    panel.innerHTML =
      '<h3>Значения справочника</h3>' +
      '<div class="dict-toolbar">' +
        '<label for="dictTypeSel">Тип</label>' +
        '<select id="dictTypeSel" class="input">' +
          DICT_TYPES.map(function (item) {
            return '<option value="' + item.value + '">' + escHtml(item.label) + '</option>';
          }).join('') +
        '</select>' +
        '<div class="dict-add">' +
          '<input type="text" id="dictNewValue" class="input" placeholder="Новое значение" autocomplete="off">' +
          '<button type="button" id="dictAddBtn" class="btn btn--primary">+ Значение</button>' +
        '</div>' +
      '</div>' +
      '<div id="dictTable"></div>';

    host.innerHTML = '';
    host.appendChild(panel);
    typeEl = document.getElementById('dictTypeSel');
    newValueEl = document.getElementById('dictNewValue');
    addBtn = document.getElementById('dictAddBtn');
    tableEl = document.getElementById('dictTable');

    typeEl.addEventListener('change', render);
    addBtn.addEventListener('click', addValue);
    newValueEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addValue();
    });
    tableEl.addEventListener('click', function (e) {
      var button = e.target.closest('button[data-action]');
      if (!button) return;
      var id = button.getAttribute('data-id');
      if (button.getAttribute('data-action') === 'save') saveValue(id);
      else deactivateValue(id, button.getAttribute('data-value') || '');
    });

    render();
  }

  function reload() {
    if (!host) return;
    return render();
  }

  window.DictManager = { mount: mount, reload: reload };
})();
