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

// ============================================================================
// АНАЛИТИКА + ОПЕРАТИВНЫЙ БЛОК (для нач. цеха)
// ============================================================================

/**
 * Удалить запуск по ID из листа Launches.
 * @param {string} launchId — ID запуска (например "ЗП-260901-120000")
 */
function deleteLaunch(launchId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LAUNCHES);
  if (!sheet) return { error: 'Лист Launches не найден' };
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(launchId)) {
      sheet.deleteRow(i + 1);
      return { status: 'ok' };
    }
  }
  
  return { error: 'Запуск не найден: ' + launchId };
}

/**
 * Обновить статус запуска по ID.
 * @param {string} launchId — ID запуска
 * @param {string} newStatus — «К запуску»/«Выдано»
 */
function setLaunchStatus(launchId, newStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LAUNCHES);
  if (!sheet) return { error: 'Лист Launches не найден' };
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(launchId)) {
      sheet.getRange(i + 1, 7).setValue(newStatus);
      return { status: 'ok' };
    }
  }
  
  return { error: 'Запуск не найден: ' + launchId };
}

/**
 * Обновить поля запуска по ID.
 * @param {string} launchId — ID запуска
 * @param {Object} fields — { qty?: number, paNumbers?: string }
 */
function updateLaunch(launchId, fields) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_LAUNCHES);
  if (!sheet) return { error: 'Лист Launches не найден' };
  if (!fields) return { error: 'Пустой запрос' };
  
  const data = sheet.getDataRange().getValues();
  let foundRow = null;
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(launchId)) {
      foundRow = i + 1;
      break;
    }
  }
  
  if (!foundRow) return { error: 'Запуск не найден: ' + launchId };
  
  const newQty = fields.qty;
  const newPaNumbers = fields.paNumbers;
  
  // Проверка занятости новых ПА (если меняем ПА)
  if (newPaNumbers !== undefined) {
    const occupied = getOccupiedPANumbers();
    // Исключаем сам этот запуск из занятых, иначе не сможем оставить тот же ПА
    const parts = String(newPaNumbers).split(',');
    const conflicts = [];
    parts.forEach(function(part) {
      part = part.trim();
      if (!part) return;
      const nums = expandPARange(part);
      nums.forEach(function(num) {
        if (occupied[num] && !isInCurrentLaunch(data, foundRow, num)) {
          conflicts.push(num);
        }
      });
    });
    if (conflicts.length > 0) {
      return { error: 'ПА заняты: ' + conflicts.join(', ') };
    }
    
    sheet.getRange(foundRow, 6).setValue(newPaNumbers);
  }
  
  if (newQty !== undefined) {
    sheet.getRange(foundRow, 5).setValue(Number(newQty) || 0);
  }
  
  return { status: 'ok' };
}

// Вспомогательная: проверяет, входит ли номер ПА в текущий запуск (строку)
function isInCurrentLaunch(data, rowIndex, paNumber) {
  const raw = String(data[rowIndex - 1][5] || '');
  const parts = raw.split(',');
  for (var i = 0; i < parts.length; i++) {
    const nums = expandPARange(parts[i]);
    if (nums.indexOf(paNumber) > -1) return true;
  }
  return false;
}

/**
 * История запусков с фильтрацией и пагинацией.
 * @param {Object} filters — { status?, paNumber?, search?, dateFrom?, dateTo?, page?, pageSize? }
 */
