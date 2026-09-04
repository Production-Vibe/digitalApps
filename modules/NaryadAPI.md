// === ПОЛУЧЕНИЕ ДАННЫХ ===
function getNaryady() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) result.push(data[i]);
  }
  return result;
}

function getNaryad(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === naryadId) return data[i];
  }
  return null;
}

function getTransitions(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === naryadId) result.push(data[i]);
  }
  return result;
}

// === ФОРМАТИРОВАНИЕ ДАТ ===
function formatDate(date) {
  if (!date) return '';
  try {
    return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
  } catch(e) {
    return date.toString();
  }
}

// === ПРЕОБРАЗОВАНИЕ СТРОК ТАБЛИЦЫ В ОБЪЕКТЫ (для оператора) ===
function naryadRowToObject(row) {
  return {
    id: row[0],
    detail_name: row[1],
    detail_code: row[2],
    quantity: row[3],
    status: row[4],
    timestamp: formatDate(row[5])
  };
}

function transitionRowToObject(row) {
  return {
    naryad_id: row[0],
    tp: row[1],
    description: row[2],
    operator: row[3],
    actual_time: row[4],
    melt: row[5],
    machine: row[6],
    quantity: row[7],
    status: row[8],
    timestamp: formatDate(row[9]),
    accepted_qty: row[10],
    defect_qty: row[11]
  };
}

function getAllTransitionsRaw() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) result.push(data[i]);
  }
  return result;
}

function getClosingInfo(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLOSED);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === naryadId) {
      return {
        total_accepted: data[i][1],
        total_defect: data[i][2],
        defect_reason: data[i][3],
        closing_note: data[i][4],
        closed_by: data[i][5],
        timestamp: formatDate(data[i][6])
      };
    }
  }
  return null;
}

// === ДАННЫЕ ДЛЯ СТРАНИЦЫ ОПЕРАТОРА ===

// Полная карточка конкретного наряда (открывается по QR / вручную по номеру)
function getNaryadForOperator(naryadId) {
  const naryad = getNaryad(naryadId);
  if (!naryad) return {error: 'Наряд №' + naryadId + ' не найден'};
  
  const naryadObj = naryadRowToObject(naryad);
  const transitions = getTransitions(naryadId).map(transitionRowToObject);
  
  const result = {
    naryad: naryadObj,
    transitions: transitions
  };
  if (naryadObj.status === 'closed') {
    result.closingInfo = getClosingInfo(naryadId);
  }
  return result;
}

// Наряды "в работе" у конкретного оператора: он сохранил хотя бы один
// переход, и наряд ещё не закрыт ОТК. Несколько операторов могут работать
// над одним и тем же нарядом одновременно — это нормально.
function getOperatorInWork(operatorName) {
  const allTransitions = getAllTransitionsRaw();
  const myNaryadIds = new Set();
  allTransitions.forEach(t => {
    if (t[3] === operatorName) myNaryadIds.add(t[0]);
  });
  
  return getNaryady()
    .map(naryadRowToObject)
    .filter(n => n.status !== 'closed' && myNaryadIds.has(n.id));
}

// Наряды, которые этот оператор заполнял и которые уже закрыты ОТК
function getOperatorClosed(operatorName) {
  const allTransitions = getAllTransitionsRaw();
  const myNaryadIds = new Set();
  allTransitions.forEach(t => {
    if (t[3] === operatorName) myNaryadIds.add(t[0]);
  });
  
  return getNaryady()
    .map(naryadRowToObject)
    .filter(n => n.status === 'closed' && myNaryadIds.has(n.id));
}

// Задачи, назначенные оператору (статус 'created' в WorkOrders)
function getAssignedWorkOrders(operatorName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('WorkOrders');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][8] === operatorName && data[i][11] === 'created') {
      result.push({
        orderNumber: data[i][0],
        itemCode: data[i][1],
        itemName: data[i][2],
        designation: data[i][3],
        unit: data[i][4],
        program: data[i][5],
        customer: data[i][6],
        spec: data[i][7],
        machine: data[i][9],
        quantity: data[i][10],
        status: data[i][11]
      });
    }
  }
  
  return result;
}

// Принять задачу в работу
function acceptWorkOrder(orderNumber, operatorName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('WorkOrders');
  if (!sheet) return { error: 'Лист WorkOrders не найден' };
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === orderNumber && data[i][11] === 'created') {
      sheet.getRange(i + 1, 12).setValue('in_progress');
      
      // Обновляем статус в Planning
      updatePlanningStatusByCode(data[i][1], data[i][5], 'В работе');
      
      return { status: 'ok', orderNumber: orderNumber };
    }
  }
  
  return { error: 'Задача не найдена или уже принята' };
}

function updatePlanningStatusByCode(itemCode, program, newStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Planning');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== itemCode) continue;
    // Если программа задана (путь via PlanningAPI) — матчим и по ней.
    // Если пуста (наряды из ShiftUI, где программа не хранится) — берём первую
    // строку с этим кодом, иначе статус не обновился бы вовсе.
    if (program && data[i][20] !== program) continue;
    sheet.getRange(i + 1, 25).setValue(newStatus); // Y = 25
    break;
  }
}

