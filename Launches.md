// ============================================================================
// Launches.gs — Учёт запусков на конкретные ПА (подъёмные агрегаты)
// ============================================================================

const SHEET_LAUNCHES = 'Launches';

function createLaunch(itemCode, itemName, unit, qty, paNumbers, status, launchType, reason, relatedId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LAUNCHES);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LAUNCHES);
    sheet.getRange(1, 1, 1, 12).setValues([[
      'ID', 'Код детали', 'Наименование', 'Узел', 'Кол-во',
      '№ ПА', 'Статус', 'Кто создал', 'Дата',
      'Тип запуска', 'Причина', 'Связанный запуск'
    ]]);
    sheet.setFrozenRows(1);
  }
  
  const launchId = 'ЗП-' + Utilities.formatDate(new Date(), 'GMT+3', 'yyMMdd-HHmmss');
  const now = new Date();
  
  sheet.appendRow([
    launchId,
    itemCode,
    itemName,
    unit,
    qty,
    paNumbers,
    status || 'К запуску',
    Session.getActiveUser().getEmail() || 'Неизвестно',
    now,
    launchType || 'Основной',
    reason || '',
    relatedId || ''
  ]);
  
  return { status: 'ok', launchId: launchId };
}

function getLaunchRecords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Launches');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    result.push({
      id: String(row[0]),
      itemCode: String(row[1]),
      itemName: String(row[2]),
      unit: String(row[3]),
      qty: Number(row[4]) || 0,
      paNumbers: String(row[5]),
      status: String(row[6]),
      createdBy: String(row[7]),
      createdAt: String(row[8]),
      launchType: String(row[9] || 'Основной'),
      reason: String(row[10] || ''),
      relatedId: String(row[11] || '')
    });
  }
  
  return result;
}

function getOccupiedPANumbers() {
  const launches = getLaunchRecords();
  const occupied = {};
  
  launches.forEach(function(l) {
    if (!l.paNumbers) return;
    
    // Разбираем строку: "001" или "009-011" или "009, 010, 011"
    const parts = String(l.paNumbers).split(',');
    parts.forEach(function(part) {
      part = part.trim();
      if (!part) return;
      
      if (part.indexOf('-') > -1) {
        // Диапазон
        const rangeParts = part.split('-');
        const start = parseInt(rangeParts[0]);
        const end = parseInt(rangeParts[1]);
        for (let n = start; n <= end; n++) {
          occupied[String(n).padStart(3, '0')] = true;
        }
      } else {
        // Одиночный номер
        occupied[String(parseInt(part)).padStart(3, '0')] = true;
      }
    });
  });
  
  return occupied;
}

function getPALoadSummary() {
  const launches = getLaunchRecords();
  const summary = {};
  
  launches.forEach(function(l) {
    if (!l.paNumbers) return;
    
    const parts = String(l.paNumbers).split(',');
    parts.forEach(function(part) {
      part = part.trim();
      if (!part) return;
      
      const numbers = expandPARange(part);
      numbers.forEach(function(num) {
        if (!summary[num]) {
          summary[num] = { total: 0, inWork: 0, done: 0 };
        }
        summary[num].total++;
        if (l.status === 'В работе') summary[num].inWork++;
        if (l.status === 'Готово') summary[num].done++;
      });
    });
  });
  
  return summary;
}

function getPAGridData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Launches');
  const launches = [];
  
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      launches.push({
        id: String(row[0]),
        itemCode: String(row[1]),
        itemName: String(row[2]),
        unit: String(row[3]),
        qty: Number(row[4]) || 0,
        paNumbers: String(row[5]),
        status: String(row[6]),
        createdBy: String(row[7]),
        createdAt: String(row[8]),
        launchType: String(row[9] || 'Основной'),
        reason: String(row[10] || ''),
        relatedId: String(row[11] || '')
      });
    }
  }
  
  const grid = {};
  
  // Инициализируем все ПА от 001 до 120
  for (let i = 1; i <= 120; i++) {
    const num = String(i).padStart(3, '0');
    grid[num] = {
      paNumber: num,
      status: 'free',
      launches: []
    };
  }
  
  // Заполняем статусы из запусков
  launches.forEach(function(l) {
    if (!l.paNumbers) return;
    
    const parts = String(l.paNumbers).split(',');
    parts.forEach(function(part) {
      part = part.trim();
      if (!part) return;
      
      const numbers = expandPARange(part);
      numbers.forEach(function(num) {
        if (grid[num]) {
          grid[num].launches.push({
            id: l.id,
            itemName: l.itemName,
            itemCode: l.itemCode,
            qty: l.qty,
            status: l.status
          });
          
          // Определяем статус ПА
          if (l.status === 'Готово') {
            if (grid[num].status !== 'done') {
              grid[num].status = 'done';
            }
          } else if (l.status === 'В работе' || l.status === 'Выдано') {
            if (grid[num].status !== 'done') {
              grid[num].status = 'assigned';
            }
          } else if (l.status === 'К запуску') {
            if (grid[num].status === 'free') {
              grid[num].status = 'assigned';
            }
          }
        }
      });
    });
  });
  
  // Преобразуем объект в массив
  const result = [];
  for (let i = 1; i <= 120; i++) {
    const num = String(i).padStart(3, '0');
    result.push(grid[num]);
  }
  
  return result;
}

function getLaunchesByItemCode(itemCode) {
  if (!itemCode) return [];
  
  const launches = getLaunchRecords();
  return launches.filter(function(l) {
    return l.itemCode === itemCode;
  });
}

function getLaunchesMap() {
  const launches = getLaunchRecords();
  const map = {};
  
  launches.forEach(function(l) {
    if (!l.itemCode) return;
    
    if (!map[l.itemCode]) {
      map[l.itemCode] = [];
    }
    
    map[l.itemCode].push({
      id: l.id,
      paNumbers: l.paNumbers,
      status: l.status,
      qty: l.qty,
      createdAt: l.createdAt,
      createdBy: l.createdBy,
      launchType: l.launchType
    });
  });
  
  return map;
}

function expandPARange(str) {
  str = str.trim();
  if (str.indexOf('-') > -1) {
    const parts = str.split('-');
    const start = parseInt(parts[0]);
    const end = parseInt(parts[1]);
    const result = [];
    for (let n = start; n <= end; n++) {
      result.push(String(n).padStart(3, '0'));
    }
    return result;
  }
  return [String(parseInt(str)).padStart(3, '0')];
}

function getLaunchesForWeb() {
  return getLaunchRecords();
}

function checkLaunchesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Launches');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  
  Logger.log('sheetName: ' + sheet.getName());
  Logger.log('lastRow: ' + lastRow);
  Logger.log('lastCol: ' + lastCol);
  Logger.log('dataLength: ' + data.length);
  Logger.log('firstRow: ' + JSON.stringify(data[0]));
  Logger.log('secondRow: ' + JSON.stringify(data[1] || null));
  Logger.log('thirdRow: ' + JSON.stringify(data[2] || null));
}