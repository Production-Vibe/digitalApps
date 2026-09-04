// ============================================================================
// ShiftUI.gs — Веб-интерфейс начальника смены
// Нач. смены видит запуски («К запуску»), активных операторов, раздаёт
// задания (WorkOrders) с разбивкой по количеству и ставит статус.
// ============================================================================

// === Сервер: запуски + операторы ===

// Запуски, доступные для выдачи (статус «К запуску» либо уже частично
// выданные), объединённые со справочником Catalog (типы обработки, приоритет).
function getShiftWorkload() {
  const launches = getLaunchRecords();
  const catalog = getCatalogForMaster();
  const catByCode = {};
  catalog.forEach(function(c) { catByCode[String(c.code)] = c; });
  
  const rows = [];
  launches.forEach(function(l) {
    if (l.status === 'Готово') return;
    const cat = catByCode[String(l.itemCode)] || {};
    rows.push({
      id: l.id,
      itemCode: l.itemCode,
      itemName: l.itemName,
      unit: l.unit,
      qty: l.qty,
      paNumbers: l.paNumbers,
      status: l.status,
      createdBy: l.createdBy,
      createdAt: l.createdAt,
      priority: cat.priority || '',
      cutting: cat.cutting || '', thermo: cat.thermo || '', plasma: cat.plasma || '',
      turning: cat.turning || '', milling: cat.milling || '', drilling: cat.drilling || '',
      metalwork: cat.metalwork || '', bending: cat.bending || '', coating: cat.coating || ''
    });
  });
  return rows;
}

// Список операторов, открывших смену (активны) + их станки
function getShiftActiveOperators() {
  return getActiveOperators(); // [{ name, machine, shiftId }]
}

// Справочник станков
function getShiftMachines() {
  return getMachines();
}

// Сколько уже выдано по запуску (сумма кол-ва выданных WorkOrders)
function getIssuedWorkOrderQty() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('WorkOrders');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const h = {};
  headers.forEach(function(name, idx) { h[name.toLowerCase()] = idx; });
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][h['код детали']] != null ? data[i][h['код детали']] : data[i][1]);
    const st = String(data[i][h['статус']] !== undefined ? data[i][h['статус']] : data[i][11]);
    if (st === 'cancelled' || st === 'rejected') continue;
    const qty = Number(data[i][h['кол-во']] != null ? data[i][h['кол-во']] : data[i][10]) || 0;
    if (!map[code]) map[code] = 0;
    map[code] += qty;
  }
  return map;
}

// Выдача наряда. Принимает произвольную часть количества.
// launchId — запуск, operatorName и machine — кому/на какой станок,
// quantity — выдаваемое количество.
function issueWorkOrder(launchId, operatorName, machine, quantity) {
  if (!launchId) return { error: 'Не указан запуск' };
  if (!operatorName || !machine) return { error: 'Укажите оператора и станок' };
  quantity = Number(quantity) || 0;
  if (quantity <= 0) return { error: 'Укажите количество больше 0' };
  
  // Ищем запуск
  const launches = getLaunchRecords();
  let launch = null;
  launches.forEach(function(l) { if (String(l.id) === String(launchId)) launch = l; });
  if (!launch) return { error: 'Запуск не найден' };
  
  // Считаем уже выданное
  const issuedMap = getIssuedWorkOrderQty();
  const issued = issuedMap[String(launch.itemCode)] || 0;
  const remaining = launch.qty - issued;
  if (quantity > remaining) {
    return { error: 'Нельзя выдать ' + quantity + ' — осталось только ' + remaining + ' (уже выдано ' + issued + ' из ' + launch.qty + ')' };
  }
  
  // Создаём WorkOrder
  const orderNumber = 'Н-' + Utilities.formatDate(new Date(), 'GMT+3', 'yyMMdd-HHmmss');
  let woSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('WorkOrders');
  if (!woSheet) {
    woSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('WorkOrders');
    woSheet.getRange(1, 1, 1, 12).setValues([[
      'Номер', 'Код детали', 'Наименование', 'Обозначение', 'Узел',
      'Программа', 'Заказчик', 'СП', 'Оператор', 'Станок', 'Кол-во', 'Статус'
    ]]);
    woSheet.setFrozenRows(1);
  }
  
  const catByCode = {};
  getCatalogForMaster().forEach(function(c) { catByCode[String(c.code)] = c; });
  const cat = catByCode[String(launch.itemCode)] || {};
  
  woSheet.appendRow([
    orderNumber,
    launch.itemCode,
    launch.itemName,
    cat.designation || '',
    launch.unit,
    '', // Программа не хранится в Launches
    '', // Заказчик
    '', // СП
    operatorName,
    machine,
    quantity,
    'created'
  ]);
  
  // В очередь печати
  createPrintJob(
    orderNumber,
    launch.itemCode,
    launch.itemName,
    cat.designation || '',
    launch.unit,
    '', '', '',
    operatorName,
    machine,
    quantity
  );
  
  // Обновляем статус запуска: стал ли он выдан полностью
  const nowIssued = issued + quantity;
  const newStatus = (nowIssued >= launch.qty) ? 'Выдано' : launch.status;
  if (newStatus !== launch.status) {
    setLaunchStatus(launch.id, newStatus);
  }
  
  return { status: 'ok', orderNumber: orderNumber };
}

