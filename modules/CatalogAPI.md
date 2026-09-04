function uploadCatalog(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    let oldSheet = ss.getSheetByName('Catalog');
    if (oldSheet) {
      ss.deleteSheet(oldSheet);
    }
    
    let sheet = ss.insertSheet('Catalog');
    
    if (!data.rows || data.rows.length === 0) {
      return { status: 'ok', count: 0 };
    }
    
    const headers = [
      'Код', 'Наименование', 'Обозначение', 'Обозначение 2',
      'Кол-во на родителя',
      'Тип заготовки', 'Материал', 'Марка материала', 'Размер заготовки',
      'Толщина стенки', 'Длина резки', 'ППБ', 'Масса заготовки', 'Масса детали',
      'Резка', 'Термообработка', 'Плазма', 'Токарная', 'Фрезерная',
      'Сверлильная', 'Слесарная', 'Гибка', 'Покрытие', 'Приоритет'
    ];
    
    const numCols = headers.length;
    
    sheet.getRange(1, 1, 1, numCols).setValues([headers]);
    sheet.getRange(2, 1, data.rows.length, numCols).setValues(data.rows);
    sheet.getRange('A2:A').setNumberFormat('@STRING@');
    sheet.setFrozenRows(1);
    
    const range = sheet.getRange(1, 1, data.rows.length + 1, numCols);
    range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
    sheet.autoResizeColumns(1, numCols);
    sheet.getRange(1, 1, data.rows.length + 1, numCols).createFilter();
    
    return { status: 'ok', count: data.rows.length };
    
  } catch(err) {
    return { error: err.toString() };
  }
}

function getHeaderIndex(headers, name) {
  return headers.indexOf(name);
}