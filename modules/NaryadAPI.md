// === ПОЛУЧЕНИЕ ДАННЫХ ===
function getNaryady() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = sheetHeaders(sheet);
  const cId = colIndexByName(headers, 'Номер наряда');
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (cId >= 0 ? data[i][cId] : data[i][0]) result.push(data[i]);
  }
  return result;
}

function getNaryad(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const headers = sheetHeaders(sheet);
  const cId = colIndexByName(headers, 'Номер наряда');
  if (cId < 0) return null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][cId] === naryadId) return data[i];
  }
  return null;
}

// Статус наряда (чтение по имени колонки 'Статус') или null, если нет.
function getNaryadStatus(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return null;
  const headers = sheetHeaders(sheet);
  const cId = colIndexByName(headers, 'Номер наряда');
  const cStatus = colIndexByName(headers, 'Статус');
  if (cId < 0 || cStatus < 0) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][cId] === naryadId) return data[i][cStatus];
  }
  return null;
}

// Устанавливает статус наряда (запись по имени колонки 'Статус').
function setNaryadStatus(naryadId, newStatus) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY);
  if (!sheet) return;
  const headers = sheetHeaders(sheet);
  const cId = colIndexByName(headers, 'Номер наряда');
  const cStatus = colIndexByName(headers, 'Статус');
  if (cId < 0 || cStatus < 0) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][cId] === naryadId) {
      sheet.getRange(i + 1, cStatus + 1).setValue(newStatus);
      break;
    }
  }
}

function getTransitions(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = sheetHeaders(sheet);
  const cNaryad = colIndexByName(headers, 'Наряд');
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (cNaryad >= 0 ? (data[i][cNaryad] === naryadId) : (data[i][0] === naryadId)) result.push(data[i]);
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

// Возвращает индекс колонки по её имени в строке заголовков (или -1).
// Чтение полей по именам, а не по адресам: позволяет перемещать/удалять
// лишние колонки в листе без поломки кода.
function colIndexByName(headers, name) {
  return headers ? headers.indexOf(name) : -1;
}

// Заголовки листа (первая строка).
function sheetHeaders(sheet) {
  if (!sheet) return [];
  try {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
  } catch (e) {
    return [];
  }
}

// Строит массив строки по именам колонок: valuesMap {имя: значение},
// остальные колонки — пустые (''). Порядок колонок в листе не важен.
function rowByName(sheet, valuesMap) {
  const headers = sheetHeaders(sheet);
  const row = [];
  for (let j = 0; j < headers.length; j++) row.push('');
  for (const name in valuesMap) {
    if (!Object.prototype.hasOwnProperty.call(valuesMap, name)) continue;
    const idx = colIndexByName(headers, name);
    if (idx >= 0) row[idx] = valuesMap[name];
  }
  return row;
}

// === ПРЕОБРАЗОВАНИЕ СТРОК ТАБЛИЦЫ В ОБЪЕКТЫ (для оператора) ===
function naryadRowToObject(row) {
  const headers = sheetHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NARYADY));
  const c = {
    id: colIndexByName(headers, 'Номер наряда'),
    detail_name: colIndexByName(headers, 'Деталь'),
    detail_code: colIndexByName(headers, 'Код детали'),
    quantity: colIndexByName(headers, 'Кол-во'),
    status: colIndexByName(headers, 'Статус'),
    timestamp: colIndexByName(headers, 'Дата'),
    rework_reason: colIndexByName(headers, 'Причина доработки')
  };
  return {
    id: c.id >= 0 ? row[c.id] : row[0],
    detail_name: c.detail_name >= 0 ? row[c.detail_name] : row[1],
    detail_code: c.detail_code >= 0 ? row[c.detail_code] : row[2],
    quantity: c.quantity >= 0 ? row[c.quantity] : row[3],
    status: c.status >= 0 ? row[c.status] : row[4],
    timestamp: formatDate(c.timestamp >= 0 ? row[c.timestamp] : row[5]),
    rework_reason: c.rework_reason >= 0 ? row[c.rework_reason] : ''
  };
}

