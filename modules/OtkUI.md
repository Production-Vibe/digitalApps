// === ОТК — ПРИЁМКА / БРАК / ЗАКРЫТИЕ НАРЯДОВ ===
// Полная страница ?page=otk-app. Работает с листом «Наряды» (что заполняет
// оператор). Наряды живут в статусах:
//   created → in_progress → waiting_otk → closed
//   waiting_otk ↴ rework (Доработка/Возврат) → оператор правит → waiting_otk …
// Все операции ОТК требуют isRole(name, 'otk').

// === SERVER: списОК нарядов для ОТК ===
function getOtkQueue() {
  const all = getNaryady().map(naryadRowToObject);
  const waiting = [];
  const rework = [];
  const inWork = [];
  all.forEach(function(n) {
    if (n.status === 'closed') return;
    const agg = otkAggregate(n.id);
    const item = {
      id: n.id,
      detail_name: n.detail_name,
      detail_code: n.detail_code,
      quantity: n.quantity,
      status: n.status,
      rework_reason: n.rework_reason || '',
      transitionCount: agg.transitionCount,
      checkedCount: agg.checkedCount,
      totalAccepted: agg.totalAccepted,
      totalDefect: agg.totalDefect
    };
    if (n.status === 'waiting_otk') waiting.push(item);
    else if (n.status === 'rework') rework.push(item);
    else inWork.push(item);
  });
  return { waiting: waiting, rework: rework, inWork: inWork };
}

function otkAggregate(naryadId) {
  let transitionCount = 0;
  let checkedCount = 0;
  let totalAccepted = 0;
  let totalDefect = 0;
  getTransitions(naryadId).forEach(function(t) {
    const obj = transitionRowToObject(t);
    transitionCount++;
    if (obj.status === 'checked') checkedCount++;
    totalAccepted += Number(obj.accepted_qty) || 0;
    totalDefect += Number(obj.defect_qty) || 0;
  });
  return {
    transitionCount: transitionCount,
    checkedCount: checkedCount,
    totalAccepted: totalAccepted,
    totalDefect: totalDefect
  };
}

// === SERVER: карточка наряда ===
function getOtkNaryad(naryadId) {
  return getNaryadForOperator(naryadId);
}

// === SERVER: отметить переход проверенным ===
function otkCheckTransition(data) {
  data = data || {};
  if (!isRole(data.name, 'otk')) {
    return { error: 'Отказано: проверять переходы может только ОТК' };
  }
  return checkTransition(data);
}

// === SERVER: вернуть наряд на доработку ===
function otkReturnToRework(data) {
  data = data || {};
  if (!data.closed_by) return { error: 'Не указано, кто возвращает наряд (closed_by)' };
  if (!isRole(data.closed_by, 'otk')) {
    return { error: 'Отказано: возвращать на доработку может только ОТК' };
  }
  if (!data.naryad_number) return { error: 'Не указан номер наряда' };
  setNaryadStatus(data.naryad_number, 'rework');
  setNaryadReworkReason(data.naryad_number, data.defect_reason || data.closing_note || '');
  return { status: 'rework' };
}

function setNaryadReworkReason(naryadId, reason) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return;
  const headers = sheetHeaders(sheet);
  const cId = colIndexByName(headers, 'Номер наряда');
  const cReason = colIndexByName(headers, 'Причина доработки');
  if (cId < 0 || cReason < 0) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][cId] === naryadId) {
      sheet.getRange(i + 1, cReason + 1).setValue(reason);
      break;
    }
  }
}

// === SERVER: закрыть наряд ===
function otkClose(data) {
  return closeNaryad(data);
}

