// ============================================================================
// Config.gs — Константы листов
// ============================================================================

const SHEET_EMPLOYEES = 'Сотрудники';
const SHEET_NARYADY = 'Наряды';
const SHEET_TRANSITIONS = 'Переходы';
const SHEET_CLOSED = 'Закрытые';
const SHEET_SHIFTS = 'Shifts';
const SHEET_EQUIPMENT = 'Equipment';

// === Общий словарь статусов наряда (ADR-005, вариант C) ===
// Единый источник значений статусов Наряды/WorkOrders. Листы-проекции маппят
// свои значения на этот словарь. При правке словаря обновлять:
//   - data-model.md (раздел «Статусы жизненного цикла»);
//   - подписи NARYAD_STATUS_LABELS ниже;
//   - клиентские страницы (инжекция словаря в <script>).
const NARYAD_STATUS = {
  CREATED: 'created',
  IN_PROGRESS: 'in_progress',
  WAITING_OTK: 'waiting_otk',
  REWORK: 'rework',
  CLOSED: 'closed'
};

// Русские подписи статусов для UI (инжектятся в клиентские страницы).
const NARYAD_STATUS_LABELS = {
  'created': 'Создан',
  'in_progress': 'В работе',
  'waiting_otk': 'Ждёт ОТК',
  'rework': 'Доработка',
  'closed': 'Закрыт'
};