// Оператор заполняет переход "в один шаг": ввёл данные — сразу "Выполнил".
// Отдельного шага "Начать переход" нет. Закрыть наряд оператор не может —
// это делает только ОТК через closeNaryad().
function operatorSubmitTransition(data) {
  const naryad = getNaryad(data.naryad_number);
  if (!naryad) return {error: 'Наряд №' + data.naryad_number + ' не найден'};
  if (naryad[4] === 'closed') return {error: 'Наряд уже закрыт ОТК, изменения невозможны'};
  if (!data.operator) return {error: 'Не указано имя оператора'};
  
  const transitions = getTransitions(data.naryad_number);
  let maxTp = 0;
  transitions.forEach(t => {
    const num = parseInt(t[1]);
    if (num > maxTp) maxTp = num;
  });
  const nextTp = maxTp === 0 ? 5 : maxTp + 5;
  const tpStr = String(nextTp).padStart(3, '0');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return {error: 'Лист Переходы не найден'};
  
  // Защита от двойной отправки: не создаём дубль, если такой же переход
  // уже был записан в последние 60 секунд (тот же наряд, описание, оператор).
  const existing = getAllTransitionsRaw();
  const nowMs = new Date().getTime();
  const normDesc = String(data.description || '').trim();
  const normOp = String(data.operator || '').trim();
  const normMachine = String(data.machine || '').trim();
  for (let k = 0; k < existing.length; k++) {
    const t = existing[k];
    if (String(t[0]) === data.naryad_number &&
        String(t[2] || '').trim() === normDesc &&
        String(t[3] || '').trim() === normOp &&
        String(t[6] || '').trim() === normMachine) {
      let lastTs = 0;
      try { lastTs = new Date(t[9]).getTime(); } catch (e) { lastTs = 0; }
      if ((nowMs - lastTs) < 60000) {
        return {status: 'ok', tp: tpStr, duplicate: true};
      }
    }
  }
  
  sheet.appendRow([
    data.naryad_number,
    tpStr,
    data.description || '',
    data.operator,
    data.actual_time || 0,
    data.melt || '',
    data.machine || '',
    data.quantity || 0,
    'completed',
    new Date(),
    '',
    ''
  ]);
  
  markNaryadStarted(data.naryad_number);
  return {status: 'ok', tp: tpStr};
}

// Переводит наряд из 'created' в 'in_progress' при первом переходе.
// Финальный статус 'closed' выставляет только closeNaryad() (ОТК).
function markNaryadStarted(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === naryadId) {
      if (rows[i][4] === 'created') {
        sheet.getRange(i + 1, 5).setValue('in_progress');
      }
      break;
    }
  }
}

