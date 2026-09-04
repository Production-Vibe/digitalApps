function openShift(operatorName, machine) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateShiftsSheet(ss);
  
  const data = sheet.getDataRange().getValues();
  
  // Считаем открытые смены оператора
  let myOpenShifts = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === operatorName && data[i][5] === 'open') {
      myOpenShifts++;
    }
  }
  
  if (myOpenShifts >= 2) {
    return { error: 'У вас уже открыто 2 смены. Закройте одну из них.' };
  }
  
  // Проверяем не занят ли станок другим оператором
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === machine && data[i][5] === 'open' && data[i][1] !== operatorName) {
      return { error: 'Станок ' + machine + ' уже занят оператором ' + data[i][1] };
    }
  }
  
  const shiftId = 'СМ-' + Utilities.formatDate(new Date(), 'GMT+3', 'yyMMdd-HHmmss');
  const now = new Date();
  
  sheet.appendRow([shiftId, operatorName, machine, now, '', 'open']);
  
  return { status: 'ok', shiftId: shiftId, machine: machine, startTime: now };
}

/**
 * Закрыть смену оператора. Если передан shiftId — закрывает конкретную,
 * иначе (обратная совместимость) — последнюю открытую.
 */
function closeShift(operatorName, shiftId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SHIFTS);
  if (!sheet) return { error: 'Нет данных о сменах' };
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = data.length - 1; i >= 1; i--) {
    const isTarget = shiftId ? data[i][0] === shiftId : true;
    if (isTarget && data[i][1] === operatorName && data[i][5] === 'open') {
      sheet.getRange(i + 1, 5).setValue(new Date());
      sheet.getRange(i + 1, 6).setValue('closed');
      return { status: 'ok', shiftId: data[i][0], machine: data[i][2] };
    }
  }
  
  return { error: 'Нет открытой смены' };
}

/**
 * Получить ВСЕ активные смены оператора.
 */
function getActiveShifts(operatorName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Shifts');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const shifts = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === operatorName && data[i][5] === 'open') {
      shifts.push({
        shiftId: data[i][0],
        machine: data[i][2],
        startTime: data[i][3] ? data[i][3].toString() : ''  // ← ПРЕОБРАЗУЕМ В СТРОКУ
      });
    }
  }
  
  return shifts;
}

/**
 * Первая активная смена (для обратной совместимости).
 */
function getActiveShift(operatorName) {
  const shifts = getActiveShifts(operatorName);
  return shifts.length > 0 ? shifts[0] : null;
}

function getOrCreateShiftsSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_SHIFTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SHIFTS);
    sheet.getRange(1, 1, 1, 6).setValues([[
      'ID', 'Оператор', 'Станок', 'Открыта', 'Закрыта', 'Статус'
    ]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getMachines() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_EQUIPMENT);
  
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    const machines = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) machines.push(data[i][0]);
    }
    if (machines.length > 0) return machines;
  }
  
  return ['ПА8', 'ПА9', 'ПА10', 'ПА11', 'ПА12'];
}

function getActiveOperators() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SHIFTS);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const operators = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === 'open') {
      operators.push({
        name: data[i][1],
        machine: data[i][2],
        shiftId: data[i][0]
      });
    }
  }
  
  return operators;
}

function updateQueueOperatorValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queue = ss.getSheetByName('Queue');
  if (!queue) return;
  
  const operators = getActiveOperators();
  const names = operators.map(function(op) { return op.name; });
  
  if (names.length === 0) {
    names.push(''); // пустой список — не ломаем валидацию
  }
  
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(names, true)
    .setAllowInvalid(false)
    .build();
  
  const lastRow = Math.max(queue.getLastRow(), 2);
  queue.getRange('L2:L' + lastRow).setDataValidation(rule);
  
  return { count: names.length };
}

function getMyShifts(operatorName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Shifts');
    
    if (!sheet) {
      return [];
    }
    
    const data = sheet.getDataRange().getValues();
    const result = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] && data[i][5] && 
          data[i][1].toString().trim() === operatorName && 
          data[i][5] === 'open') {
        result.push({
          machine: String(data[i][2] || ''),
          startTime: data[i][3] ? new Date(data[i][3]).toString() : ''
        });
      }
    }
    
    return result;
    
  } catch(e) {
    return [{machine: 'Ошибка', startTime: e.toString()}];
  }
}

function autoCloseShifts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Shifts');
  if (!sheet) return;
  
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const maxHours = 12;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === 'open') {
      const startTime = new Date(data[i][3]);
      const hoursPassed = (now - startTime) / (1000 * 60 * 60);
      
      if (hoursPassed > maxHours) {
        sheet.getRange(i + 1, 5).setValue(new Date(startTime.getTime() + maxHours * 60 * 60 * 1000));
        sheet.getRange(i + 1, 6).setValue('auto-closed');
      }
    }
  }
}