function getLaunchesHistory(filters) {
  filters = filters || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Launches');
  if (!sheet) return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  
  const tz = Session.getScriptTimeZone();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const data = (lastRow > 0) ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [];
  
  const records = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    let raw, date, dateNum;
    raw = data[i][8];
    date = (raw instanceof Date) ? raw : new Date(raw);
    dateNum = date.getTime() || 0;
    records.push({
      id: String(data[i][0]),
      itemCode: String(data[i][1]),
      itemName: String(data[i][2]),
      unit: String(data[i][3]),
      qty: Number(data[i][4]) || 0,
      paNumbers: String(data[i][5]),
      status: String(data[i][6] || '—'),
      createdBy: String(data[i][7]),
      createdAt: (raw instanceof Date) ? Utilities.formatDate(raw, tz, 'dd.MM.yyyy HH:mm') : String(raw || ''),
      dateNum: dateNum,
      launchType: String(data[i][9] || ''),
      reason: String(data[i][10] || ''),
      relatedId: String(data[i][11] || '')
    });
  }
  
  // Фильтр по статусу
  var status = filters.status;
  if (status) {
    records = records.filter(function(l) { return l.status === status; });
  }
  
  // Фильтр по номеру ПА
  var paNumber = filters.paNumber;
  if (paNumber) {
    records = records.filter(function(l) {
      if (!l.paNumbers) return false;
      const parts = String(l.paNumbers).split(',');
      const target = String(paNumber).padStart(3, '0');
      for (var i = 0; i < parts.length; i++) {
        if (expandPARange(parts[i]).indexOf(target) > -1) return true;
      }
      return false;
    });
  }
  
  // Поиск по коду/наименованию
  var search = filters.search;
  if (search) {
    var q = String(search).toLowerCase().trim();
    records = records.filter(function(l) {
      return String(l.itemCode).toLowerCase().indexOf(q) > -1 ||
             String(l.itemName).toLowerCase().indexOf(q) > -1;
    });
  }
  
  // Фильтр по дате
  var dateFrom = filters.dateFrom;
  var dateTo = filters.dateTo;
  if (dateFrom || dateTo) {
    var fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
    var toMs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;
    records = records.filter(function(l) {
      if (!l.dateNum) return (dateFrom ? false : true);
      if (fromMs && l.dateNum < fromMs) return false;
      if (toMs && l.dateNum > toMs) return false;
      return true;
    });
  }
  
  // Сортируем по дате (новые сверху)
  records.sort(function(a, b) {
    return (b.dateNum || 0) - (a.dateNum || 0);
  });
  
  // Пагинация
  var page = Math.max(parseInt(filters.page) || 1, 1);
  var pageSize = Math.max(parseInt(filters.pageSize) || 20, 1);
  var total = records.length;
  var start = (page - 1) * pageSize;
  var items = records.slice(start, start + pageSize);
  
  return {
    items: items,
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

/**
 * Агрегированные данные для дашборда нач. цеха.
 */
function getDashboardSummary() {
  const launches = getLaunchRecords();
  const catalog = getCatalogForMaster();
  
  // ---------- KPIs ----------
  let activePa = 0;
  let completedPa = 0;
  let totalLaunchedQty = 0;
  let inWorkItems = 0;
  let closedItems = 0;
  
  // Группируем по ПА
  const paMap = {}; // { paNumber: { total, completed, launches: [] } }
  launches.forEach(function(l) {
    if (!l.paNumbers) return;
    const parts = String(l.paNumbers).split(',');
    parts.forEach(function(part) {
      part = part.trim();
      if (!part) return;
      const nums = expandPARange(part);
      nums.forEach(function(num) {
        if (!paMap[num]) {
          paMap[num] = { total: 0, completed: 0, launches: [] };
        }
        paMap[num].total++;
        paMap[num].launches.push(l);
        if (l.status === 'Готово') paMap[num].completed++;
        if (l.status === 'В работе') inWorkItems++;
        if (l.status === 'Готово') closedItems++;
        totalLaunchedQty += l.qty || 0;
      });
    });
  });
  
  Object.keys(paMap).forEach(function(num) {
    if (paMap[num].completed >= paMap[num].total) {
      completedPa++;
    } else {
      activePa++;
    }
  });
  
  const totalLaunchedItems = launches.length;
  const totalCatalogItems = catalog.length;
  const launchedDistinct = new Set(launches.map(function(l) { return l.itemCode; })).size;
  const readinessPct = totalLaunchedItems ? Math.round(closedItems / totalLaunchedItems * 100) : 0;
  
  const kpis = {
    totalLaunches: totalLaunchedItems,
    activePAs: activePa,
    completedPAs: completedPa,
    readinessPct: readinessPct,
    totalCatalogItems: totalCatalogItems,
    launchedItems: launchedDistinct,
    inWorkItems: inWorkItems,
    closedItems: closedItems
  };
  
  // ---------- Сетка ПА ----------
  const paGrid = [];
  for (let i = 1; i <= 120; i++) {
    const num = String(i).padStart(3, '0');
    const g = paMap[num] || { total: 0, completed: 0, launches: [] };
    let status = 'free';
    if (g.total > 0) {
      if (g.completed >= g.total) {
        status = 'done';
      } else if (g.completed > 0) {
        status = 'partial';
      } else {
        status = 'assigned';
      }
    }
    paGrid.push({
      paNumber: num,
      status: status,
      launches: g.launches.slice(0, 50),
      totalItems: g.total,
      completedItems: g.completed,
      readinessPct: g.total ? Math.round(g.completed / g.total * 100) : 0
    });
  }
  
  // ---------- Узлы (группировка catalog по unit) ----------
  const unitMap = {};
  catalog.forEach(function(it) {
    const u = it.unit || 'Без узла';
    if (!unitMap[u]) {
      unitMap[u] = { name: u, totalItems: 0, launchedItems: 0, completedItems: 0 };
    }
    unitMap[u].totalItems++;
  });
  
  // Запущенные/готовые по узлам (по itemUnit из лончей или из catalog)
  launches.forEach(function(l) {
    const u = l.unit || 'Без узла';
    if (!unitMap[u]) {
      unitMap[u] = { name: u, totalItems: 0, launchedItems: 0, completedItems: 0 };
    }
    unitMap[u].launchedItems++;
    if (l.status === 'Готово') unitMap[u].completedItems++;
  });
  
  const units = Object.keys(unitMap).map(function(u) {
    const g = unitMap[u];
    g.readinessPct = g.launchedItems ? Math.round(g.completedItems / g.launchedItems * 100) : 0;
    return g;
  });
  units.sort(function(a, b) {
    return (a.readinessPct - b.readinessPct) || a.name.localeCompare(b.name, 'ru');
  });
  
  // ---------- Типы обработки ----------
  const opMeta = [
    { key: 'cutting', label: 'Резка' },
    { key: 'thermo', label: 'Термообработка' },
    { key: 'plasma', label: 'Плазма' },
    { key: 'turning', label: 'Токарная' },
    { key: 'milling', label: 'Фрезерная' },
    { key: 'drilling', label: 'Сверлильная' },
    { key: 'metalwork', label: 'Слесарная' },
    { key: 'bending', label: 'Гибка' },
    { key: 'coating', label: 'Покрытие' }
  ];
  
  const operations = opMeta.map(function(m) {
    let totalItems = 0;
    let launchedItems = 0;
    catalog.forEach(function(it) {
      const val = it[m.key];
      if (val === '+' || val === '1' || val === 'ДА') totalItems++;
    });
    launches.forEach(function(l) {
      const item = catalog.find(function(c) { return c.code === l.itemCode; });
      if (item) {
        const val = item[m.key];
        if (val === '+' || val === '1' || val === 'ДА') launchedItems++;
      }
    });
    return {
      key: m.key,
      label: m.label,
      totalItems: totalItems,
      launchedItems: launchedItems,
      loadPct: totalItems ? Math.round(launchedItems / totalItems * 100) : 0
    };
  });
  
  return {
    kpis: kpis,
    paGrid: paGrid,
    units: units,
    operations: operations,
    lastUpdated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
  };
}