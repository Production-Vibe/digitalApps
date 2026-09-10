# Seed Data

Place JSON files here to seed the database. Format: arrays of objects with Latin field names (matching the Prisma schema).

## Files

- `catalog.json` — full nomenclature (Latin fields: `code`, `name`, `designation`, `designation2`, `parentQty`, `blankType`, `material`, `materialGrade`, `blankSize`, `wallThickness`, `cutLength`, `ppb`, `blankWeight`, `partWeight`, operations as booleans, `priority`)
- `employees.json` — `[{ "login": "...", "password": "...", "fullName": "...", "role": "master|shift|operator|otk" }]`
- `equipment.json` — `[{ "name": "Т1-1" }, ...]`

## How to export from Google Sheets

In Apps Script editor run `exportAllSheets()` (added to `Code.js`, route `?action=export` in `Auth.doGet`) and save the JSON body to `_export_raw.json`. Then apply the RU→EN column mapping:

- `Код` → `code`, `Наименование` → `name`, `Обозначение` → `designation`, `Обозначение 2` → `designation2`
- `Кол-во на родителя` → `parentQty`, `Тип заготовки` → `blankType`, `Материал` → `material`, `Марка материала` → `materialGrade`
- `Размер заготовки` → `blankSize`, `Толщина стенки` → `wallThickness`, `Длина резки` → `cutLength`, `ППБ` → `ppb`
- `Масса заготовки` → `blankWeight`, `Масса детали` → `partWeight`
- Внутрицеховые операции (`Резка`, `Термообработка`, ...) → booleans (`cutting`, `heatTreatment`, `plasma`, `turning`, `milling`, `drilling`, `fitting`, `bending`, `coating`)
- `Приоритет` → `priority`
- Employees: `Логин` → `login`, `Пароль` → `password`, `ФИО` → `fullName`, `Роль` → `role`
- Equipment: `Станок` → `name`

Passwords are hashed with bcrypt during seed (plaintext in the JSON is fine).