function transitionRowToObject(row) {
  const headers = sheetHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS));
  const c = {
    naryad_id: colIndexByName(headers, 'Наряд'),
    tp: colIndexByName(headers, '№ п/п'),
    description: colIndexByName(headers, 'Описание'),
    operator: colIndexByName(headers, 'Оператор'),
    actual_time: colIndexByName(headers, 'Время'),
    melt: colIndexByName(headers, 'Плавка'),
    machine: colIndexByName(headers, 'Станок'),
    quantity: colIndexByName(headers, 'Кол-во'),
    status: colIndexByName(headers, 'Статус'),
    timestamp: colIndexByName(headers, 'Дата'),
    accepted_qty: colIndexByName(headers, 'Принято'),
    defect_qty: colIndexByName(headers, 'Брак')
  };
  return {
    naryad_id: c.naryad_id >= 0 ? row[c.naryad_id] : row[0],
    tp: c.tp >= 0 ? row[c.tp] : row[1],
    description: c.description >= 0 ? row[c.description] : row[2],
    operator: c.operator >= 0 ? row[c.operator] : row[3],
    actual_time: c.actual_time >= 0 ? row[c.actual_time] : row[4],
    melt: c.melt >= 0 ? row[c.melt] : row[5],
    machine: c.machine >= 0 ? row[c.machine] : row[6],
    quantity: c.quantity >= 0 ? row[c.quantity] : row[7],
    status: c.status >= 0 ? row[c.status] : row[8],
    timestamp: formatDate(c.timestamp >= 0 ? row[c.timestamp] : row[9]),
    accepted_qty: c.accepted_qty >= 0 ? row[c.accepted_qty] : row[10],
    defect_qty: c.defect_qty >= 0 ? row[c.defect_qty] : row[11]
  };
}

// Читает «сырое» значение поля строки «Переходы» по имени колонки (fallback
// на прежний позиционный индекс, если заголовок отсутствует).
function readTransitionRawField(row, name) {
  const headers = sheetHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS));
  const fallback = {
    'Наряд': 0, '№ п/п': 1, 'Описание': 2, 'Оператор': 3, 'Время': 4,
    'Плавка': 5, 'Станок': 6, 'Кол-во': 7, 'Статус': 8, 'Дата': 9,
    'Принято': 10, 'Брак': 11
  };
  const idx = colIndexByName(headers, name);
  const useIdx = idx >= 0 ? idx : (fallback[name] !== undefined ? fallback[name] : -1);
  return useIdx >= 0 ? row[useIdx] : undefined;
}

function getAllTransitionsRaw() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const cNaryad = colIndexByName(sheetHeaders(sheet), 'Наряд');
  const result = [];
  for (let i = 1; i < data.length; i++) {
    if (cNaryad >= 0 ? data[i][cNaryad] : data[i][0]) result.push(data[i]);
  }
  return result;
}

function getClosingInfo(naryadId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLOSED);
  if (!sheet) return null;
  const headers = sheetHeaders(sheet);
  const c = {
    naryad: colIndexByName(headers, 'Наряд'),
    total_accepted: colIndexByName(headers, 'Принято всего'),
    total_defect: colIndexByName(headers, 'Брак всего'),
    defect_reason: colIndexByName(headers, 'Причина брака'),
    closing_note: colIndexByName(headers, 'Комментарий'),
    closed_by: colIndexByName(headers, 'Кем закрыт'),
    timestamp: colIndexByName(headers, 'Дата')
  };
  const data = sheet.getDataRange().getValues();
  const matchIdx = c.naryad >= 0 ? c.naryad : 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][matchIdx] === naryadId) {
      const r = data[i];
      return {
        total_accepted: c.total_accepted >= 0 ? r[c.total_accepted] : r[1],
        total_defect: c.total_defect >= 0 ? r[c.total_defect] : r[2],
        defect_reason: c.defect_reason >= 0 ? r[c.defect_reason] : r[3],
        closing_note: c.closing_note >= 0 ? r[c.closing_note] : r[4],
        closed_by: c.closed_by >= 0 ? r[c.closed_by] : r[5],
        timestamp: formatDate(c.timestamp >= 0 ? r[c.timestamp] : r[6])
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
    const obj = transitionRowToObject(existing[k]);
    if (String(obj.naryad_id) === data.naryad_number &&
        String(obj.description || '').trim() === normDesc &&
        String(obj.operator || '').trim() === normOp &&
        String(obj.machine || '').trim() === normMachine) {
      const rawTs = readTransitionRawField(existing[k], 'Дата');
      const ts = rawTs ? new Date(rawTs).getTime() : 0;
      if (ts && !isNaN(ts) && (nowMs - ts) < 60000) {
        return {status: 'ok', tp: tpStr, duplicate: true};
      }
    }
  }
  
  sheet.appendRow(rowByName(sheet, {
    'Наряд': data.naryad_number,
    '№ п/п': tpStr,
    'Описание': data.description || '',
    'Оператор': data.operator,
    'Время': data.actual_time || 0,
    'Плавка': data.melt || '',
    'Станок': data.machine || '',
    'Кол-во': data.quantity || 0,
    'Статус': 'completed',
    'Дата': new Date(),
    'Принято': '',
    'Брак': ''
  }));
  
  markNaryadStarted(data.naryad_number);
  updateNaryadStatus(data.naryad_number);
  return {status: 'ok', tp: tpStr};
}

