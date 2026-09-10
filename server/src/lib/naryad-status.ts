export const NARYAD_STATUS = ['created', 'in_progress', 'waiting_otk', 'rework', 'closed'] as const;
export type NaryadStatus = (typeof NARYAD_STATUS)[number];

export const NARYAD_STATUS_LABELS: Record<NaryadStatus, string> = {
  created: 'Создан',
  in_progress: 'В работе',
  waiting_otk: 'Ждёт ОТК',
  rework: 'Доработка',
  closed: 'Закрыт',
};

export const LAUNCH_STATUS = ['К запуску', 'Выдано', 'В работе', 'Готово'] as const;
export type LaunchStatus = (typeof LAUNCH_STATUS)[number];

export const SHIFT_STATUS = ['open', 'closed', 'auto_closed'] as const;
export type ShiftStatus = (typeof SHIFT_STATUS)[number];

export const TRANSITION_STATUS = ['in_progress', 'completed', 'checked'] as const;
export type TransitionStatus = (typeof TRANSITION_STATUS)[number];

export const PRINT_JOB_STATUS = ['pending', 'printed'] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUS)[number];

export const EMPLOYEE_ROLE = ['master', 'shift', 'operator', 'otk'] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLE)[number];