// === СТРАНИЦА НАРЯДА ===
function renderNaryad(naryadId, role, name) {
  const naryad = getNaryad(naryadId);
  const safeRole = role || 'login';
  const safeName = name || '';
  
  if (!naryad) {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body><h1>Наряд не найден</h1><p><a href="?page=${escapeHtml(safeRole)}&name=${encodeURIComponent(safeName)}">← Назад</a></p></body>
</html>`;
  }
  
  const transitions = getTransitions(naryadId);
  let rows = '';
  if (transitions.length > 0) {
    transitions.forEach(t => {
      const statusColors = {
        'pending': '#e0e0e0',
        'in_progress': '#fff3cd',
        'completed': '#d4edda',
        'checked': '#cce5ff'
      };
      const color = statusColors[t[8]] || '#e0e0e0';
      rows += `
        <tr>
          <td>${escapeHtml(t[1])}</td>
          <td>${escapeHtml(t[2])}</td>
          <td>${escapeHtml(t[3]) || '-'}</td>
          <td>${escapeHtml(t[4]) || '-'}</td>
          <td>${escapeHtml(t[5]) || '-'}</td>
          <td>${escapeHtml(t[6]) || '-'}</td>
          <td>${escapeHtml(t[7]) || '-'}</td>
          <td><span style="background:${color};padding:4px 8px;border-radius:4px;">${escapeHtml(t[8])}</span></td>
        </tr>
      `;
    });
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Наряд ${escapeHtml(naryadId)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #eef2f7; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #0f172a; border-radius: 16px; padding: 16px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 600; margin: 0; }
    .header a { color: #94a3b8; text-decoration: none; margin-left: 16px; }
    .header a:hover { color: white; }
    .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { margin-bottom: 16px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f8fafc; color: #1e293b; padding: 12px 16px; text-align: left; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
    td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
    .user-name { color: white; margin-right: 16px; }
    .back-link { color: white; text-decoration: none; margin-right: 16px; }
    .back-link:hover { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Наряд ${escapeHtml(naryadId)}</h1>
      <div>
        <span class="user-name">👤 ${escapeHtml(safeName)}</span>
        <a href="?page=${escapeHtml(safeRole)}&name=${encodeURIComponent(safeName)}" class="back-link">← Назад</a>
        <a href="?page=login" onclick="event.preventDefault();try{localStorage.removeItem('nd_login');localStorage.removeItem('nd_password');}catch(e){}setTimeout(function(){window.top.location.href='${appBaseUrl()}'+'?page=login';},80);" class="logout-btn" style="background:rgba(255,255,255,0.1);padding:8px 18px;border-radius:8px;color:white;text-decoration:none;">Выйти</a>
      </div>
    </div>
    
    <div class="card">
      <p><strong>Деталь:</strong> ${escapeHtml(naryad[1]) || '-'} | <strong>Кол-во:</strong> ${escapeHtml(naryad[3]) || 0} шт.</p>
    </div>
    
    <div class="card" style="margin-top:20px;">
      <h2>Переходы</h2>
      ${transitions.length > 0 ? `
      <table>
        <tr><th>№</th><th>Переход</th><th>Оператор</th><th>Время</th><th>Плавка</th><th>Станок</th><th>Кол-во</th><th>Статус</th></tr>
        ${rows}
      </table>
      ` : '<p style="text-align:center;color:#888;padding:20px 0;">Нет переходов</p>'}
    </div>
  </div>
</body>
</html>
  `;
}

// === API ДЛЯ VBA ===
function createNaryad(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return {error: 'Лист Наряды не найден'};
  
  sheet.appendRow([
    data.naryad_number,
    data.detail_name || '',
    data.detail_code || '',
    data.quantity || 0,
    'created',
    new Date()
  ]);
  return {status: 'created'};
}

function createTransition(data) {
  const transitions = getTransitions(data.naryad_number);
  let maxTp = 0;
  transitions.forEach(t => {
    const num = parseInt(t[1]);
    if (num > maxTp) maxTp = num;
  });
  const nextTp = maxTp === 0 ? 5 : maxTp + 5;
  const tpStr = String(nextTp).padStart(3, '0');
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return {error: 'Лист Переходы не найден'};
  
  sheet.appendRow([
    data.naryad_number,
    tpStr,
    data.description || '',
    data.operator || '',
    data.actual_time || 0,
    data.melt || '',
    data.machine || '',
    data.quantity || 0,
    'in_progress',
    new Date()
  ]);
  
  updateNaryadStatus(data.naryad_number);
  return {status: 'created', tp: tpStr};
}

function completeTransition(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return {error: 'Лист Переходы не найден'};
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.naryad_number && rows[i][1] === data.tp) {
      sheet.getRange(i + 1, 9).setValue('completed');
      break;
    }
  }
  updateNaryadStatus(data.naryad_number);
  return {status: 'completed'};
}

function checkTransition(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return {error: 'Лист Переходы не найден'};
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.naryad_number && rows[i][1] === data.tp) {
      sheet.getRange(i + 1, 9).setValue('checked');
      sheet.getRange(i + 1, 10).setValue(data.accepted_qty || 0);
      sheet.getRange(i + 1, 11).setValue(data.defect_qty || 0);
      break;
    }
  }
  updateNaryadStatus(data.naryad_number);
  return {status: 'checked'};
}

/**
 * Проверка роли пользователя по листу Сотрудники (login | password | ФИО | role).
 * Принимает login или ФИО.
 */
function isRole(user, expectedRole) {
  if (!user) return false;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EMPLOYEES);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const needle = String(user);
  for (let i = 1; i < data.length; i++) {
    const login = data[i][0] ? String(data[i][0]).trim() : '';
    const fio = data[i][2] ? String(data[i][2]).trim() : '';
    const role = data[i][3] ? String(data[i][3]).trim() : '';
    if ((login === needle || fio === needle) && role === expectedRole) {
      return true;
    }
  }
  return false;
}

function closeNaryad(data) {
  data = data || {};
  if (!data.closed_by) return { error: 'Не указано, кто закрывает наряд (closed_by)' };
  if (!isRole(data.closed_by, 'otk')) {
    return { error: 'Отказано: закрывать наряд может только ОТК' };
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return {error: 'Лист Наряды не найден'};
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.naryad_number) {
      sheet.getRange(i + 1, 5).setValue('closed');
      break;
    }
  }
  
  const closedSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLOSED);
  if (closedSheet) {
    closedSheet.appendRow([
      data.naryad_number,
      data.total_accepted || 0,
      data.total_defect || 0,
      data.defect_reason || '',
      data.closing_note || '',
      data.closed_by || '',
      new Date()
    ]);
  }
  
  return {status: 'closed'};
}

function updateNaryadStatus(naryadId) {
  const transitions = getTransitions(naryadId);
  let hasInProgress = false;
  let allCompleted = true;
  
  transitions.forEach(t => {
    const status = t[8];
    if (status === 'in_progress') hasInProgress = true;
    if (status !== 'completed' && status !== 'checked') allCompleted = false;
  });
  
  let newStatus = 'created';
  if (hasInProgress) newStatus = 'in_progress';
  else if (allCompleted && transitions.length > 0) newStatus = 'waiting_otk';
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return;
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === naryadId) {
      sheet.getRange(i + 1, 5).setValue(newStatus);
      break;
    }
  }
}