// === HTML-страницы (полная страница, как у мастера) ===

function renderShiftAppPage(name) {
  const safeName = name || '';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Начальник смены — ЦифровойНаряд</title>
  ${shiftStyles()}
</head>
<body>
  ${shiftPageFragment(safeName)}
</body>
</html>
  `;
}

function shiftStyles() {
  return `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #f1f5f9; }
    .header { background: #0f172a; color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
    .header .title { font-weight: 700; font-size: 16px; }
    .header .user { font-size: 12px; color: #cbd5e1; }
    .header a.logout { color: #fca5a5; text-decoration: none; font-size: 13px; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.08); }
    .wrap { display: flex; gap: 16px; align-items: flex-start; padding: 16px; }
    .col { flex: 1; min-width: 0; }
    .card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .card h3 { font-size: 15px; color: #0f172a; margin-bottom: 12px; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .filters select, .filters input { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: #fff; }
    .filters button { padding: 8px 12px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; background: #0f172a; color: #fff; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px; background: #f8fafc; color: #475569; font-weight: 600; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr.clickable { cursor: pointer; }
    tr.clickable:hover { background: #f8fafc; }
    .status-chip { padding: 2px 8px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
    .st-deprecated { background: #e2e8f0; color: #475569; }
    .st-issued { background: #dbeafe; color: #1d4ed8; }
    .badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; }
    .op-tag { display: inline-block; margin: 2px 4px 2px 0; padding: 1px 6px; border-radius: 6px; background: #eef2ff; color: #4338ca; font-size: 11px; }
    .op-list { display: flex; flex-wrap: wrap; gap: 4px; }
    .operator-pill { display: inline-block; padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 13px; margin-bottom: 6px; }
    .operator-pill b { color: #0f172a; }
    .operator-pill span { color: #64748b; }
    .btn { padding: 8px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; background: #0f172a; color: #fff; }
    .btn-secondary { background: #e2e8f0; color: #334155; }
    .btn-primary { background: #22c55e; color: #fff; }
    .issue-box { margin-top: 8px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; }
    .issue-box select, .issue-box input { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 8px; font-size: 13px; }
    .issue-box label { font-size: 12px; color: #64748b; display: block; margin-bottom: 3px; }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fff; padding: 12px 20px; border-radius: 8px; z-index: 9999; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .empty { text-align: center; color: #94a3b8; padding: 32px; font-size: 14px; }
    .muted { color: #94a3b8; }
    .left-qty { color: #b45309; font-weight: 600; }
  </style>
  `;
}

function shiftPageFragment(safeName) {
  return `
  <div class="header">
    <div>
      <div class="title">🎛️ Цех — начальник смены</div>
      <div class="user">👤 ${safeName}</div>
    </div>
    <a href="?page=login" onclick="event.preventDefault();try{localStorage.removeItem('nd_login');localStorage.removeItem('nd_password');}catch(e){}setTimeout(function(){window.top.location.href='${appBaseUrl()}'+'?page=login';},80);" class="logout">Выйти</a>
  </div>

  <div class="wrap">
    <div class="col">
      <!-- ВСЕго объём -->
      <div class="card">
        <h3>🏭 Запуски к выдаче</h3>
        <div class="filters">
          <select id="fUnit" onchange="renderRows()"><option value="">Все узлы</option></select>
          <select id="fOp" onchange="renderRows()">
            <option value="">Все типы обработки</option>
            <option value="cutting">Резка</option>
            <option value="thermo">Термообработка</option>
            <option value="plasma">Плазма</option>
            <option value="turning">Токарная</option>
            <option value="milling">Фрезерная</option>
            <option value="drilling">Сверлильная</option>
            <option value="metalwork">Слесарная</option>
            <option value="bending">Гибка</option>
            <option value="coating">Покрытие</option>
          </select>
          <input id="fSearch" placeholder="🔍 Код или наименование" oninput="renderRows()">
          <button onclick="loadData()">Обновить</button>
        </div>
        <div id="launchTable"><div class="empty">⏳ Загрузка...</div></div>
      </div>
    </div>

    <div class="col" style="flex: 0 0 300px;">
      <div class="card">
        <h3>👥 Активные операторы</h3>
        <div id="activeOps"><div class="empty">—</div></div>
        <button class="btn-secondary" onclick="loadData()" style="margin-top:8px;width:100%;">🔄 Обновить операторов</button>
      </div>
    </div>
  </div>

  <!-- Блок выдачи -->
  <div id="issueOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:500;align-items:center;justify-content:center;"></div>
  <div id="issueModal" style="display:none;position:fixed;inset:0;z-index:501;align-items:center;justify-content:center;pointer-events:none;">
    <div class="card" style="max-width:440px;width:90%;pointer-events:auto;">
      <h3>📦 Выдача наряда</h3>
      <div id="issueInfo" style="font-size:13px;color:#334155;margin-bottom:10px;"></div>
      <div class="issue-box">
        <label>Оператор</label>
        <select id="issueOperator"></select>
        <label>Станок</label>
        <select id="issueMachine"></select>
        <label>Количество</label>
        <input type="number" id="issueQty" min="0">
        <div id="issueRemain" class="muted" style="font-size:12px;margin-bottom:8px;"></div>
        <button class="btn btn-primary" style="width:100%;" onclick="confirmIssue()">✅ Выдать</button>
        <button class="btn btn-secondary" style="width:100%;margin-top:6px;" onclick="closeIssue()">Отмена</button>
      </div>
    </div>
  </div>

  <script>
    let rows = [];
    let issuedMap = {};
    let activeOperators = [];
    let machines = [];
    let selectedLaunch = null;

    function showToast(msg) {
      var t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function(){ t.remove(); }, 2600);
    }

    function isYes(v) { return v === '+' || v === '1' || String(v).toUpperCase() === 'ДА'; }

    function loadData() {
      loadLaunches();
      loadOperators();
      loadMachines();
    }

    function loadLaunches() {
      const wrap = document.getElementById('launchTable');
      wrap.innerHTML = '<div class="empty">⏳ Загрузка...</div>';
      google.script.run
        .withSuccessHandler(function(data) {
          rows = data || [];
          issuedMap = (issuedMap && Object.keys(issuedMap).length) ? issuedMap : fetchIssued();
          fillUnitFilter();
          renderRows();
        })
        .withFailureHandler(function(e) {
          wrap.innerHTML = '<div class="empty">❌ Ошибка: ' + (e.message || e) + '</div>';
        })
        .getShiftWorkload();
    }

    function fetchIssued() {
      google.script.run
        .withSuccessHandler(function(m) { issuedMap = m || {}; renderRows(); })
        .getIssuedWorkOrderQty();
      return {};
    }

    function loadOperators() {
      const el = document.getElementById('activeOps');
      google.script.run
        .withSuccessHandler(function(data) {
          activeOperators = data || [];
          if (activeOperators.length === 0) {
            el.innerHTML = '<div class="empty">Нет операторов со открытой сменой</div>';
          } else {
            el.innerHTML = activeOperators.map(function(op) {
              return '<div class="operator-pill"><b>' + op.name + '</b> — <span>' + op.machine + '</span></div>';
            }).join('');
          }
        })
        .withFailureHandler(function() { el.innerHTML = '<div class="empty">Ошибка</div>'; });
    }

    function loadMachines() {
      google.script.run
        .withSuccessHandler(function(data) { machines = data || []; })
        .getShiftMachines();
    }

    function fillUnitFilter() {
      const sel = document.getElementById('fUnit');
      const cur = sel.value;
      const units = [];
      rows.forEach(function(r) { if (r.unit && units.indexOf(r.unit) === -1) units.push(r.unit); });
      units.sort();
      sel.innerHTML = '<option value="">Все узлы</option>' + units.map(function(u){ return '<option value="' + u + '"' + (u===cur?' selected':'') + '>' + u + '</option>'; }).join('');
    }

    function opLabel(v) {
      const map = { cutting:'Резка', thermo:'Термообработка', plasma:'Плазма', turning:'Токарная', milling:'Фрезерная', drilling:'Сверлильная', metalwork:'Слесарная', bending:'Гибка', coating:'Покрытие' };
      return map[v] || v;
    }

    function renderRows() {
      const u = document.getElementById('fUnit').value;
      const op = document.getElementById('fOp').value;
      const q = document.getElementById('fSearch').value.trim().toLowerCase();
      let list = rows.filter(function(r) {
        if (u && r.unit !== u) return false;
        if (op && !isYes(r[op])) return false;
        if (q && String(r.itemCode).toLowerCase().indexOf(q) === -1 && String(r.itemName).toLowerCase().indexOf(q) === -1) return false;
        return true;
      });

      const wrap = document.getElementById('launchTable');
      if (list.length === 0) {
        wrap.innerHTML = '<div class="empty">Нет запусков для выдачи</div>';
        return;
      }

      const opKeys = ['cutting','thermo','plasma','turning','milling','drilling','metalwork','bending','coating'];

      let h = '<table><thead><tr><th>Код</th><th>Наименование</th><th>Узел</th><th>ПА</th>';
      h += '<th>Осталось</th><th>Типы</th><th></th></tr></thead><tbody>';
      list.forEach(function(r) {
        const issued = issuedMap[String(r.itemCode)] || 0;
        const remain = Math.max(r.qty - issued, 0);
        const ops = opKeys.filter(function(k){ return isYes(r[k]); }).map(opLabel);
        const opsHtml = ops.length ? ops.map(function(o){ return '<span class="op-tag">' + o + '</span>'; }).join('') : '<span class="muted">—</span>';
        h += '<tr class="clickable" data-id="' + r.id + '" onclick="openIssue(this)">';
        h += '<td>' + r.itemCode + '</td><td>' + r.itemName + '</td><td>' + r.unit + '</td><td>' + r.paNumbers + '</td>';
        h += '<td class="left-qty">' + remain + ' / ' + r.qty + '</td>';
        h += '<td><div class="op-list">' + opsHtml + '</div></td>';
        h += '<td><button class="btn" onclick="event.stopPropagation();openIssue(this)">Выдать</button></td>';
        h += '</tr>';
      });
      h += '</tbody></table>';
      wrap.innerHTML = h;
    }

    function openIssue(el) {
      const id = el.getAttribute('data-id');
      selectedLaunch = rows.filter(function(r){ return r.id === id; })[0];
      if (!selectedLaunch) return;
      const issued = issuedMap[String(selectedLaunch.itemCode)] || 0;
      const remain = Math.max(selectedLaunch.qty - issued, 0);
      document.getElementById('issueInfo').textContent = selectedLaunch.itemCode + ' — ' + selectedLaunch.itemName + ' (ПА ' + selectedLaunch.paNumbers + ')';
      
      const opSel = document.getElementById('issueOperator');
      opSel.innerHTML = '';
      if (activeOperators.length === 0) {
        opSel.innerHTML = '<option value="">Нет активных операторов</option>';
      } else {
        activeOperators.forEach(function(op) {
          opSel.innerHTML += '<option value="' + op.name + '">' + op.name + ' (' + op.machine + ')</option>';
        });
      }
      
      const mcSel = document.getElementById('issueMachine');
      mcSel.innerHTML = '<option value="">— выберите станок —</option>';
      machines.forEach(function(m){ mcSel.innerHTML += '<option value="' + m + '">' + m + '</option>'; });
      if (activeOperators.length === 1) mcSel.value = activeOperators[0].machine;
      
      document.getElementById('issueQty').value = remain;
      document.getElementById('issueRemain').textContent = 'Осталось невыданного: ' + remain + ' (всего ' + selectedLaunch.qty + ')';
      document.getElementById('issueModal').style.display = 'flex';
      document.getElementById('issueOverlay').style.display = 'flex';
    }

    function closeIssue() {
      document.getElementById('issueModal').style.display = 'none';
      document.getElementById('issueOverlay').style.display = 'none';
      selectedLaunch = null;
    }

    function confirmIssue() {
      if (!selectedLaunch) return;
      const operatorName = document.getElementById('issueOperator').value;
      const machine = document.getElementById('issueMachine').value;
      const qty = parseInt(document.getElementById('issueQty').value, 10);
      if (!operatorName || !machine) { showToast('❌ Выберите оператора и станок'); return; }
      if (!qty || qty <= 0) { showToast('❌ Укажите количество'); return; }
      google.script.run
        .withSuccessHandler(function(r) {
          if (r && r.error) { showToast('❌ ' + r.error); return; }
          showToast('✅ Наряд ' + r.orderNumber + ' выдан: ' + qty + ' шт → ' + operatorName + ' (' + machine + ')');
          closeIssue();
          loadLaunches();
        })
        .withFailureHandler(function(e) { showToast('❌ ' + (e.message || e)); })
        .issueWorkOrder(selectedLaunch.id, operatorName, machine, qty);
    }

    // Инициализация
    loadData();
  </script>
  `;
}