// === PAGE: полная страница ОТК ===
function renderOtkAppPage(name) {
  const safeName = name || '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ОТК — ЦифровойНаряд</title>
  ${otkStyles()}
</head>
${otkPageFragment(safeName)}
</html>`;
}

function otkPageFragment(name) {
  const safeName = name || '';
  return `
<body>
  <div class="header">
    <div class="title">🛡️ ОТК — приёмка нарядов</div>
    <div class="right">
      <span class="user">👤 ${escapeHtml(safeName)}</span>
      <a href="?page=login" onclick="event.preventDefault();try{localStorage.removeItem('nd_login');localStorage.removeItem('nd_password');}catch(e){}setTimeout(function(){window.top.location.href='${appBaseUrl()}'+'?page=login';},80);" class="logout">Выйти</a>
    </div>
  </div>

  <div class="wrap">
    <div id="queueView" class="col">
      <div class="filters">
        <button onclick="switchTab('waiting')" id="tabWaiting" class="btn active">Ждут ОТК</button>
        <button onclick="switchTab('rework')" id="tabRework" class="btn">Доработка</button>
        <button onclick="switchTab('inWork')" id="tabInWork" class="btn">В работе</button>
        <button onclick="loadQueue()" class="btn-secondary">Обновить</button>
      </div>
      <div id="queueTable"></div>
    </div>

    <div id="naryadView" class="col" style="display:none;">
      <button onclick="showQueue()" class="btn-secondary back">← К списку нарядов</button>
      <div id="naryadCard"></div>
    </div>
  </div>

  <div id="toast" class="toast" style="display:none;"></div>

<script>
(function(){
  var currentTab = 'waiting';
  var allQueue = { waiting: [], rework: [], inWork: [] };

  window.showToast = function(msg, isErr) {
    var el = document.getElementById('toast');
    el.style.background = isErr ? '#dc2626' : '#0f172a';
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function(){ el.style.display = 'none'; }, 2600);
  };

  window.switchTab = function(tab) {
    currentTab = tab;
    var map = { waiting: 'tabWaiting', rework: 'tabRework', inWork: 'tabInWork' };
    ['tabWaiting','tabRework','tabInWork'].forEach(function(id){
      document.getElementById(id).className = 'btn' + (id === map[tab] ? ' active' : '');
    });
    renderQueue();
  };

  window.loadQueue = function() {
    google.script.run
      .withSuccessHandler(function(res){
        allQueue = res || { waiting: [], rework: [], inWork: [] };
        renderQueue();
      })
      .withFailureHandler(function(err){ showToast('Ошибка загрузки: ' + err, true); })
      .getOtkQueue();
  };

  function statusChip(s) {
    var map = {
      'waiting_otk': 'Ждёт ОТК',
      'rework': 'Доработка',
      'in_progress': 'В работе',
      'created': 'Создан',
      'closed': 'Закрыт'
    };
    var cls = {
      'waiting_otk': 'st-wait',
      'rework': 'st-rework',
      'in_progress': 'st-work',
      'created': 'st-created',
      'closed': 'st-closed'
    };
    return '<span class="status-chip ' + (cls[s] || '') + '">' + (map[s] || s) + '</span>';
  }

  window.renderQueue = function() {
    var list = allQueue[currentTab] || [];
    var titles = { waiting: 'Ждут ОТК', rework: 'Доработка', inWork: 'В работе' };
    if (!list.length) {
      document.getElementById('queueTable').innerHTML =
        '<div class="card empty">В категории «' + titles[currentTab] + '» нет нарядов</div>';
      return;
    }
    var html = '<div class="card"><h3>' + titles[currentTab] + ' (' + list.length + ')</h3>' +
      '<table><tr><th>Наряд</th><th>Деталь</th><th>Кол-во</th><th>Статус</th><th>Переходы</th><th>Принято/Брак</th><th></th></tr>';
    list.forEach(function(n){
      var note = (n.rework_reason ? '<div class="rework-note">Причина: ' + escapeHtml(n.rework_reason) + '</div>' : '');
      html += '<tr>' +
        '<td><b>' + escapeHtml(n.id) + '</b></td>' +
        '<td>' + escapeHtml(n.detail_name) + '<div class="muted">' + escapeHtml(n.detail_code) + '</div></td>' +
        '<td>' + n.quantity + '</td>' +
        '<td>' + statusChip(n.status) + (n.status === 'rework' ? note : '') + '</td>' +
        '<td>' + n.checkedCount + '/' + n.transitionCount + '</td>' +
        '<td>' + (n.totalAccepted || 0) + ' / ' + (n.totalDefect || 0) + '</td>' +
        '<td><button class="btn" onclick="openNaryad(&quot;' + escapeAttr(n.id) + '&quot;)">Открыть</button></td>' +
      '</tr>';
    });
    html += '</table></div>';
    document.getElementById('queueTable').innerHTML = html;
  };

  window.openNaryad = function(id) {
    document.getElementById('queueView').style.display = 'none';
    document.getElementById('naryadView').style.display = 'block';
    document.getElementById('naryadCard').innerHTML =
      '<div class="card" style="text-align:center;color:#94a3b8;">Загрузка наряда…</div>';
    google.script.run
      .withSuccessHandler(renderNaryadCard)
      .withFailureHandler(function(err){ showToast('Ошибка: ' + err, true); })
      .getOtkNaryad(id);
  };

  window.showQueue = function() {
    document.getElementById('naryadView').style.display = 'none';
    document.getElementById('queueView').style.display = 'block';
    loadQueue();
  };

  function renderNaryadCard(data) {
    var cont = document.getElementById('naryadCard');
    if (!data || data.error) {
      cont.innerHTML = '<div class="card empty">' + (data ? escapeHtml(data.error) : 'Наряд не найден') + '</div>';
      return;
    }
    var n = data.naryad || {};
    var trs = data.transitions || [];

    var rows = '';
    trs.forEach(function(t, i){
      var checked = t.status === 'checked';
      var chip = checked
        ? '<span class="status-chip st-checked">Проверен</span>'
        : '<span class="status-chip st-done">' + (t.status === 'completed' ? 'Готов' : (t.status || '')) + '</span>';
      rows += '<tr>' +
        '<td>' + escapeHtml(t.tp) + '</td>' +
        '<td>' + escapeHtml(t.description) + '</td>' +
        '<td>' + escapeHtml(t.operator) + '</td>' +
        '<td>' + (t.quantity || 0) + '</td>' +
        '<td>' + chip + '</td>' +
        '<td>' +
          '<input type="number" min="0" id="acc_' + i + '" value="' + (t.accepted_qty || 0) + '" style="width:70px;">' +
          '<input type="number" min="0" id="def_' + i + '" value="' + (t.defect_qty || 0) + '" style="width:70px;margin-left:4px;">' +
        '</td>' +
        '<td><button class="btn" onclick="checkOne(&quot;' + escapeAttr(t.naryad_id) + '&quot;,&quot;' + escapeAttr(t.tp) + '&quot;,' + i + ')">Проверить</button></td>' +
      '</tr>';
    });

    var decision = '';
    if (n.status !== 'closed') {
      decision =
        '<div class="decision-box">' +
          '<h3>Решение ОТК</h3>' +
          '<label>Итого принято / брак</label>' +
          '<div class="row2">' +
            '<input type="number" min="0" id="tot_acc" value="' + (n.quantity || 0) + '" placeholder="Принято всего">' +
            '<input type="number" min="0" id="tot_def" value="0" placeholder="Брак всего">' +
          '</div>' +
          '<label>Причина брака / замечание</label>' +
          '<textarea id="def_reason" rows="2" placeholder="Причина брака, отклонения, доработки…"></textarea>' +
          '<label>Комментарий (опционально)</label>' +
          '<textarea id="closing_note" rows="2" placeholder="Примечание ОТК"></textarea>' +
          '<div class="row2 actions">' +
            '<button class="btn btn-close" onclick="doClose(&quot;' + escapeAttr(n.id) + '&quot;)">Закрыть наряд</button>' +
            '<button class="btn btn-rework" onclick="doRework(&quot;' + escapeAttr(n.id) + '&quot;)">Вернуть на доработку</button>' +
          '</div>' +
        '</div>';
    }

    var closedInfo = '';
    if (data.closingInfo) {
      var ci = data.closingInfo;
      closedInfo = '<div class="decision-box closed-info"><h3>✅ Закрыт</h3>' +
        '<p>Принято: <b>' + (ci.total_accepted || 0) + '</b> &nbsp; Брак: <b>' + (ci.total_defect || 0) + '</b></p>' +
        (ci.defect_reason ? '<p>Причина: ' + escapeHtml(ci.defect_reason) + '</p>' : '') +
        (ci.closing_note ? '<p>Комментарий: ' + escapeHtml(ci.closing_note) + '</p>' : '') +
        '<p class="muted">Закрыл: ' + escapeHtml(ci.closed_by) + ', ' + (ci.timestamp || '') + '</p></div>';
    }

    cont.innerHTML =
      '<div class="card">' +
        '<h3>Наряд ' + escapeHtml(n.id) + '</h3>' +
        '<p><b>Деталь:</b> ' + escapeHtml(n.detail_name) +
        ' &nbsp;|&nbsp; <b>Код:</b> ' + escapeHtml(n.detail_code) +
        ' &nbsp;|&nbsp; <b>Кол-во:</b> ' + (n.quantity || 0) +
        ' &nbsp;|&nbsp; ' + statusChip(n.status) + '</p>' +
        (n.rework_reason ? '<p class="rework-note">Причина доработки: ' + escapeHtml(n.rework_reason) + '</p>' : '') +
      '</div>' +
      '<div class="card"><h3>Переходы</h3>' +
        (trs.length
          ? '<table><tr><th>№</th><th>Переход</th><th>Оператор</th><th>Кол-во</th><th>Статус</th><th>Принято/Брак</th><th></th></tr>' + rows + '</table>'
          : '<p class="empty">Переходов нет</p>') +
      '</div>' +
      decision +
      closedInfo;
  }

  window.checkOne = function(nid, tp, i) {
    var acc = document.getElementById('acc_' + i).value || 0;
    var def = document.getElementById('def_' + i).value || 0;
    if (Number(def) < 0 || Number(acc) < 0) { showToast('Значения не могут быть отрицательными', true); return; }
    google.script.run
      .withSuccessHandler(function(res){
        if (res && res.error) { showToast(res.error, true); return; }
        showToast('Переход ' + tp + ' проверен');
        loadQueue();
        openNaryad(nid);
      })
      .withFailureHandler(function(err){ showToast('Ошибка: ' + err, true); })
      .otkCheckTransition({ naryad_number: nid, tp: tp, accepted_qty: acc, defect_qty: def, name: window._ndName || '' });
  };

  window.doClose = function(nid) {
    var data = {
      naryad_number: nid,
      total_accepted: document.getElementById('tot_acc').value || 0,
      total_defect: document.getElementById('tot_def').value || 0,
      defect_reason: document.getElementById('def_reason').value || '',
      closing_note: document.getElementById('closing_note').value || '',
      closed_by: window._ndName || ''
    };
    if (!window.confirm('Закрыть наряд ' + nid + '?')) return;
    google.script.run
      .withSuccessHandler(function(res){
        if (res && res.error) { showToast(res.error, true); return; }
        showToast('Наряд ' + nid + ' закрыт');
        showQueue();
      })
      .withFailureHandler(function(err){ showToast('Ошибка: ' + err, true); })
      .otkClose(data);
  };

  window.doRework = function(nid) {
    var reason = document.getElementById('def_reason').value || '';
    if (!window.confirm('Вернуть наряд ' + nid + ' на доработку?')) return;
    google.script.run
      .withSuccessHandler(function(res){
        if (res && res.error) { showToast(res.error, true); return; }
        showToast('Наряд ' + nid + ' возвращён на доработку');
        showQueue();
      })
      .withFailureHandler(function(err){ showToast('Ошибка: ' + err, true); })
      .otkReturnToRework({ naryad_number: nid, closed_by: window._ndName || '', defect_reason: reason });
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  }

  window._ndName = '${escapeHtml(safeName)}';
  loadQueue();
})();
</script>
`;
}

function otkStyles() {
  return `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #f1f5f9; }
    .header { background: #0f172a; color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
    .header .title { font-weight: 700; font-size: 16px; }
    .header .right { display: flex; align-items: center; gap: 12px; }
    .header .user { font-size: 12px; color: #cbd5e1; }
    .header a.logout { color: #fca5a5; text-decoration: none; font-size: 13px; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.08); }
    .wrap { padding: 16px; }
    .col { max-width: 980px; margin: 0 auto; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .filters .btn, .filters .btn-secondary { padding: 8px 14px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
    .btn { padding: 8px 14px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; background: #0f172a; color: #fff; }
    .btn.active { background: #1d4ed8; }
    .btn-secondary { padding: 8px 14px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; background: #e2e8f0; color: #334155; }
    .btn-close { background: #16a34a; }
    .btn-rework { background: #d97706; }
    .back { margin-bottom: 12px; }
    .card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .card h3 { font-size: 15px; color: #0f172a; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px; background: #f8fafc; color: #475569; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
    td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .status-chip { padding: 2px 8px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
    .st-wait { background: #dbeafe; color: #1d4ed8; }
    .st-rework { background: #fef3c7; color: #b45309; }
    .st-work { background: #fee2e2; color: #b91c1c; }
    .st-created { background: #e2e8f0; color: #475569; }
    .st-closed { background: #dcfce7; color: #15803d; }
    .st-checked { background: #dcfce7; color: #15803d; }
    .st-done { background: #e2e8f0; color: #475569; }
    .muted { color: #94a3b8; font-size: 12px; }
    .empty { text-align: center; color: #94a3b8; padding: 24px; font-size: 14px; }
    .rework-note { color: #b45309; font-size: 12px; margin-top: 4px; }
    .decision-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .decision-box h3 { margin-bottom: 8px; }
    .decision-box label { font-size: 12px; color: #64748b; display: block; margin: 10px 0 4px; }
    .row2 { display: flex; gap: 10px; }
    .row2 input { flex: 1; }
    .decision-box input, .decision-box textarea { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
    .decision-box td input { width: 70px; }
    .actions { margin-top: 14px; }
    .actions .btn { flex: 1; }
    .closed-info { background: #f0fdf4; }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); color: #fff; padding: 12px 20px; border-radius: 8px; z-index: 9999; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
  </style>
`;
}
