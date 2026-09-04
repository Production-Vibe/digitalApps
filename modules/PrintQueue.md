// ============================================================================
// PrintQueue.gs — Очередь печати
// ============================================================================

const SHEET_PRINT_QUEUE = 'PrintQueue';

function createPrintJob(orderNumber, itemCode, itemName, designation, unit, program, customer, spec, operator, machine, quantity) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_PRINT_QUEUE);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PRINT_QUEUE);
    sheet.getRange(1, 1, 1, 13).setValues([[
      'ID', 'Номер наряда', 'Код детали', 'Наименование', 'Обозначение',
      'Узел', 'Программа', 'Заказчик', 'СП', 'Оператор', 'Станок', 'Кол-во', 'Статус'
    ]]);
    sheet.setFrozenRows(1);
  }
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === orderNumber) {
      return { status: 'exists', orderNumber: orderNumber };
    }
  }
  
  sheet.appendRow([
    new Date(),
    orderNumber,
    itemCode,
    itemName,
    designation,
    unit,
    program,
    customer,
    spec,
    operator,
    machine,
    quantity,
    'pending'
  ]);
  
  return { status: 'ok', orderNumber: orderNumber };
}

function getPrintQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PrintQueue');
  if (!sheet) return { status: 'ok', jobs: [] };
  
  const data = sheet.getDataRange().getValues();
  const jobs = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][12] === 'pending') {
      jobs.push({
        row: i + 1,
        id: data[i][0],
        orderNumber: data[i][1],
        itemCode: data[i][2],
        itemName: data[i][3],
        designation: data[i][4],
        unit: data[i][5],
        program: data[i][6],
        customer: data[i][7],
        spec: data[i][8],
        operator: data[i][9],
        machine: data[i][10],
        quantity: data[i][11]
      });
    }
  }
  
  return { status: 'ok', jobs: jobs };
}

function markPrinted(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PrintQueue');
  if (!sheet) return { error: 'Лист не найден' };
  
  sheet.getRange(row, 13).setValue('printed');
  return { status: 'ok' };
}