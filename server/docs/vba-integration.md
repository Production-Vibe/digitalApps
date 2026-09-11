# VBA-интеграция с новым бэкендом

> Ветка `main`. Заменяет `doPost` Google Apps Script на REST API собственного сервера.
> Источник правды — `server/src/routes/vba.routes.ts`.

## Эндпоинт

```
POST https://<ваш-домен>/api/vba/ingest
```

## Заголовки

```
Content-Type: application/json
X-VBA-Secret: <VBA_SECRET из .env>
```

## Операции

### 1. `uploadCatalog` — выгрузка номенклатуры

Заменяет `CatalogAPI.uploadCatalog`. Upsert по `Код` (`code`): существующие записи
не изменяются (`update: {}`), добавляются только новые. Поля строк — **русские**
(как в Excel), маппинг на латинские поля `Catalog` выполняет сервер.

```json
{
  "action": "uploadCatalog",
  "rows": [
    {
      "Код": "@1234",
      "Наименование": "Втулка",
      "Обозначение": "У1234-567",
      "Обозначение 2": "",
      "Кол-во на родителя": 2,
      "Тип заготовки": "Труба",
      "Материал": "Сталь",
      "Марка материала": "20",
      "Размер заготовки": "50x50",
      "Толщина стенки": 5,
      "Длина резки": 120,
      "ППБ": "",
      "Масса заготовки": 1.5,
      "Масса детали": 1.2,
      "Резка": "1",
      "Термообработка": "",
      "Плазма": "1",
      "Токарная": "1",
      "Фрезерная": "",
      "Сверлильная": "",
      "Слесарная": "",
      "Гибка": "",
      "Покрытие": "",
      "Приоритет": "A"
    }
  ]
}
```

### 2. `createTransition` — создание технологического перехода

Заменяет `createTransition` (VBA-поток). Переход создаётся со статусом `in_progress`, оператор завершает через `completeTransition`. Поля — **латинские**:
обязательны `orderNumber`, `description`, `machine`.

```json
{
  "action": "createTransition",
  "orderNumber": "Н-260904-131352",
  "description": "Токарная обработка",
  "operator": "Морозов И.А.",
  "time": 2.5,
  "melt": "07-1234",
  "machine": "ПА8",
  "qty": 5
}
```

### 3. `completeTransition` — завершение перехода

```json
{
  "action": "completeTransition",
  "id": "ckx9..."
}
```

После завершения статус наряда пересчитывается автоматически:
- есть `in_progress` → наряд `in_progress`
- все `completed`/`checked` → наряд `waiting_otk`

## Пример VBA-макроса

```vba
Sub SendToServer(action As String, payload As Dictionary)
  Dim http As Object
  Set http = CreateObject("MSXML2.XMLHTTP")
  
  Dim req As String
  req = "{""action"":""" & action & """,""rows"":" & ConvertToJson(payload) & "}"
  
  http.Open "POST", "https://your-domain.com/api/vba/ingest", False
  http.setRequestHeader "Content-Type", "application/json"
  http.setRequestHeader "X-VBA-Secret", "your-secret-key"
  http.send req
  
  If http.Status <> 200 Then
    MsgBox "Ошибка " & http.Status & ": " & http.responseText
  End If
End Sub

Function ConvertToJson(payload As Variant) As String
  ' Утилита для сериализации Dictionary/Collection в JSON
  ' Можно использовать JSON.bas (https://github.com/VBA-tools/VBA-JSON)
End Function
```

## Обработка ошибок

| Код | Причина |
|---|---|
| `401` | Неверный `X-VBA-Secret` |
| `400` | Отсутствует `action` или невалидные данные |
| `500` | Ошибка БД / бизнес-логики |