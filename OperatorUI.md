// === СТРАНИЦА ОПЕРАТОРА ===
// Полная HTML-страница — используется при прямом переходе по URL
// (например, если оператор открывает QR-ссылку ?page=operator&id=... напрямую,
// уже будучи "залогиненным" через URL-параметры).
function renderOperatorPage(name, naryadId) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Оператор — ЦифровойНаряд</title>
</head>
<body>
  ${getOperatorPageFragment(name, naryadId)}
</body>
</html>
  `;
}

function getOperatorPageFragment(name, naryadId) {
  const safeName = name || '';
  const initialId = naryadId || '';
  
  return `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #eef2f7; min-height: 100vh; padding-bottom: 40px; }
    .header { background: #0f172a; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
    .header .title { color: #fff; font-size: 18px; font-weight: 600; }
    .header .user { color: #94a3b8; font-size: 13px; margin-top: 2px; }
    .header a.logout { color: #fca5a5; text-decoration: none; font-size: 13px; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.08); }
    .header a.logout:hover { background: rgba(255,255,255,0.15); }
    
    .tabs { display: flex; background: #fff; position: sticky; top: 60px; z-index: 9; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .tab { flex: 1; text-align: center; padding: 14px 8px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; }
    .tab.active { color: #0f172a; border-bottom-color: #0f172a; }
    
    .container { max-width: 600px; margin: 0 auto; padding: 16px; }
    .panel { display: none; }
    .panel.active { display: block; }
    
    .card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .card h3 { font-size: 15px; color: #0f172a; margin-bottom: 12px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #334155; border-bottom: 1px solid #f1f5f9; }
    .row:last-child { border-bottom: none; }
    .row .label { color: #64748b; }
    
    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
    .status-created { background: #f1f5f9; color: #475569; }
    .status-in_progress { background: #fff3cd; color: #92400e; }
    .status-waiting_otk { background: #cce5ff; color: #1d4ed8; }
    .status-closed { background: #d4edda; color: #166534; }
    
    .empty-state { text-align: center; padding: 40px 20px; color: #94a3b8; }
    .empty-state .icon { font-size: 40px; margin-bottom: 12px; }
    
    input, select { width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; margin-bottom: 12px; -webkit-appearance: none; appearance: none; }
    input:focus, select:focus { outline: none; border-color: #0f172a; }
    label.field-label { display: block; font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500; }
    
    .btn { width: 100%; padding: 13px; background: #0f172a; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
    .btn:hover { background: #1e293b; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    
    .naryad-list-item { padding: 14px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 10px; cursor: pointer; }
    .naryad-list-item:hover { border-color: #94a3b8; background: #f8fafc; }
    .naryad-list-item .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .naryad-list-item .num { font-weight: 600; color: #0f172a; }
    .naryad-list-item .detail { font-size: 13px; color: #64748b; }
    
    .transition-item { padding: 12px; background: #f8fafc; border-radius: 10px; margin-bottom: 8px; font-size: 13px; }
    .transition-item .top { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .transition-item .tp { font-weight: 600; color: #0f172a; }
    .transition-item .who { color: #64748b; }
    .transition-item .desc { color: #334155; margin-bottom: 4px; }
    .transition-item .meta { display: flex; gap: 10px; flex-wrap: wrap; color: #64748b; font-size: 12px; }
    
    .banner { padding: 14px; border-radius: 10px; font-size: 13px; margin-bottom: 16px; }
    .banner-closed { background: #d4edda; color: #166534; }
    .banner-error { background: #fee2e2; color: #991b1b; }
    .banner-info { background: #dbeafe; color: #1d4ed8; }
    
    .manual-input { display: flex; gap: 8px; }
    .manual-input input { margin-bottom: 0; }
    .manual-input button { width: auto; padding: 12px 20px; white-space: nowrap; }
    
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0f172a; color: white; padding: 12px 24px; border-radius: 30px; font-size: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); opacity: 0; pointer-events: none; transition: opacity 0.3s; z-index: 100; }
    .toast.show { opacity: 1; }
    
    .shift-active { background: #f0fdf4; padding: 12px; margin-bottom: 8px; border-radius: 8px; border-left: 4px solid #22c55e; }
    .shift-header { font-weight: 600; color: #166534; margin-bottom: 4px; }
    .shift-time { font-size: 12px; color: #64748b; }
  </style>
  <div class="header">
    <div>
      <div class="title">📋 Мои наряды</div>
      <div class="user">👤 ${escapeHtml(safeName)}</div>
    </div>
    <a href="?page=login" onclick="event.preventDefault();try{localStorage.removeItem('nd_login');localStorage.removeItem('nd_password');}catch(e){}setTimeout(function(){window.top.location.href='${appBaseUrl()}'+'?page=login';},80);" class="logout">Выйти</a>
  </div>

  <!-- БЛОК СМЕНЫ -->
  <div id="shiftBlock" class="card" style="margin:16px;">
    <div id="shiftLoading" style="text-align:center;padding:20px;">⏳ Загрузка смены...</div>
    <div id="shiftContent" style="display:none;"></div>
  </div>
  
  <div class="tabs">
    <div class="tab" data-tab="assigned" onclick="switchTab('assigned')">Назначено</div>
    <div class="tab" data-tab="current" onclick="switchTab('current')">Текущий наряд</div>
    <div class="tab" data-tab="inwork" onclick="switchTab('inwork')">В работе</div>
    <div class="tab" data-tab="closed" onclick="switchTab('closed')">Закрытые</div>
  </div>
  
  <div class="container">
    <div id="panel-current" class="panel">
      <div id="current-content">
        <div class="empty-state"><div class="icon">📷</div><p>Отсканируйте QR-код наряда</p></div>
      </div>
      <div class="card">
        <label class="field-label">Или введите номер наряда вручную</label>
        <div class="manual-input">
          <input type="text" id="manualNaryadId" placeholder="Например, Н-00123">
          <button class="btn" onclick="openManualNaryad()">Открыть</button>
        </div>
      </div>
    </div>
    
    <div id="panel-inwork" class="panel">
      <div id="inwork-content"><div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div></div>
    </div>
    
    <div id="panel-assigned" class="panel">
      <div id="assigned-content"><div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div></div>
    </div>

    <div id="panel-closed" class="panel">
      <div id="closed-content"><div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div></div>
    </div>
  </div>
  
  <div id="toast" class="toast"></div>
  
  <script>
    const OPERATOR_NAME = ${JSON.stringify(safeName)};
    let currentNaryadId = ${JSON.stringify(initialId)};
    
    const STATUS_LABELS = {
      'created': 'Создан',
      'in_progress': 'В работе',
      'waiting_otk': 'Ждёт ОТК',
      'closed': 'Закрыт'
    };
    
    function showToast(msg) {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, 2500);
    }
    
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(function(el) { el.classList.toggle('active', el.dataset.tab === tab); });
      document.querySelectorAll('.panel').forEach(function(el) { el.classList.remove('active'); });
      var panel = document.getElementById('panel-' + tab);
      if (panel) panel.classList.add('active');
      if (tab === 'assigned') loadAssigned();
      if (tab === 'inwork') loadInWork();
      if (tab === 'closed') loadClosed();
    }
    
    function statusBadge(status) {
      var label = STATUS_LABELS[status] || status;
      return '<span class="status-badge status-' + status + '">' + label + '</span>';
    }
    
    function escapeHtmlJs(str) {
      var div = document.createElement('div');
      div.textContent = str == null ? '' : str;
      return div.innerHTML;
    }
    
    // ========================
    // СМЕНА (исправлено)
    // ========================
    var activeShifts = [];
    
    function loadShiftStatus() {
      var loadingEl = document.getElementById('shiftLoading');
      var contentEl = document.getElementById('shiftContent');
      if (!contentEl) return;
      
      loadingEl.style.display = 'block';
      contentEl.style.display = 'none';
      
      google.script.run
        .withSuccessHandler(function(shifts) {
          console.log('Получены смены:', JSON.stringify(shifts));
          loadingEl.style.display = 'none';
          contentEl.style.display = 'block';
          activeShifts = shifts || [];
          renderShiftBlock();
        })
        .withFailureHandler(function(e) {
          loadingEl.style.display = 'none';
          contentEl.style.display = 'block';
          contentEl.innerHTML = '<h3>❌ Ошибка загрузки смены</h3><p style="color:#ef4444;font-size:13px;">' + e.message + '</p><button class="btn" onclick="loadShiftStatus()">🔄 Повторить</button>';
        })
        .getActiveShifts(OPERATOR_NAME);
    }
    
    function renderShiftBlock() {
      var el = document.getElementById('shiftContent');
      
      if (activeShifts.length === 0) {
        el.innerHTML = '<h3>🔒 Смена не открыта</h3>' +
          '<select id="shiftMachine" style="width:100%;padding:12px;margin-bottom:12px;"><option value="">— выберите станок —</option></select>' +
          '<button class="btn" id="openShiftBtn" onclick="openShift()">🔓 Открыть смену</button>';
        loadAllAvailableMachines();
        return;
      }
      
      // Есть открытые смены — показываем их
      var h = '';
      for (var i = 0; i < activeShifts.length; i++) {
        var startDate = new Date(activeShifts[i].startTime);
        var timeStr = startDate.toLocaleString('ru-RU');
        h += '<div class="shift-active">' +
          '<div class="shift-header">🟢 Станок: ' + activeShifts[i].machine + '</div>' +
          '<div class="shift-time">Открыта: ' + timeStr + '</div>' +
          '<button class="btn btn-danger" onclick="closeShift()" style="margin-top:8px;width:auto;padding:6px 12px;">Закрыть смену</button>' +
          '</div>';
      }
      
      if (activeShifts.length < 2) {
        h += '<div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;">' +
          '<h4 style="margin-bottom:8px;">➕ Открыть ещё станок</h4>' +
          '<select id="shiftMachine" style="width:100%;padding:12px;margin-bottom:12px;"><option value="">— выберите станок —</option></select>' +
          '<button class="btn" id="openShiftBtn2" onclick="openShift()">🔓 Открыть смену</button>' +
          '</div>';
      }
      
      el.innerHTML = h;
      
      if (activeShifts.length < 2) {
        loadAllAvailableMachines();
      }
    }
    
    function loadAllAvailableMachines() {
      var sel = document.getElementById('shiftMachine');
      if (!sel) return;
      
      google.script.run
        .withSuccessHandler(function(allOperators) {
          var usedMachines = [];
          for (var i = 0; i < allOperators.length; i++) {
            usedMachines.push(allOperators[i].machine);
          }
          
          for (var j = 0; j < activeShifts.length; j++) {
            if (usedMachines.indexOf(activeShifts[j].machine) === -1) {
              usedMachines.push(activeShifts[j].machine);
            }
          }
          
          google.script.run
            .withSuccessHandler(function(allMachines) {
              sel.innerHTML = '<option value="">— выберите станок —</option>';
              var availableCount = 0;
              for (var k = 0; k < allMachines.length; k++) {
                if (usedMachines.indexOf(allMachines[k]) === -1) {
                  sel.innerHTML += '<option value="' + allMachines[k] + '">' + allMachines[k] + '</option>';
                  availableCount++;
                }
              }
              if (availableCount === 0) {
                sel.innerHTML = '<option value="">— нет свободных станков —</option>';
                var btn = document.getElementById('openShiftBtn') || document.getElementById('openShiftBtn2');
                if (btn) btn.disabled = true;
              }
            })
            .getMachines();
        })
        .getActiveOperators();
    }
    
    function openShift() {
      var sel = document.getElementById('shiftMachine');
      if (!sel) return;
      var machine = sel.value;
      if (!machine) { showToast('❌ Выберите станок'); return; }
      
      var btn = document.getElementById('openShiftBtn');
      if (!btn) btn = document.getElementById('openShiftBtn2');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Открываю...'; }
      
      google.script.run
        .withSuccessHandler(function(r) {
          console.log('Результат openShift:', JSON.stringify(r));
          if (btn) { btn.disabled = false; btn.textContent = '🔓 Открыть смену'; }
          if (r && r.error) { 
            showToast('❌ ' + r.error); 
            return; 
          }
          showToast('✅ Смена открыта: ' + machine);
          loadShiftStatus();
        })
        .withFailureHandler(function(e) {
          console.error('Ошибка openShift:', e);
          if (btn) { btn.disabled = false; btn.textContent = '🔓 Открыть смену'; }
          showToast('❌ ' + (e.message || e));
        })
        .openShift(OPERATOR_NAME, machine);
    }
    
    function closeShift() {
      if (!confirm('Закрыть последнюю открытую смену?')) return;
      
      google.script.run
        .withSuccessHandler(function(r) {
          console.log('Результат closeShift:', JSON.stringify(r));
          if (r && r.error) { showToast('❌ ' + r.error); return; }
          showToast('✅ Смена закрыта: ' + (r.machine || ''));
          loadShiftStatus();
        })
        .withFailureHandler(function(e) { 
          console.error('Ошибка closeShift:', e);
          showToast('❌ ' + (e.message || e)); 
        })
        .closeShift(OPERATOR_NAME);
    }
    
    // ========================
    // НАРЯДЫ
    // ========================
    
    function openManualNaryad() {
      var val = document.getElementById('manualNaryadId').value.trim();
      if (!val) return;
      currentNaryadId = val;
      switchTab('current');
      loadCurrentNaryad();
    }
    
    function openNaryad(id) {
      currentNaryadId = id;
      switchTab('current');
      loadCurrentNaryad();
    }
    
    function loadCurrentNaryad() {
      var el = document.getElementById('current-content');
      if (!currentNaryadId) {
        el.innerHTML = '<div class="empty-state"><div class="icon">📷</div><p>Отсканируйте QR-код наряда</p></div>';
        return;
      }
      el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка наряда...</p></div>';
      google.script.run
        .withSuccessHandler(function(data) {
          if (data.error) { el.innerHTML = '<div class="banner banner-error">❌ ' + escapeHtmlJs(data.error) + '</div>'; return; }
          renderCurrentNaryad(data);
        })
        .withFailureHandler(function(err) { el.innerHTML = '<div class="banner banner-error">❌ Ошибка: ' + escapeHtmlJs(err.message || err) + '</div>'; })
        .getNaryadForOperator(currentNaryadId);
    }
    
    function renderCurrentNaryad(data) {
      var el = document.getElementById('current-content');
      var n = data.naryad;
      var isClosed = n.status === 'closed';
      var html = '';
      if (isClosed) html += '<div class="banner banner-closed">✅ Наряд закрыт ОТК — изменения недоступны</div>';
      html += '<div class="card"><h3>📋 Наряд ' + escapeHtmlJs(n.id) + ' ' + statusBadge(n.status) + '</h3>';
      html += '<div class="row"><span class="label">Деталь</span><span>' + escapeHtmlJs(n.detail_name || '-') + '</span></div>';
      html += '<div class="row"><span class="label">Код детали</span><span>' + escapeHtmlJs(n.detail_code || '-') + '</span></div>';
      html += '<div class="row"><span class="label">Количество</span><span>' + escapeHtmlJs(n.quantity || 0) + ' шт.</span></div></div>';
      if (isClosed && data.closingInfo) {
        var c = data.closingInfo;
        html += '<div class="card"><h3>✅ Итоги ОТК</h3>';
        html += '<div class="row"><span class="label">Принято</span><span>' + escapeHtmlJs(c.total_accepted || 0) + ' шт.</span></div>';
        html += '<div class="row"><span class="label">Брак</span><span>' + escapeHtmlJs(c.total_defect || 0) + ' шт.</span></div>';
        if (c.defect_reason) html += '<div class="row"><span class="label">Причина брака</span><span>' + escapeHtmlJs(c.defect_reason) + '</span></div>';
        html += '<div class="row"><span class="label">Закрыл(а)</span><span>' + escapeHtmlJs(c.closed_by || '-') + '</span></div>';
        html += '<div class="row"><span class="label">Дата</span><span>' + escapeHtmlJs(c.timestamp || '-') + '</span></div></div>';
      }
      html += '<div class="card"><h3>Переходы (' + data.transitions.length + ')</h3>';
      if (data.transitions.length === 0) {
        html += '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:12px 0;">Пока нет ни одного перехода</p>';
      } else {
        data.transitions.forEach(function(t) {
          html += '<div class="transition-item"><div class="top"><span class="tp">Переход ' + escapeHtmlJs(t.tp) + '</span><span class="who">' + escapeHtmlJs(t.operator) + '</span></div>';
          if (t.description) html += '<div class="desc">' + escapeHtmlJs(t.description) + '</div>';
          html += '<div class="meta"><span>⏱ ' + escapeHtmlJs(t.actual_time || 0) + ' мин</span><span>🏭 ' + escapeHtmlJs(t.machine || '-') + '</span><span>🔥 ' + escapeHtmlJs(t.melt || '-') + '</span><span>📦 ' + escapeHtmlJs(t.quantity || 0) + ' шт.</span></div></div>';
        });
      }
      html += '</div>';
      if (!isClosed) {
        html += '<div class="card"><h3>➕ Добавить переход</h3>';
        html += '<label class="field-label">Описание работы</label><input type="text" id="f_description" placeholder="Например, токарная обработка">';
        html += '<label class="field-label">Станок</label><input type="text" id="f_machine" placeholder="Например, ст. №5">';
        html += '<label class="field-label">Плавка</label><input type="text" id="f_melt" placeholder="Номер плавки">';
        html += '<label class="field-label">Время (мин)</label><input type="text" id="f_time" placeholder="Например, 15 или 6:30">';
        html += '<label class="field-label">Количество, шт.</label><input type="number" inputmode="decimal" id="f_qty" placeholder="0" min="0">';
        html += '<button class="btn" id="submitBtn" onclick="submitTransition()">✅ Выполнил</button></div>';
      }
      el.innerHTML = html;
    }
    
    function parseTimeInput(str) {
      str = (str || '').trim();
      if (!str) return 0;
      if (str.indexOf(':') > -1) {
        var parts = str.split(':');
        return (parseFloat(parts[0].replace(',', '.')) || 0) + (parseFloat(parts[1].replace(',', '.')) || 0) / 60;
      }
      return parseFloat(str.replace(',', '.')) || 0;
    }
    
    function submitTransition() {
      var btn = document.getElementById('submitBtn');
      var payload = {
        naryad_number: currentNaryadId,
        operator: OPERATOR_NAME,
        description: document.getElementById('f_description').value.trim(),
        machine: document.getElementById('f_machine').value.trim(),
        melt: document.getElementById('f_melt').value.trim(),
        actual_time: parseTimeInput(document.getElementById('f_time').value),
        quantity: parseFloat(document.getElementById('f_qty').value) || 0
      };
      btn.disabled = true; btn.textContent = 'Сохранение...';
      google.script.run
        .withSuccessHandler(function(result) {
          if (result.error) { showToast('❌ ' + result.error); btn.disabled = false; btn.textContent = '✅ Выполнил'; return; }
          showToast('✅ Переход ' + result.tp + ' сохранён');
          loadCurrentNaryad();
        })
        .withFailureHandler(function(err) { showToast('❌ Ошибка: ' + (err.message || err)); btn.disabled = false; btn.textContent = '✅ Выполнил'; })
        .operatorSubmitTransition(payload);
    }
    
    function loadInWork() {
      var el = document.getElementById('inwork-content');
      el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      google.script.run
        .withSuccessHandler(function(list) {
          if (!list || list.length === 0) { el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Нет нарядов в работе</p></div>'; return; }
          var html = '';
          list.forEach(function(n) { html += '<div class="naryad-list-item" data-naryad-id="' + escapeHtmlJs(n.id) + '" onclick="openNaryad(this.dataset.naryadId)"><div class="top"><span class="num">' + escapeHtmlJs(n.id) + '</span>' + statusBadge(n.status) + '</div><div class="detail">' + escapeHtmlJs(n.detail_name || '-') + ' • ' + escapeHtmlJs(n.quantity || 0) + ' шт.</div></div>'; });
          el.innerHTML = html;
        })
        .withFailureHandler(function(err) { el.innerHTML = '<div class="banner banner-error">❌ Ошибка загрузки</div>'; })
        .getOperatorInWork(OPERATOR_NAME);
    }
    
    function loadClosed() {
      var el = document.getElementById('closed-content');
      el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      google.script.run
        .withSuccessHandler(function(list) {
          if (!list || list.length === 0) { el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Нет закрытых нарядов</p></div>'; return; }
          var html = '';
          list.forEach(function(n) { html += '<div class="naryad-list-item" data-naryad-id="' + escapeHtmlJs(n.id) + '" onclick="openNaryad(this.dataset.naryadId)"><div class="top"><span class="num">' + escapeHtmlJs(n.id) + '</span>' + statusBadge(n.status) + '</div><div class="detail">' + escapeHtmlJs(n.detail_name || '-') + ' • ' + escapeHtmlJs(n.quantity || 0) + ' шт.</div></div>'; });
          el.innerHTML = html;
        })
        .withFailureHandler(function(err) { el.innerHTML = '<div class="banner banner-error">❌ Ошибка загрузки</div>'; })
        .getOperatorClosed(OPERATOR_NAME);
    }

    function loadAssigned() {
      var el = document.getElementById('assigned-content');
      el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      
      google.script.run
        .withSuccessHandler(function(list) {
          if (!list || list.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Нет назначенных задач</p></div>';
            return;
          }
          
          var html = '';
          for (var i = 0; i < list.length; i++) {
            var wo = list[i];
            html += '<div class="card" style="border-left:4px solid #3b82f6;">';
            html += '<h3>📋 ' + wo.orderNumber + '</h3>';
            html += '<div class="row"><span class="label">Деталь</span><span>' + escapeHtmlJs(wo.itemName) + '</span></div>';
            html += '<div class="row"><span class="label">Код</span><span>' + escapeHtmlJs(wo.itemCode) + '</span></div>';
            html += '<div class="row"><span class="label">Кол-во</span><span>' + escapeHtmlJs(wo.quantity) + ' шт.</span></div>';
            html += '<div class="row"><span class="label">Станок</span><span>' + escapeHtmlJs(wo.machine) + '</span></div>';
            html += '<div class="row"><span class="label">Программа</span><span>' + escapeHtmlJs(wo.program) + '</span></div>';
            html += '<button class="btn" onclick="acceptOrder(&quot;' + wo.orderNumber + '&quot;)" style="margin-top:12px;background:#22c55e;">✅ Принять в работу</button>';
            html += '</div>';
          }
          el.innerHTML = html;
        })
        .withFailureHandler(function(err) {
          el.innerHTML = '<div class="banner banner-error">❌ Ошибка загрузки</div>';
        })
        .getAssignedWorkOrders(OPERATOR_NAME);
    }
    
    function acceptOrder(orderNumber) {
      if (!confirm('Принять задачу ' + orderNumber + ' в работу?')) return;
      
      google.script.run
        .withSuccessHandler(function(r) {
          if (r && r.error) { showToast('❌ ' + r.error); return; }
          showToast('✅ Задача принята');
          loadAssigned();
          loadInWork();
        })
        .withFailureHandler(function(e) { showToast('❌ ' + (e.message || e)); })
        .acceptWorkOrder(orderNumber, OPERATOR_NAME);
    }
    
    // Запуск при загрузке
    loadShiftStatus();
    
    if (currentNaryadId) { 
      switchTab('current'); 
      loadCurrentNaryad(); 
    } else { 
      switchTab('assigned'); 
    }
  </script>
  `;
}