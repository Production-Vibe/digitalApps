# Seed Data

Place JSON files here to seed the database. Format: arrays of objects matching the Google Sheets columns.

## Files

- `catalog.json` — full nomenclature (24 columns per row)
- `employees.json` — `[{ "login": "...", "password": "...", "ФИО": "...", "role": "master|shift|operator|otk" }]`
- `equipment.json` — `[{ "название": "ПА8" }, ...]`

## How to export from Google Sheets

In Apps Script editor, run:

```javascript
function exportSeedData() {
  const sheets = ['Catalog', 'Employees', 'Equipment'];
  const result = {};
  sheets.forEach(name => {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    result[name.toLowerCase()] = data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
  });
  Logger.log(JSON.stringify(result, null, 2));
}
```

Then paste the output and split into separate files.
