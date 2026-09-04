// ============================================================================
// ЦифровойНаряд — Веб-приложение для учёта нарядов
// Версия: 2.1
// ============================================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    console.log('doPost action: ' + action);
    
    let result;
    switch(action) {
      case 'create_naryad':
        result = createNaryad(data);
        break;
      case 'create_transition':
        result = createTransition(data);
        break;
      case 'complete_transition':
        result = completeTransition(data);
        break;
      case 'check_transition':
        result = checkTransition(data);
        break;
      case 'close_naryad':
        result = closeNaryad(data);
        break;
      case 'uploadCatalog':
        console.log('Вызов uploadCatalog...');
        result = uploadCatalog(data.data);
        console.log('Результат: ' + JSON.stringify(result).substring(0, 100));
        break;
      case 'getPrintQueue':
        result = getPrintQueue();
        break;
      case 'markPrinted':
        result = markPrinted(data.row);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(err) {
    console.log('ОШИБКА doPost: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();

  // Shifts changed → обновить список операторов в Queue
  if (sheetName === 'Shifts') {
    updateQueueOperatorValidation();
  }
  
  // --- Planning → Queue ---
  if (sheetName === 'Planning' && range.getColumn() === 25) { // Колонка Y — Статус
    if (range.getValue() === 'К запуску') {
      addToQueue(sheet, range.getRow());
    } else if (range.getValue() === '—') {
      removeFromQueue(sheet, range.getRow());
    }
  }
  
  // --- Queue → WorkOrder ---
  if (sheetName === 'Queue' && range.getColumn() === 14) { // N: Выдать
    if (range.getValue() === true) {
      const rowData = sheet.getRange(range.getRow(), 1, 1, 13).getValues()[0];
      const result = createWorkOrderFromQueue(rowData);
      if (result.status === 'ok') {
        sheet.getRange(range.getRow(), 15).setValue('Выдано: ' + result.orderNumber);
        SpreadsheetApp.getActiveSpreadsheet().toast('Наряд ' + result.orderNumber + ' создан', 'Готово');
      }
    }
  }
}