// Переводит наряд из 'created' в 'in_progress' при первом переходе.
// Финальный статус 'closed' выставляет только closeNaryad() (ОТК).
function markNaryadStarted(naryadId) {
  if (getNaryadStatus(naryadId) === 'created') {
    setNaryadStatus(naryadId, 'in_progress');
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
  
  sheet.appendRow(rowByName(sheet, {
    'Номер наряда': data.naryad_number,
    'Деталь': data.detail_name || '',
    'Код детали': data.detail_code || '',
    'Кол-во': data.quantity || 0,
    'Статус': 'created',
    'Дата': new Date()
  }));
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
  
  sheet.appendRow(rowByName(sheet, {
    'Наряд': data.naryad_number,
    '№ п/п': tpStr,
    'Описание': data.description || '',
    'Оператор': data.operator || '',
    'Время': data.actual_time || 0,
    'Плавка': data.melt || '',
    'Станок': data.machine || '',
    'Кол-во': data.quantity || 0,
    'Статус': 'in_progress',
    'Дата': new Date(),
    'Принято': '',
    'Брак': ''
  }));
  
  updateNaryadStatus(data.naryad_number);
  return {status: 'created', tp: tpStr};
}

function completeTransition(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return {error: 'Лист Переходы не найден'};
  const headers = sheetHeaders(sheet);
  const cNaryad = colIndexByName(headers, 'Наряд');
  const cTp = colIndexByName(headers, '№ п/п');
  const cStatus = colIndexByName(headers, 'Статус');
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][cNaryad] === data.naryad_number && rows[i][cTp] === data.tp) {
      sheet.getRange(i + 1, cStatus + 1).setValue('completed');
      break;
    }
  }
  updateNaryadStatus(data.naryad_number);
  return {status: 'completed'};
}

function checkTransition(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS);
  if (!sheet) return {error: 'Лист Переходы не найден'};
  const headers = sheetHeaders(sheet);
  const cNaryad = colIndexByName(headers, 'Наряд');
  const cTp = colIndexByName(headers, '№ п/п');
  const cStatus = colIndexByName(headers, 'Статус');
  const cAccepted = colIndexByName(headers, 'Принято');
  const cDefect = colIndexByName(headers, 'Брак');
  
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][cNaryad] === data.naryad_number && rows[i][cTp] === data.tp) {
      sheet.getRange(i + 1, cStatus + 1).setValue('checked');
      if (cAccepted >= 0) sheet.getRange(i + 1, cAccepted + 1).setValue(data.accepted_qty || 0);
      if (cDefect >= 0) sheet.getRange(i + 1, cDefect + 1).setValue(data.defect_qty || 0);
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
  
  setNaryadStatus(data.naryad_number, 'closed');
  
  const closedSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLOSED);
  if (closedSheet) {
    closedSheet.appendRow(rowByName(closedSheet, {
      'Наряд': data.naryad_number,
      'Принято всего': data.total_accepted || 0,
      'Брак всего': data.total_defect || 0,
      'Причина брака': data.defect_reason || '',
      'Комментарий': data.closing_note || '',
      'Кем закрыт': data.closed_by || '',
      'Дата': new Date()
    }));
  }
  
  return {status: 'closed'};
}

function updateNaryadStatus(naryadId) {
  const transitions = getTransitions(naryadId);
  const headers = sheetHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSITIONS));
  const stIdx = colIndexByName(headers, 'Статус');
  let hasInProgress = false;
  let allCompleted = true;
  
  transitions.forEach(t => {
    const status = stIdx >= 0 ? t[stIdx] : t[8];
    if (status === 'in_progress') hasInProgress = true;
    if (status !== 'completed' && status !== 'checked') allCompleted = false;
  });
  
  let newStatus = 'created';
  if (hasInProgress) newStatus = 'in_progress';
  else if (allCompleted && transitions.length > 0) newStatus = 'waiting_otk';
  
  const current = getNaryadStatus(naryadId);
  if (current !== newStatus) {
    setNaryadStatus(naryadId, newStatus);
  }
}