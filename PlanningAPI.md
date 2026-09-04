// ============================================================================
// API ДЛЯ НАЧАЛЬНИКА ЦЕХА
// Форма читает номенклатуру из листа Catalog. Оперативные данные — в Launches.
// Лист Planning больше не используется формой.
// ============================================================================

/**
 * Получить номенклатуру из Catalog для WebApp начальника цеха.
 * Читает по именам колонок (устойчиво к порядку колонок).
 * Поля unit/type/status/launchQty вычисляются на клиенте и здесь не возвращаются.
 */
function getCatalogForMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Catalog');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const H = function(name) { return headers.indexOf(name); };
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[H('Код')]) continue;
    
    result.push({
      row: i + 1,
      code: row[H('Код')],
      name: row[H('Наименование')],
      designation: row[H('Обозначение')],
      qtyPerParent: row[H('Кол-во на родителя')],
      material: row[H('Материал')],
      grade: row[H('Марка материала')],
      weight: row[H('Масса детали')],
      cutting: row[H('Резка')],
      thermo: row[H('Термообработка')],
      plasma: row[H('Плазма')],
      turning: row[H('Токарная')],
      milling: row[H('Фрезерная')],
      drilling: row[H('Сверлильная')],
      metalwork: row[H('Слесарная')],
      bending: row[H('Гибка')],
      coating: row[H('Покрытие')],
      priority: row[H('Приоритет')]
    });
  }
  
  return result;
}

/**
 * Запуск одной позиции на ПА с итоговым количеством.
 * itemCode, itemName, unit и qty передаются с клиента (qty рассчитан: авто или вручную).
 */
function confirmLaunchByCode(itemCode, itemName, unit, qty, paNumbers) {
  return createLaunch(
    itemCode,
    itemName,
    unit,
    qty,
    paNumbers,
    'К запуску',
    'Основной',
    '',
    ''
  );
}

/**
 * Массовый запуск: создаёт запись в Launches для каждой выбранной позиции.
 * items: [{ code, name, unit, qty }] — qty уже рассчитано на клиенте.
 */
function confirmBatchLaunch(items, paNumbers) {
  if (!items || items.length === 0) {
    return { error: 'Нет позиций для запуска' };
  }
  
  let count = 0;
  items.forEach(function(it) {
    const result = confirmLaunchByCode(it.code, it.name, it.unit, it.qty, paNumbers);
    if (result && result.status === 'ok') {
      count++;
    }
  });
  
  return { status: 'ok', count: count };
}

// ============================================================================
// СЛЕДУЮЩИЕ ФУНКЦИИ РАБОТАЮТ С ЛИСТАМИ Queue / WorkOrders (вне задачи "Catalog").
// Они оставлены без изменений и не зависят от перехода на Catalog.
// ============================================================================

function addToQueue(planningSheet, row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rowData = planningSheet.getRange(row, 1, 1, 25).getValues()[0];
  const pH = planningSheet.getRange(1, 1, 1, 25).getValues()[0];
  const cP = function(name) { return pH.indexOf(name); };
  
  let queue = ss.getSheetByName('Queue');
  if (!queue) {
    queue = ss.insertSheet('Queue');
    queue.getRange(1, 1, 1, 15).setValues([[
      'Код', 'Наименование', 'Обозначение', 'Узел', 'Тип',
      'Станки', 'Кол-во', 'Приоритет', 'Заказчик', 'СП', 'Программа',
      'Оператор', 'Станок выдачи', 'Выдать', 'Статус'
    ]]);
    queue.setFrozenRows(1);
  }
  
  const qData = queue.getDataRange().getValues();
  const qH = qData[0];
  const cQ = function(name) { return qH.indexOf(name); };
  for (let i = 1; i < qData.length; i++) {
    if (qData[i][cQ('Код')] === rowData[cP('Код')] && qData[i][cQ('Программа')] === rowData[cP('Программа')]) {
      return;
    }
  }
  
  queue.appendRow([
    rowData[cP('Код')],         // Код
    rowData[cP('Наименование')],// Наименование
    rowData[cP('Обозначение')], // Обозначение
    rowData[cP('Узел')],        // Узел
    rowData[cP('Тип')],         // Тип
    rowData[cP('Станки')],      // Станки
    rowData[cP('Кол-во к зап.')],// Кол-во
    rowData[cP('Приоритет')],   // Приоритет
    rowData[cP('Заказчик')],    // Заказчик
    rowData[cP('СП')],          // СП
    rowData[cP('Программа')],   // Программа
    '',           // Оператор
    '',           // Станок выдачи
    false,        // Выдать
    'К запуску'   // Статус
  ]);
  
  updateQueueOperatorValidation();
}

function removeFromQueue(planningSheet, row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queue = ss.getSheetByName('Queue');
  if (!queue) return;
  
  const pH = planningSheet.getRange(1, 1, 1, 25).getValues()[0];
  const codeIdx = pH.indexOf('Код');
  const rowData = planningSheet.getRange(row, 1, 1, 25).getValues()[0];
  const qData = queue.getDataRange().getValues();
  
  for (let i = qData.length - 1; i >= 1; i--) {
    if (qData[i][0] === rowData[codeIdx]) {
      queue.deleteRow(i + 1);
      break;
    }
  }
}

function createWorkOrderFromQueue(rowData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (!rowData[11] || !rowData[12]) {
    return { error: 'Заполните Оператора и Станок выдачи' };
  }
  
  const orderNumber = 'Н-' + Utilities.formatDate(new Date(), 'GMT+3', 'yyMMdd-HHmm');
  
  let woSheet = ss.getSheetByName('WorkOrders');
  if (!woSheet) {
    woSheet = ss.insertSheet('WorkOrders');
    woSheet.getRange(1, 1, 1, 12).setValues([[
      'Номер', 'Код детали', 'Наименование', 'Обозначение', 'Узел',
      'Программа', 'Заказчик', 'СП', 'Оператор', 'Станок', 'Кол-во', 'Статус'
    ]]);
    woSheet.setFrozenRows(1);
  }
  
  woSheet.appendRow([
    orderNumber,
    rowData[0],   // Код
    rowData[1],   // Наименование
    rowData[2],   // Обозначение
    rowData[3],   // Узел
    rowData[10],  // Программа
    rowData[8],   // Заказчик
    rowData[9],   // СП
    rowData[11],  // Оператор
    rowData[12],  // Станок выдачи
    rowData[6],   // Кол-во
    'created'
  ]);
  
  updatePlanningStatusByCode(rowData[0], rowData[10], 'Выдано');
  updateQueueOperatorValidation();
  
  // Отправляем в очередь печати
  createPrintJob(
    orderNumber,
    rowData[0],   // Код
    rowData[1],   // Наименование
    rowData[2],   // Обозначение
    rowData[3],   // Узел
    rowData[10],  // Программа
    rowData[8],   // Заказчик
    rowData[9],   // СП
    rowData[11],  // Оператор
    rowData[12],  // Станок
    rowData[6]    // Кол-во
  );
  
  return { status: 'ok', orderNumber: orderNumber };
}
