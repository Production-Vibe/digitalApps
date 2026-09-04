function getMasterPageFragment(name) {
  const safeName = name || '';
  
  return `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #eef2f7; min-height: 100vh; padding-bottom: 40px; }
    .header { background: #0f172a; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
    .header .title { color: #fff; font-size: 18px; font-weight: 600; }
    .header .user { color: #94a3b8; font-size: 13px; }
    .header a.logout { color: #fca5a5; text-decoration: none; font-size: 13px; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.08); }
    
    .filters { display: flex; gap: 8px; padding: 12px 16px; background: #fff; position: sticky; top: 60px; z-index: 9; flex-wrap: wrap; align-items: center; }
    .filters select, .filters button { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: #fff; }
    .filters button { background: #0f172a; color: #fff; cursor: pointer; }
    .filters input[type="text"], .filters input[type="date"], .filters input[type="number"] { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: #fff; height: 38px; box-sizing: border-box; }
    
    .container { 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 16px; 
      padding-bottom: 80px;
    }
    .card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); cursor: pointer; transition: all 0.2s; }
    .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .card.selected { border: 2px solid #3b82f6; background: #eff6ff; }
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .card-code { font-weight: 600; color: #0f172a; font-size: 14px; }
    .card-name { font-size: 14px; color: #334155; }
    .card-status { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .status-- { background: #f1f5f9; color: #64748b; }
    .status-К { background: #fef3c7; color: #92400e; }
    .status-Выдано { background: #dbeafe; color: #1d4ed8; }
    .status-В { background: #fff3cd; color: #92400e; }
    .status-Готово { background: #d4edda; color: #166534; }
    
    .card-detail { font-size: 12px; color: #64748b; display: flex; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
    .card-ops { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
    .op-tag { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 500; }
    .op-yes { background: #d4edda; color: #166534; }
    .op-no { background: #f1f5f9; color: #94a3b8; }
    
    .edit-panel { display: none; background: #f8fafc; padding: 12px; border-radius: 8px; margin-top: 10px; }
    .edit-panel.active { display: block; }
    .edit-panel input, .edit-panel select { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-bottom: 6px; }
    .edit-panel button { padding: 8px 16px; background: #0f172a; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 6px; }
    .edit-panel .btn-green { background: #22c55e; }

    .pa-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; align-items: center; justify-content: center; }
    .pa-modal-card { 
      background: #fff; 
      border-radius: 12px; 
      width: 90%; 
      max-width: 450px; 
      overflow: hidden; 
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .pa-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #0f172a; color: #fff; font-weight: 600; }
    .pa-modal-body { 
      padding: 16px; 
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
    .pa-info { font-size: 13px; color: #334155; margin-bottom: 10px; padding: 8px; background: #f8fafc; border-radius: 6px; }
    .pa-modal-body input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; margin-bottom: 8px; outline: none; }
    .pa-modal-body input:focus { border-color: #3b82f6; }
    .pa-hint { font-size: 12px; color: #64748b; margin-bottom: 8px; min-height: 16px; }
    .pa-hint.warning { color: #f59e0b; }
    .pa-hint.danger { color: #ef4444; }
    .pa-modal-actions { display: flex; gap: 6px; margin-top: 8px; }
    .pa-modal-actions button { padding: 10px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .pa-modal-actions button:first-child { background: #22c55e; color: #fff; }
    .pa-modal-actions button:last-child { background: #e2e8f0; color: #334155; }
    
    .batch-fill-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; display: flex; align-items: center; justify-content: center; }
    .batch-fill-card { 
      background: #fff; 
      border-radius: 12px; 
      width: 90%; 
      max-width: 400px; 
      overflow: hidden; 
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .batch-fill-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #0f172a; color: #fff; font-weight: 600; }
    /* Удалено — заменено в новых стилях */
    .batch-fill-body { 
      padding: 16px; 
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
    .batch-fill-body input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; margin-bottom: 8px; outline: none; }
    .batch-fill-body input:focus { border-color: #3b82f6; }
    .batch-fill-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .batch-fill-actions button { padding: 8px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .batch-fill-actions button:first-child { background: #22c55e; color: #fff; }
    .batch-fill-actions button:nth-child(2) { background: #0f172a; color: #fff; }
    .batch-fill-actions button:last-child { background: #e2e8f0; color: #334155; }

    .batch-bar { 
      display: none; 
      position: fixed; 
      bottom: 0; 
      left: 0; 
      right: 0; 
      background: #0f172a; 
      color: #fff; 
      padding: 12px 20px; 
      z-index: 100; 
      text-align: center; 
      box-shadow: 0 -2px 8px rgba(0,0,0,0.15);
    }
    .batch-bar.active { 
      display: block; 
    }
    
    /* Когда панель активна, увеличиваем отступ снизу */
    body:has(.batch-bar.active) .container {
      padding-bottom: 120px;
    }
    .batch-bar button { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin: 0 6px; }
    .btn-launch { background: #f59e0b; color: #000; }
    .btn-launch-single { background: #f59e0b; color: #000; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; padding: 2px 8px; margin-left: 4px; }
    
    .empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
    .empty-state .icon { font-size: 48px; margin-bottom: 12px; }
    
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #fff; padding: 12px 24px; border-radius: 30px; font-size: 14px; opacity: 0; pointer-events: none; transition: opacity 0.3s; z-index: 200; }
    .toast.show { opacity: 1; }
    .unit-group { margin-bottom: 8px; }
    .unit-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #f1f5f9; border-radius: 8px; cursor: pointer; font-weight: 600; color: #0f172a; }
    .unit-arrow { font-size: 10px; width: 16px; }
    .unit-name { flex: 1; }
    .unit-count { font-size: 12px; color: #64748b; font-weight: 400; }
    .unit-items { padding-left: 12px; }
    .card-left { display: flex; align-items: center; gap: 10px; }
    .tree-group { margin-bottom: 2px; }
    .tree-group-header { 
      display: flex; 
      align-items: center; 
      gap: 6px; 
      padding: 8px 12px; 
      background: #e2e8f0; 
      border-radius: 6px; 
      cursor: pointer; 
      font-weight: 600; 
      color: #475569; 
      min-height: 32px;
    }
    .tree-arrow { font-size: 10px; width: 14px; cursor: pointer; }
    .tree-icon { font-size: 14px; }
    .tree-name { flex: 1; }
    .tree-type { font-size: 10px; color: #94a3b8; text-transform: uppercase; }
    .tree-code { font-family: monospace; font-size: 12px; color: #64748b; min-width: 80px; }
    
    .tree-assembly { margin-bottom: 2px; background: #fff; border-radius: 6px; padding: 6px 0; }
    .tree-assembly-header { 
      display: flex; 
      align-items: center; 
      gap: 6px; 
      padding: 6px 12px;
      min-height: 28px;
    }

    .tree-arrow, 
    .tree-icon, 
    .tree-code, 
    .tree-name, 
    .tree-type, 
    .tree-material, 
    .tree-priority,
    .card-status {
      display: inline-flex; 
      align-items: center; 
      line-height: 1;
    }
    
    .tree-detail { margin-bottom: 1px; background: #fafafa; border-radius: 4px; padding: 4px 0; }
    .tree-detail-row { 
      display: flex; 
      align-items: center; 
      gap: 6px; 
      padding: 4px 12px; 
      flex-wrap: wrap; 
      min-height: 28px;
    }
    .tree-ops { display: flex; gap: 2px; }
    .tree-material { font-size: 11px; color: #64748b; }
    .tree-priority { font-size: 11px; }
    
    .tree-children { margin-top: 0; }
    
    .card-check { 
      width: 16px; 
      height: 16px; 
      cursor: pointer; 
      flex-shrink: 0; 
      vertical-align: middle;
      margin: 0;
      padding: 0;
    }

    .ops-filter { 
      display: flex; 
      gap: 4px; 
      padding: 6px 16px; 
      background: #fff; 
      flex-wrap: wrap; 
      align-items: center; 
      border-top: 1px solid #e2e8f0; 
    }
    .ops-filter-item { 
      display: inline-flex; 
      align-items: center; 
      gap: 4px; 
      font-size: 11px; 
      color: #475569; 
      cursor: pointer; 
      padding: 3px 8px; 
      border-radius: 4px; 
      background: #f8fafc; 
      white-space: nowrap;
      line-height: 1;
      min-height: 24px;
    }
    .ops-filter-item:hover { background: #e2e8f0; }
    .ops-filter-item input[type="checkbox"] { 
      width: 14px; 
      height: 14px; 
      cursor: pointer; 
      margin: 0;
      padding: 0;
      flex: 0 0 auto;
      vertical-align: middle;
      position: relative;
      top: 0;
    }
    /* Удалено — заменено в новых стилях */

    .search-bar { 
      display: flex; 
      gap: 8px; 
      padding: 8px 16px; 
      background: #fff; 
      position: sticky; 
      top: 108px; 
      z-index: 8; 
      align-items: center; 
      width: 100%; 
      box-sizing: border-box;
    }

    .search-bar input { 
      flex: 1 1 auto;
      padding: 0 14px; 
      height: 40px;
      border: 1px solid #cbd5e1; 
      border-radius: 8px; 
      font-size: 14px; 
      outline: none; 
      min-width: 0;
      line-height: 40px;
    }

    .search-bar input:focus { 
      border-color: #3b82f6; 
      box-shadow: 0 0 0 3px rgba(59,130,246,0.1); 
    }

    .search-bar button { 
      padding: 0 14px;
      height: 40px;
      border: 1px solid #cbd5e1; 
      border-radius: 8px; 
      background: #f1f5f9; 
      cursor: pointer; 
      font-size: 14px; 
      flex: 0 0 auto;
      white-space: nowrap; 
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* Для фильтров - чтобы они тоже были выровнены */
    .filters select, .filters button { 
      height: 36px;
      display: inline-flex;
      align-items: center;
    }

    /* Для кнопок в панели редактирования */
    .edit-panel button { 
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* Для batch-bar кнопок */
    .batch-bar button { 
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
    }

    /* Убедитесь, что чекбоксы идеально выровнены */
    input[type="checkbox"] {
      vertical-align: middle;
      position: relative;
      top: 0;
    }

    /* Сетка ПА */
    .pa-grid-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 400; display: flex; align-items: center; justify-content: center; }
    .pa-grid-card { 
      background: #fff; 
      border-radius: 12px; 
      width: 95%; 
      max-width: 900px; 
      max-height: 90vh; 
      overflow: hidden; 
      display: flex; 
      flex-direction: column;
    }
    .pa-grid-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #0f172a; color: #fff; font-weight: 600; }
    .pa-grid-body { 
      padding: 16px; 
      overflow-y: auto; 
      flex: 1;
      min-height: 0;
    }
    .pa-grid-legend { display: flex; gap: 16px; margin-bottom: 12px; font-size: 12px; color: #475569; }
    .pa-grid-legend span { display: flex; align-items: center; gap: 4px; }
    .pa-grid-legend .legend-dot { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }
    .legend-free { background: #d4edda; }
    .legend-assigned { background: #fff3cd; }
    .legend-done { background: #cce5ff; }
    .legend-selected { background: #3b82f6; border: 2px solid #1d4ed8; }
    
    .pa-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 8px; }
    .pa-grid-item { 
      padding: 10px 6px; 
      text-align: center; 
      border-radius: 6px; 
      cursor: pointer; 
      font-size: 13px; 
      font-weight: 600; 
      border: 2px solid transparent; 
      transition: all 0.15s; 
      user-select: none;
      position: relative;
    }
    .pa-grid-item:hover { transform: scale(1.05); }
    .pa-grid-item.free { background: #d4edda; color: #166534; }
    .pa-grid-item.assigned { background: #fff3cd; color: #92400e; }
    .pa-grid-item.done { background: #cce5ff; color: #1e40af; }
    .pa-grid-item.selected { border-color: #3b82f6; background: #3b82f6; color: #fff; box-shadow: 0 0 0 2px rgba(59,130,246,0.3); }
    .pa-grid-item .pa-count { display: block; font-size: 9px; font-weight: 400; margin-top: 2px; opacity: 0.8; }
    
    .pa-grid-actions { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #e2e8f0; justify-content: space-between; align-items: center; }
    .pa-grid-actions button { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .pa-grid-actions .btn-confirm { background: #22c55e; color: #fff; }
    .pa-grid-actions .btn-cancel { background: #e2e8f0; color: #334155; }
    .pa-grid-selected-info { font-size: 13px; color: #334155; }

    /* Исправления для формы запуска на ПА */
    .pa-input-row {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      width: 100%;
      align-items: center;
    }
    
    .pa-input-row input {
      flex: 1;
      min-width: 0;
      padding: 0 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      height: 40px;
      margin: 0;
      line-height: 40px;
    }
    
    .pa-input-row input:focus {
      border-color: #3b82f6;
    }
    
    .btn-pa-grid {
      padding: 0 10px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f1f5f9;
      color: #334155;
      cursor: pointer;
      font-size: 12px;
      height: 40px;
      white-space: nowrap;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto;
      min-width: 90px;
    }
    
    .btn-pa-grid:hover {
      background: #e2e8f0;
    }
    
    /* Исправление для кнопки закрытия в модалках */
    .pa-modal-close,
    .batch-fill-close,
    .pa-grid-close {
      width: 32px;
      height: 32px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      line-height: 1;
      background: transparent;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 16px;
      border-radius: 4px;
    }
    
    .pa-modal-close:hover,
    .batch-fill-close:hover,
    .pa-grid-close:hover {
      background: rgba(255,255,255,0.15);
    }
    
    /* Исправление для кнопки Сбросить */
    .ops-clear {
      padding: 0 10px;
      border: 1px solid #870a0a;
      border-radius: 4px;
      background: #e00d0d;
      color: #eaecef;
      cursor: pointer;
      font-size: 11px;
      flex: 0 0 auto;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
      width: auto;
      min-width: 70px;
    }
    
    .ops-clear:hover {
      background: #f76161;
    }

    /* Бейдж запуска */
    .launch-badge { 
      display: inline-flex; 
      align-items: center; 
      justify-content: center; 
      width: 20px; 
      height: 20px; 
      background: #fef3c7; 
      border-radius: 50%; 
      cursor: pointer; 
      font-size: 12px; 
      line-height: 1;
      flex: 0 0 auto;
      vertical-align: middle;
      border: 1px solid #f59e0b;
      color: #92400e;
    }
    
    /* ===== Sidebar ===== */
    .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 220px; background: #0f172a; color: #fff; z-index: 50; display: flex; flex-direction: column; transition: width 0.3s; overflow: hidden; }
    .sidebar.collapsed { width: 60px; }
    .sidebar-header { display: flex; align-items: center; gap: 10px; padding: 16px 14px; font-size: 15px; font-weight: 600; white-space: nowrap; }
    .sidebar-logo { font-size: 20px; flex: 0 0 auto; }
    .sidebar-title { opacity: 1; transition: opacity 0.2s; }
    .sidebar.collapsed .sidebar-title { opacity: 0; }
    .sidebar-nav { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
    .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; color: #94a3b8; white-space: nowrap; transition: background 0.2s, color 0.2s; }
    .sidebar-item:hover { background: #e2e8f0; color: #0f172a; }
    .sidebar-item.active { background: #3b82f6; color: #fff; }
    .sidebar-item.active:hover { background: #3b82f6; color: #fff; }
    .sidebar-icon { font-size: 18px; width: 24px; text-align: center; flex: 0 0 auto; }
    .sidebar-label { font-size: 14px; }
    .sidebar.collapsed .sidebar-label { display: none; }
    .sidebar-footer { padding: 12px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 8px; }
    .sidebar-footer .user { font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sidebar-toggle { padding: 8px 12px; border: none; border-radius: 6px; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer; font-size: 13px; white-space: nowrap; }
    .sidebar-toggle:hover { background: rgba(255,255,255,0.2); }
    
    /* ===== Layout ===== */
    .content { margin-left: 220px; transition: margin-left 0.3s; min-height: 100vh; }
    .content.sidebar-collapsed { margin-left: 60px; }
    .section { display: none; }
    .section.active { display: block; }
    
    /* ===== Section cards ===== */
    .section-card { background: #fff; border-radius: 12px; padding: 16px; margin: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .section-title { font-size: 16px; color: #0f172a; margin-bottom: 12px; }
    .section-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .section-title-row .section-title { margin-bottom: 0; }
    .btn-ghost { padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; cursor: pointer; font-size: 13px; }
    .btn-ghost:hover { background: #e2e8f0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    .kpi-card { background: #f8fafc; border-radius: 10px; padding: 16px; text-align: center; }
    .kpi-value { font-size: 28px; font-weight: 700; color: #0f172a; }
    .kpi-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .progress-track { background: #e2e8f0; border-radius: 8px; height: 10px; overflow: hidden; }
    .progress-fill { background: #3b82f6; height: 100%; border-radius: 8px; transition: width 0.3s; }
    .progress-fill.green { background: #22c55e; }
    .agg-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; flex-wrap: wrap; }
    .agg-row:last-child { border-bottom: none; }
    .agg-name { font-weight: 600; color: #0f172a; font-size: 14px; min-width: 200px; }
    .agg-meta { font-size: 12px; color: #94a3b8; }
    .agg-bar { flex: 1; min-width: 160px; }
    .agg-pct { font-size: 12px; color: #64748b; min-width: 40px; text-align: right; }
    .agg-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    .agg-table th { background: #f1f5f9; padding: 8px 10px; text-align: left; color: #64748b; }
    .agg-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
    .print-job { padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; }
    .print-job .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px; }
    .print-job .num { font-weight: 600; color: #0f172a; }
    .print-job .meta { font-size: 13px; color: #64748b; }
    .pa-load-detail { margin-top: 16px; display: none; background: #f8fafc; border-radius: 8px; padding: 12px; }
    .pa-load-detail.show { display: block; }
    .status-chip { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .status-chip-- { background: #f1f5f9; color: #64748b; }
    .status-chip-К { background: #fef3c7; color: #92400e; }
    .status-chip-Выдано { background: #dbeafe; color: #1d4ed8; }
    .status-chip-В { background: #fff3cd; color: #92400e; }
    .status-chip-Готово { background: #d4edda; color: #166534; }

    /* ===== Dashboard: ПА ===== */
    .legend-partial { background: #fed7aa; }
    .pa-grid-item.partial { background: #fed7aa; color: #9a3412; }
    .pa-grid-item.partial:hover { transform: scale(1.05); }

    /* ===== Dashboard: Узлы ===== */
    .unit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .unit-card { background: #f8fafc; border-radius: 10px; padding: 14px 16px; border: 1px solid #e2e8f0; }
    .unit-card.warn { border-color: #ef4444; background: #fef2f2; }
    .unit-card-name { font-weight: 600; color: #0f172a; font-size: 14px; margin-bottom: 8px; }
    .unit-card-kpis { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #64748b; margin-bottom: 8px; }
    .unit-card-kpis b { color: #0f172a; }
    .unit-card-pct { margin-left: auto; font-weight: 700; color: #0f172a; }

    /* ===== Dashboard: Операции ===== */
    .op-list { display: flex; flex-direction: column; gap: 10px; }
    .op-row { display: flex; align-items: center; gap: 12px; }
    .op-row-label { min-width: 140px; font-size: 13px; color: #334155; font-weight: 500; }
    .op-row-track { flex: 1; height: 18px; background: #e2e8f0; border-radius: 9px; overflow: hidden; }
    .op-row-fill { height: 100%; border-radius: 9px; transition: width 0.3s; min-width: 4px; }
    .op-row-pct { min-width: 90px; text-align: right; font-size: 12px; color: #64748b; }
    
  </style>
  
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-logo">🔧</span>
      <span class="sidebar-title">ЦифровойНаряд</span>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-item active" data-section="operational" onclick="showSection('operational')">
        <span class="sidebar-icon">📋</span>
        <span class="sidebar-label">Оперативный</span>
      </div>
      <div class="sidebar-item" data-section="dashboard" onclick="showSection('dashboard')">
        <span class="sidebar-icon">📊</span>
        <span class="sidebar-label">Аналитика</span>
      </div>
      <div class="sidebar-item" data-section="paLoad" onclick="showSection('paLoad')">
        <span class="sidebar-icon">🏭</span>
        <span class="sidebar-label">Загрузка ПА</span>
      </div>
      <div class="sidebar-item" data-section="units" onclick="showSection('units')">
        <span class="sidebar-icon">📦</span>
        <span class="sidebar-label">Узлы</span>
      </div>
      <div class="sidebar-item" data-section="operations" onclick="showSection('operations')">
        <span class="sidebar-icon">⚙️</span>
        <span class="sidebar-label">Типы обработки</span>
      </div>
      <div class="sidebar-item" data-section="print" onclick="showSection('print')">
        <span class="sidebar-icon">🖨️</span>
        <span class="sidebar-label">Печать</span>
      </div>
    </nav>
    <div class="sidebar-footer">
      <div class="user">👤 ${safeName}</div>
      <button id="sidebarToggleBtn" class="sidebar-toggle" onclick="toggleSidebar()">◀ Свернуть</button>
    </div>
  </aside>
  <main class="content" id="mainContent">
  <div class="header">
    <div>
      <div class="title">📋 Планирование запуска</div>
      <div class="user">👤 ${safeName}</div>
    </div>
    <a href="?page=login" onclick="event.preventDefault();try{localStorage.removeItem('nd_login');localStorage.removeItem('nd_password');}catch(e){}setTimeout(function(){window.top.location.href='${appBaseUrl()}'+'?page=login';},80);" class="logout">Выйти</a>
  </div>
  
  <div id="section-operational" class="section active">
  <div class="filters">
    <select id="filterUnit" onchange="treeUnitChange()">
      <option value="">Все узлы</option>
    </select>
    <button onclick="loadCatalog()">🔄 Обновить</button>
    <button onclick="expandAllTree()">📂 Развернуть всё</button>
    <button onclick="collapseAllTree()">📁 Свернуть всё</button>
    <span id="countLabel" style="font-size:12px;color:#64748b;"></span>
  </div>

  <div class="ops-filter" id="opsFilter">
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="cutting" onchange="applyOpFilter()"> Резка</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="thermo" onchange="applyOpFilter()"> Термо</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="plasma" onchange="applyOpFilter()"> Плазма</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="turning" onchange="applyOpFilter()"> Токарная</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="milling" onchange="applyOpFilter()"> Фрезерная</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="drilling" onchange="applyOpFilter()"> Сверлильная</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="metalwork" onchange="applyOpFilter()"> Слесарная</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="bending" onchange="applyOpFilter()"> Гибка</label>
    <label class="ops-filter-item"><input type="checkbox" class="ops-check" value="coating" onchange="applyOpFilter()"> Покрытие</label>
    <button class="ops-clear" onclick="clearOpFilter()">Сбросить</button>
  </div>

  <div class="search-bar" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #fff; position: sticky; top: 108px; z-index: 8; width: 100%; box-sizing: border-box;">
    <input type="text" id="searchInput" placeholder="🔍 Поиск по коду или наименованию..." oninput="onSearch(this.value)" style="flex: 1; height: 40px; padding: 0 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; min-width: 0; box-sizing: border-box; margin: 0; display: block;">
    <span onclick="clearSearch()" style="width: 40px; height: 40px; min-width: 40px; padding: 0; margin: 0; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 40px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f1f5f9; cursor: pointer; font-size: 14px; box-sizing: border-box; line-height: 1; user-select: none;">✕</span>
  </div>
  
  <div class="container" id="planningList">
    <div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>
  </div>

  <div class="pa-modal" id="paModal" style="display:none;">
    <div class="pa-modal-card">
      <div class="pa-modal-header">
        <span>🚀 Запуск на ПА</span>
        <button class="pa-modal-close" onclick="closePaModal()">✕</button>
      </div>
      <div class="pa-modal-body">
        <div class="pa-info" id="paInfo"></div>
        <label class="field-label">Номера ПА</label>
        <div class="pa-input-row">
          <input type="text" id="paNumbers" placeholder="Например: 001 или 009-011" oninput="checkPaNumbers()">
          <button class="btn-pa-grid" onclick="openPaGrid()">📊 Сетка ПА</button>
        </div>
        <label class="field-label">Кол-во</label>
        <div class="qty-mode" style="margin-bottom:6px;">
          <label style="display:block;font-size:13px;margin-bottom:4px;"><input type="radio" name="qtyMode" value="auto" checked onchange="onQtyModeChange()" id="qtyModeAuto"> Автоматически: <b id="autoQtyLabel">0</b> шт.</label>
          <label style="display:block;font-size:13px;"><input type="radio" name="qtyMode" value="manual" onchange="onQtyModeChange()" id="qtyModeManual"> Вручную: <input type="number" id="paQty" style="width:90px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;display:none;" placeholder="Кол-во"></label>
        </div>
        <div class="pa-hint" id="paHint"></div>
        <div class="pa-modal-actions">
          <button onclick="confirmPaLaunch()">✅ Запустить</button>
          <button onclick="closePaModal()">Отмена</button>
        </div>
      </div>
    </div>
  </div>

    <!-- Модалка сетки ПА -->
  <div class="pa-grid-modal" id="paGridModal" style="display:none;">
    <div class="pa-grid-card">
      <div class="pa-grid-header">
        <span>📊 Сетка ПА (подъёмные агрегаты)</span>
        <button class="pa-grid-close" onclick="closePaGrid()">✕</button>
      </div>
      <div class="pa-grid-body">
        <div class="pa-grid-legend">
          <span><span class="legend-dot legend-free"></span> Свободен</span>
          <span><span class="legend-dot legend-assigned"></span> Назначен</span>
          <span><span class="legend-dot legend-done"></span> Готово</span>
          <span><span class="legend-dot legend-selected"></span> Выбран</span>
        </div>
        <div class="pa-grid" id="paGrid">
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">Загрузка...</div>
        </div>
      </div>
      <div class="pa-grid-actions">
        <span class="pa-grid-selected-info" id="paGridSelectedInfo">Выбрано: 0 ПА</span>
        <div>
          <button class="btn-cancel" onclick="closePaGrid()">Отмена</button>
          <button class="btn-confirm" onclick="confirmPaGridSelection()">✅ Подтвердить выбор</button>
        </div>
      </div>
    </div>
  </div>
  
  <div class="batch-bar" id="batchBar">
    Выбрано: <span id="batchCount">0</span> позиций
    <button class="btn-launch" onclick="batchSetStatus('К запуску')">🚀 В запуск</button>
    <button onclick="clearSelection()">Отмена</button>
  </div>
  </div>
  
  <div id="section-dashboard" class="section">
    <div class="section-card">
      <div class="section-title-row">
        <h3 class="section-title">📊 Аналитика</h3>
        <div style="display:flex;align-items:center;gap:10px;">
          <span id="dashUpdated" style="font-size:12px;color:#94a3b8;"></span>
          <button class="btn-ghost" onclick="loadDashboard()">🔄 Обновить</button>
        </div>
      </div>
      <div class="kpi-grid" id="dashKpis"></div>
    </div>
    <div class="section-card">
      <h3 class="section-title">🏭 Загрузка ПА</h3>
      <div class="pa-grid-legend">
        <span><span class="legend-dot legend-free"></span> Свободен</span>
        <span><span class="legend-dot legend-assigned"></span> Назначен</span>
        <span><span class="legend-dot legend-partial"></span> Частично готов</span>
        <span><span class="legend-dot legend-done"></span> Готово</span>
      </div>
      <div class="pa-grid" id="dashPaGrid"></div>
      <div id="dashPaDetail" class="pa-load-detail"></div>
    </div>
    <div class="section-card">
      <h3 class="section-title">📦 Загрузка по узлам</h3>
      <div class="unit-grid" id="dashUnits"></div>
    </div>
    <div class="section-card">
      <h3 class="section-title">⚙️ Загрузка по типам обработки</h3>
      <div id="dashOps"></div>
    </div>
    
    <div class="section-card" id="historyBlock">
      <div class="section-title-row">
        <h3 class="section-title">📜 История запусков</h3>
        <div style="display:flex;align-items:center;gap:10px;">
          <span id="histInfo" style="font-size:12px;color:#94a3b8;"></span>
          <button class="btn-ghost" onclick="loadLaunchesHistory()">🔄 Обновить</button>
        </div>
      </div>
      <div class="filters" style="position:static;">
        <select id="histStatus" onchange="loadLaunchesHistory()">
          <option value="">Все статусы</option>
          <option value="К запуску">К запуску</option>
          <option value="Выдано">Выдано</option>
          <option value="В работе">В работе</option>
          <option value="Готово">Готово</option>
        </select>
        <input type="text" id="histSearch" placeholder="🔍 Код или наименование" onkeydown="if(event.key==='Enter')loadLaunchesHistory();">
        <input type="date" id="histDateFrom" title="Дата с" onchange="loadLaunchesHistory()">
        <input type="date" id="histDateTo" title="Дата по" onchange="loadLaunchesHistory()">
        <button onclick="loadLaunchesHistory()">Найти</button>
        <button class="ops-clear" onclick="clearHistFilters()">Сброс</button>
      </div>
      <div id="histTableWrap"><div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div></div>
      <div id="histPager" style="display:none;justify-content:space-between;align-items:center;padding:8px 0 0;"></div>
    </div>
  </div>
  
  <!-- Модалка редактирования запуска -->
  <div class="pa-modal" id="editLaunchModal" style="display:none;">
    <div class="pa-modal-card">
      <div class="pa-modal-header">
        <span>✏️ Редактирование запуска</span>
        <button class="pa-modal-close" onclick="closeEditLaunch()">✕</button>
      </div>
      <div class="pa-modal-body">
        <div id="editLaunchInfo" style="font-size:13px;color:#64748b;margin-bottom:10px;"></div>
        <label class="field-label">Номера ПА</label>
        <input type="text" id="editPaNumbers" placeholder="Например: 001 или 009-011" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:10px;box-sizing:border-box;">
        <label class="field-label">Кол-во</label>
        <input type="number" id="editQty" min="0" style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;margin-bottom:10px;box-sizing:border-box;">
        <div id="editLaunchHint" style="font-size:12px;color:#b45309;margin-bottom:10px;"></div>
        <div class="pa-modal-actions">
          <button onclick="confirmEditLaunch()">✅ Сохранить</button>
          <button onclick="closeEditLaunch()">Отмена</button>
        </div>
      </div>
    </div>
  </div>
  
  <div id="section-paLoad" class="section">
    <div class="section-card">
      <h3 class="section-title">🏭 Загрузка ПА</h3>
      <div class="pa-grid-legend">
        <span><span class="legend-dot legend-free"></span> Свободен</span>
        <span><span class="legend-dot legend-assigned"></span> Назначен</span>
        <span><span class="legend-dot legend-done"></span> Готово</span>
      </div>
      <div class="pa-grid" id="paLoadGrid"></div>
      <div id="paLoadDetail" class="pa-load-detail"></div>
    </div>
  </div>
  
  <div id="section-units" class="section">
    <div class="section-card">
      <h3 class="section-title">📦 Сводка по узлам</h3>
      <div id="unitsList"></div>
    </div>
  </div>
  
  <div id="section-operations" class="section">
    <div class="section-card">
      <h3 class="section-title">⚙️ Типы обработки</h3>
      <div id="opsSummaryList"></div>
    </div>
  </div>
  
  <div id="section-print" class="section">
    <div class="section-card">
      <div class="section-title-row">
        <h3 class="section-title">🖨️ Очередь печати</h3>
        <button class="btn-ghost" onclick="loadPrint()">🔄 Обновить</button>
      </div>
      <div id="printQueueList"></div>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  </main>
  
  <script>
    const MASTER_NAME = ${JSON.stringify(safeName)};
    let allData = [];
    let selectedRows = new Set();
    let currentSection = 'operational';
    let expandedNodes = new Set(); // Для сохранения состояния раскрытия
    
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, 2500);
    }

    let searchQuery = '';

    let activeOpFilters = new Set();

    let currentTree = [];          // текущее построенное дерево (для expand/collapse all)
    let treePage = 1;              // текущая страница дерева
    const treePageSize = 50;       // корневых веток на страницу

    let currentLaunchItems = [];
    let occupiedPA = {};
    let currentUnit = null;
    let currentQtyPerParent = 0;
    let isBatchLaunch = false;
    
    function loadOccupiedPA() {
      google.script.run
        .withSuccessHandler(function(data) {
          occupiedPA = data || {};
        })
        .getOccupiedPANumbers();
    }
    
    function applyOpFilter() {
      activeOpFilters.clear();
      document.querySelectorAll('.ops-check:checked').forEach(function(cb) {
        activeOpFilters.add(cb.value);
      });
      treePage = 1;
      renderTree();
    }
    
    function clearOpFilter() {
      document.querySelectorAll('.ops-check').forEach(function(cb) { cb.checked = false; });
      activeOpFilters.clear();
      treePage = 1;
      renderTree();
    }
    
    function onSearch(query) {
      searchQuery = query.toLowerCase().trim();
      treePage = 1;
      renderTree();
    }
    
    function clearSearch() {
      document.getElementById('searchInput').value = '';
      searchQuery = '';
      treePage = 1;
      renderTree();
    }
    
    function treeUnitChange() {
      treePage = 1;
      renderTree();
    }
    
    function computeType(code) {
      if (!code) return 'Группа';
      if (code.indexOf('.') > -1) return 'Сборка';
      if (code.indexOf('|') > -1) return 'ПКИ';
      if (code.indexOf('/') > -1) return 'Деталь';
      return 'Группа';
    }
    
    function computeUnit(code, map) {
      const parts = [];
      let current = '';
      const s = String(code || '');
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '.' || ch === '/' || ch === '|') {
          if (current && map[current] !== undefined) parts.push(current);
        }
        current += ch;
      }
      return parts.join(' / ');
    }
    
    function enrichCatalog(data) {
      const map = {};
      data.forEach(function(it) { if (it.code) map[it.code] = it.name; });
      data.forEach(function(it) {
        it.type = computeType(it.code);
        it.unit = computeUnit(it.code, map);
        it.qtyPerParent = Number(it.qtyPerParent) || 0;
      });
      return data;
    }
    
    function loadCatalog() {
      document.getElementById('planningList').innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';

      if (document.getElementById('searchInput').value) {
        searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
      }
      
        google.script.run
        .withSuccessHandler(function(data) {
          allData = enrichCatalog(data || []);
          loadUnits();
          treePage = 1;
          renderTree();
        })
        .withFailureHandler(function(e) {
          document.getElementById('planningList').innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Ошибка загрузки</p></div>';
        })
        .getCatalogForMaster();
    }

    function loadUnits() {
      const units = new Set();
      allData.forEach(function(it) {
        if (it.unit) units.add(it.unit);
      });
      const sel = document.getElementById('filterUnit');
      const prev = sel.value;
      sel.innerHTML = '<option value="">Все узлы</option>';
      Array.from(units).sort().forEach(function(u) {
        sel.innerHTML += '<option value="' + u + '">' + u + '</option>';
      });
      sel.value = prev;
    }
    
    // Строим дерево
    function buildTree(items) {
      const map = {};
      const roots = [];
      
      // Создаём узлы
      items.forEach(function(item) {
        map[item.code] = {
          item: item,
          children: [],
          depth: (item.code.match(/[.\\/]/g) || []).length
        };
      });
      
      // Находим родителей
      items.forEach(function(item) {
        const node = map[item.code];
        let parentCode = null;
        
        const lastDot = item.code.lastIndexOf('.');
        const lastSlash = item.code.lastIndexOf('/');
        const lastSep = Math.max(lastDot, lastSlash);
        
        if (lastSep > -1) {
          parentCode = item.code.substring(0, lastSep);
        }
        
        if (parentCode && map[parentCode]) {
          map[parentCode].children.push(node);
        } else {
          roots.push(node);
        }
      });
      
      // Сортируем детей по коду
      function sortChildren(node) {
        node.children.sort(function(a, b) {
          return a.item.code.localeCompare(b.item.code, undefined, {numeric: true});
        });
        node.children.forEach(sortChildren);
      }
      
      roots.forEach(sortChildren);
      
      return roots;
    }
    
    function renderTree() {
      const container = document.getElementById('planningList');
      const filterUnit = document.getElementById('filterUnit').value;
      
      let filtered = allData;
      if (filterUnit) {
        filtered = allData.filter(function(item) {
          return item.unit && item.unit.indexOf(filterUnit) !== -1;
        });
      }
      
      // Поиск — сохраняем иерархию: включаем предков найденных узлов
      if (searchQuery) {
        var matched = filtered.filter(function(item) {
          const code = String(item.code || '').toLowerCase();
          const name = String(item.name || '').toLowerCase();
          return code.indexOf(searchQuery) !== -1 || name.indexOf(searchQuery) !== -1;
        });
        var byCode = {};
        allData.forEach(function(it) { byCode[it.code] = it; });
        var result = [];
        var seen = {};
        matched.forEach(function(item) {
          // восходим по коду, добавляя всех существующих предков
          var code = item.code;
          while (code && !seen[code]) {
            if (byCode[code]) {
              seen[code] = true;
              result.push(byCode[code]);
              // авто-раскрываем предков найденного узла
              if (code !== item.code) expandedNodes.add('node-' + code);
            }
            const lastDot = code.lastIndexOf('.');
            const lastSlash = code.lastIndexOf('/');
            const lastSep = Math.max(lastDot, lastSlash);
            if (lastSep === -1) break;
            code = code.substring(0, lastSep);
          }
        });
        filtered = result;
      }
      // Фильтр по типам обработки (ИЛИ)
      if (activeOpFilters.size > 0) {
        filtered = filtered.filter(function(item) {
          return Array.from(activeOpFilters).some(function(op) {
            const val = item[op];
            return val === '+' || val === '1' || val === 'ДА';
          });
        });
      }
      
      document.getElementById('countLabel').textContent = 'Позиций: ' + filtered.length;
      
      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>Ничего не найдено</p></div>';
        return;
      }
      
      const tree = buildTree(filtered);
      currentTree = tree;

      // Пагинация по корневым веткам
      const treeTotalPages = Math.max(Math.ceil(tree.length / treePageSize), 1);
      if (treePage > treeTotalPages) treePage = treeTotalPages;
      const pageStart = (treePage - 1) * treePageSize;
      const pageRoots = tree.slice(pageStart, pageStart + treePageSize);

      let html = '';
      pageRoots.forEach(function(node) {
        html += renderNode(node, 0);
      });

      if (treeTotalPages > 1) {
        html += '<div class="tree-pagination" style="display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 0;font-size:13px;color:#64748b;">' +
          '<button class="btn" onclick="treePagePrev()" ' + (treePage <= 1 ? 'disabled' : '') + '>← Пред.</button>' +
          '<span>Веток: ' + tree.length + ' • Стр. ' + treePage + '/' + treeTotalPages + '</span>' +
          '<button class="btn" onclick="treePageNext()" ' + (treePage >= treeTotalPages ? 'disabled' : '') + '>След. →</button>' +
          '</div>';
      }

      container.innerHTML = html;
      
      // Восстанавливаем состояние раскрытия
      document.querySelectorAll('[data-node-id]').forEach(function(el) {
        const id = el.getAttribute('data-node-id');
        if (expandedNodes.has(id)) {
          const children = el.parentElement.querySelector('.tree-children');
          if (children) {
            children.style.display = 'block';
            const arrow = el.querySelector('.tree-arrow');
            if (arrow) arrow.textContent = '▼';
          }
        }
      });
      
      updateBatchBar();
    }
    
    function treePagePrev() {
      if (treePage > 1) { treePage--; renderTree(); }
    }
    
    function treePageNext() {
      treePage++; renderTree();
    }
    
    function collectBranchCodes(nodes, out) {
      nodes.forEach(function(node) {
        if (node.children.length > 0) {
          out.push('node-' + node.item.code);
          collectBranchCodes(node.children, out);
        }
      });
    }
    
    function expandAllTree() {
      const ids = [];
      collectBranchCodes(currentTree, ids);
      ids.forEach(function(id) { expandedNodes.add(id); });
      renderTree();
    }
    
    function collapseAllTree() {
      expandedNodes.clear();
      renderTree();
    }
    
    function renderNode(node, level) {
      const item = node.item;
      const isGroup = item.type === 'Группа';
      const isAssembly = item.type === 'Сборка';
      const isDetail = item.type === 'Деталь' || item.type === 'ПКИ';
      const hasChildren = node.children.length > 0;
      const nodeId = 'node-' + item.code;
      
      let html = '';
      
      if (isGroup) {
        // Группа/подгруппа — только заголовок
        html += '<div class="tree-group" style="padding-left:' + (level * 16) + 'px">';
        html += '<div class="tree-group-header" data-node-id="' + nodeId + '" onclick="toggleTreeNode(this)">';
        html += '<span class="tree-arrow">▶</span> ';
        html += '<span class="tree-icon">📁</span> ';
        html += '<span class="tree-name">' + (item.name || item.code) + '</span>';
        html += '<span class="tree-type">' + item.type + '</span>';
        html += '</div>';
        html += '<div class="tree-children" style="display:none">';
        node.children.forEach(function(child) {
          html += renderNode(child, level + 1);
        });
        html += '</div>';
        html += '</div>';
      } else if (isAssembly) {
        // Сборка — можно выбрать для запуска
        const isSelected = selectedRows.has(item.code);
        
        html += '<div class="tree-assembly" style="padding-left:' + (level * 16) + 'px">';
        html += '<div class="tree-assembly-header" data-node-id="' + nodeId + '">';
        if (hasChildren) {
          html += '<span class="tree-arrow" onclick="toggleAssemblyKids(this)">▶</span> ';
        } else {
          html += '<span style="width:16px;display:inline-block"></span> ';
        }
        html += '<input type="checkbox" class="card-check" data-code="' + item.code + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleAssembly(this, ' + item.code + ')" onclick="event.stopPropagation()">';
        html += '<span class="tree-icon">🔩</span> ';
        html += '<span class="tree-name">' + (item.name || item.code) + '</span>';
        html += '<span class="tree-type">СБОРКА</span>';
        html += ' <button class="btn-launch-single" data-code="' + item.code + '" onclick="openLaunchModal(this)">🚀</button>';
        html += '</div>';
        
        // Детали сборки
        if (hasChildren) {
          html += '<div class="tree-children" style="display:none">';
          node.children.forEach(function(child) {
            html += renderNode(child, level + 1);
          });
          html += '</div>';
        }
        html += '</div>';
      } else {
        // Деталь/ПКИ
        const isSelected = selectedRows.has(item.code);
        
        html += '<div class="tree-detail" style="padding-left:' + (level * 16) + 'px">';
        html += '<div class="tree-detail-row">';
        html += '<span style="width:16px;display:inline-block"></span> ';
        html += '<input type="checkbox" class="card-check" data-code="' + item.code + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleDetail(this, ' + item.code + ')" onclick="event.stopPropagation()">';
        html += '<span class="tree-icon">⚙️</span> ';
        html += '<span class="tree-code">' + (item.code || '—') + '</span> ';
        html += '<span class="tree-name">' + (item.name || '—') + '</span>';
        html += ' <button class="btn-launch-single" data-code="' + item.code + '" onclick="openLaunchModal(this)">🚀</button>';
        
        // Типы обработки
        html += '<span class="tree-ops">';
        const ops = [
          { name: 'Рез', val: item.cutting },
          { name: 'Тер', val: item.thermo },
          { name: 'Пла', val: item.plasma },
          { name: 'Ток', val: item.turning },
          { name: 'Фре', val: item.milling },
          { name: 'Све', val: item.drilling },
          { name: 'Сле', val: item.metalwork },
          { name: 'Гиб', val: item.bending },
          { name: 'Пок', val: item.coating }
        ];
        ops.forEach(function(op) {
          const isYes = op.val === '+' || op.val === '1';
          html += '<span class="op-tag ' + (isYes ? 'op-yes' : 'op-no') + '">' + op.name + '</span>';
        });
        html += '</span>';
        
        html += '<span class="tree-material">' + (item.material || '') + '</span>';
        if (item.priority) html += '<span class="tree-priority">⭐' + item.priority + '</span>';
        html += '</div>';
        html += '</div>';
      }
      
      return html;
    }
    
    function toggleTreeNode(header) {
      const nodeId = header.getAttribute('data-node-id');
      const arrow = header.querySelector('.tree-arrow');
      const children = header.parentElement.querySelector('.tree-children');
      
      if (children) {
        if (children.style.display === 'none') {
          children.style.display = 'block';
          arrow.textContent = '▼';
          expandedNodes.add(nodeId);
        } else {
          children.style.display = 'none';
          arrow.textContent = '▶';
          expandedNodes.delete(nodeId);
        }
      }
    }
    
    function toggleAssemblyKids(arrow) {
      const parentHeader = arrow.closest('.tree-assembly-header');
      const nodeId = parentHeader.getAttribute('data-node-id');
      const children = parentHeader.parentElement.querySelector('.tree-children');
      
      if (children) {
        if (children.style.display === 'none') {
          children.style.display = 'block';
          arrow.textContent = '▼';
          expandedNodes.add(nodeId);
        } else {
          children.style.display = 'none';
          arrow.textContent = '▶';
          expandedNodes.delete(nodeId);
        }
      }
    }
    
    function toggleAssembly(cb, code) {
      const checked = cb.checked;
      const assembly = cb.closest('.tree-assembly');
      
      if (checked) {
        selectedRows.add(code);
      } else {
        selectedRows.delete(code);
      }
      
      // Каскад вниз: отмечаем/снимаем все вложенные чекбоксы.
      if (assembly) {
        assembly.querySelectorAll('.card-check').forEach(function(dc) {
          dc.checked = checked;
          const codeAttr = dc.getAttribute('data-code');
          if (codeAttr) {
            if (checked) {
              selectedRows.add(codeAttr);
            } else {
              selectedRows.delete(codeAttr);
            }
          }
        });
      }
      updateBatchBar();
    }
    
    function toggleDetail(cb, code) {
      if (cb.checked) {
        selectedRows.add(code);
      } else {
        selectedRows.delete(code);
      }
      updateBatchBar();
    }
    
    function updateBatchBar() {
      const bar = document.getElementById('batchBar');
      const count = selectedRows.size;
      document.getElementById('batchCount').textContent = count;
      bar.classList.toggle('active', count > 0);
    }
    
    function clearSelection() {
      selectedRows.clear();
      document.querySelectorAll('.card-check').forEach(function(c) { c.checked = false; });
      updateBatchBar();
    }
    
    function getStatusClass(status) {
      if (!status || status === '—') return '--';
      if (status === 'К запуску') return 'К';
      if (status === 'Выдано') return 'Выдано';
      if (status === 'В работе') return 'В';
      return 'Готово';
    }
    
    function checkPaNumbers() {
      const input = document.getElementById('paNumbers').value.trim();
      const hint = document.getElementById('paHint');
      
      if (!input) {
        hint.textContent = '';
        hint.className = 'pa-hint';
        return;
      }
      
      // Разбираем ввод
      const numbers = parsePaInput(input);
      const conflicts = numbers.filter(function(n) { return occupiedPA[n]; });
      
      if (conflicts.length > 0) {
        hint.textContent = '⚠ Заняты: ' + conflicts.join(', ');
        hint.className = 'pa-hint danger';
      } else {
        hint.textContent = '✓ Все номера свободны';
        hint.className = 'pa-hint';
      }
      
      updatePaInfoFromInput();
    }
    
    function parsePaInput(input) {
      const result = [];
      input.split(',').forEach(function(part) {
        part = part.trim();
        if (!part) return;
        
        if (part.indexOf('-') > -1) {
          const parts = part.split('-');
          const start = parseInt(parts[0]);
          const end = parseInt(parts[1]);
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let n = start; n <= end; n++) {
              result.push(String(n).padStart(3, '0'));
            }
          }
        } else if (!isNaN(parseInt(part))) {
          result.push(String(parseInt(part)).padStart(3, '0'));
        }
      });
      return result;
    }

    // ============ Сетка ПА ============
    let paGridData = [];
    let selectedPaInGrid = new Set();
    
    function openPaGrid() {
      const modal = document.getElementById('paGridModal');
      modal.style.display = 'flex';
      loadPaGrid();
    }
    
    function closePaGrid() {
      document.getElementById('paGridModal').style.display = 'none';
      selectedPaInGrid.clear();
      paGridData = [];
    }
    
    function loadPaGrid() {
      const gridContainer = document.getElementById('paGrid');
      gridContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">Загрузка...</div>';
      
      google.script.run
        .withSuccessHandler(function(data) {
          paGridData = data || [];
          renderPaGrid();
        })
        .withFailureHandler(function(e) {
          gridContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">Ошибка загрузки</div>';
        })
        .getPAGridData();
    }
    
    function renderPaGrid() {
      const gridContainer = document.getElementById('paGrid');
      
      if (paGridData.length === 0) {
        gridContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">Нет данных</div>';
        return;
      }
      
      let html = '';
      paGridData.forEach(function(pa) {
        const isSelected = selectedPaInGrid.has(pa.paNumber);
        const statusClass = isSelected ? 'selected' : pa.status;
        const launchCount = pa.launches.length;
        const countText = launchCount > 0 ? launchCount + ' зап.' : '';
        
        html += '<div class="pa-grid-item ' + statusClass + '" data-pa="' + pa.paNumber + '" onclick="togglePaInGrid(this)" data-pa-num="' + pa.paNumber + '">';
        html += pa.paNumber;
        if (countText) {
          html += '<span class="pa-count">' + countText + '</span>';
        }
        html += '</div>';
      });
      
      gridContainer.innerHTML = html;
      updatePaGridSelectedInfo();
    }
    
    function togglePaInGrid(element) {
      const paNumber = element.getAttribute('data-pa-num');
      if (!paNumber) return;
      
      if (selectedPaInGrid.has(paNumber)) {
        selectedPaInGrid.delete(paNumber);
      } else {
        selectedPaInGrid.add(paNumber);
      }
      
      const pa = paGridData.find(function(p) { return p.paNumber === paNumber; });
      if (pa) {
        const isSelected = selectedPaInGrid.has(paNumber);
        element.className = 'pa-grid-item ' + (isSelected ? 'selected' : pa.status);
      }
      
      updatePaGridSelectedInfo();
    }
    
    function updatePaGridSelectedInfo() {
      const count = selectedPaInGrid.size;
      document.getElementById('paGridSelectedInfo').textContent = 'Выбрано: ' + count + ' ПА';
    }
    
    function confirmPaGridSelection() {
      if (selectedPaInGrid.size === 0) {
        showToast('❌ Выберите хотя бы один ПА');
        return;
      }
      
      const sortedPa = Array.from(selectedPaInGrid).sort();
      const paString = sortedPa.join(', ');
      
      document.getElementById('paNumbers').value = paString;
      checkPaNumbers();
      closePaGrid();
    }

    function openLaunchModal(btnOrCode) {
      let code;
      let item = null;
      
      if (typeof btnOrCode === 'string') {
        code = btnOrCode;
        item = allData.find(function(d) { return d.code === code; });
      } else {
        code = btnOrCode.getAttribute('data-code');
        item = allData.find(function(d) { return d.code === code; });
      }
      
      if (!item) return;
      
      currentLaunchItems = [item];
      isBatchLaunch = false;
      
      document.getElementById('paInfo').innerHTML =
        '<b>' + (item.name || '—') + '</b><br>' +
        'Код: ' + (item.code || '—') + '<br>' +
        'Узел: ' + (item.unit || '—') + '<br>' +
        'Кол-во на родителя: ' + (item.qtyPerParent || 0) + ' шт.';
      
      document.getElementById('paNumbers').value = '';
      document.getElementById('paHint').textContent = '';
      document.getElementById('paHint').className = 'pa-hint';
      
      currentUnit = item.unit;
      currentQtyPerParent = item.qtyPerParent || 0;
      
      document.getElementById('qtyModeAuto').checked = true;
      document.getElementById('paQty').value = '';
      document.getElementById('paQty').style.display = 'none';
      
      loadOccupiedPA();
      document.getElementById('paModal').style.display = 'flex';
      onQtyModeChange();
    }
    
    function onQtyModeChange() {
      const auto = document.getElementById('qtyModeAuto').checked;
      document.getElementById('paQty').style.display = auto ? 'none' : 'inline-block';
      recalcAutoQty();
    }
    
    function recalcAutoQty() {
      const numbers = parsePaInput(document.getElementById('paNumbers').value.trim());
      const per = currentQtyPerParent || 0;
      let total = 0;
      if (currentLaunchItems.length > 0) {
        total = currentLaunchItems.reduce(function(acc, it) {
          return acc + ((it.qtyPerParent || 0) * numbers.length);
        }, 0);
      } else {
        total = per * numbers.length;
      }
      document.getElementById('autoQtyLabel').textContent = total;
    }
    
    function updatePaInfoFromInput() {
      if (!isBatchLaunch && currentLaunchItems.length > 0) {
        const item = currentLaunchItems[0];
        const numbers = parsePaInput(document.getElementById('paNumbers').value.trim());
        document.getElementById('paInfo').innerHTML =
          '<b>' + (item.name || '—') + '</b><br>' +
          'Код: ' + (item.code || '—') + '<br>' +
          'Узел: ' + (item.unit || '—') + '<br>' +
          'Кол-во на родителя: ' + (item.qtyPerParent || 0) + ' шт.<br>' +
          'ПА: ' + numbers.length + ' шт. → Авто: ' + ((item.qtyPerParent || 0) * numbers.length) + ' шт.';
      }
      recalcAutoQty();
    }

    function closePaModal() {
      document.getElementById('paModal').style.display = 'none';
      currentLaunchItems = [];
      currentUnit = null;
      currentQtyPerParent = 0;
      closePaGrid();
    }

    function confirmPaLaunch() {
      const paNumbers = document.getElementById('paNumbers').value.trim();
      const autoMode = document.getElementById('qtyModeAuto').checked;
      
      if (!paNumbers) {
        showToast('❌ Укажите номера ПА');
        return;
      }
      
      if (currentLaunchItems.length === 0) {
        showToast('❌ Нет позиций для запуска');
        return;
      }
      
      let items = currentLaunchItems.map(function(it) {
        let qty = it.qtyPerParent || 0;
        if (!autoMode) {
          const manual = parseFloat(document.getElementById('paQty').value);
          qty = isNaN(manual) || manual <= 0 ? it.qtyPerParent || 0 : manual;
        }
        return {
          code: it.code,
          name: it.name,
          unit: it.unit,
          qty: qty * parsePaInput(paNumbers).length
        };
      });
      
      google.script.run
        .withSuccessHandler(function(r) {
          if (r.error) { showToast('❌ ' + r.error); return; }
          const count = Array.isArray(r) ? r.length : items.length;
          showToast('✅ Запущено: ' + count + ' позиций на ' + paNumbers);
          if (isBatchLaunch) {
            selectedRows.clear();
            const bar = document.getElementById('batchBar');
            if (bar) bar.classList.remove('active');
          }
          closePaModal();
          loadCatalog();
        })
        .withFailureHandler(function(e) { showToast('❌ ' + (e.message || e)); })
        .confirmBatchLaunch(items, paNumbers);
    }

    function batchSetStatus(status) {
      if (selectedRows.size === 0) {
        showToast('❌ Выберите позиции');
        return;
      }
      
      const items = Array.from(selectedRows)
        .map(function(code) { return allData.find(function(d) { return d.code === code; }); })
        .filter(function(it) { return it; });
      
      currentLaunchItems = items;
      isBatchLaunch = true;
      
      document.getElementById('paInfo').innerHTML =
        '<b>Массовый запуск: ' + items.length + ' позиций</b>';
      document.getElementById('paNumbers').value = '';
      document.getElementById('paHint').textContent = '';
      document.getElementById('paHint').className = 'pa-hint';
      
      currentUnit = null;
      currentQtyPerParent = 0;
      
      document.getElementById('qtyModeAuto').checked = true;
      document.getElementById('paQty').value = '';
      document.getElementById('paQty').style.display = 'none';
      
      loadOccupiedPA();
      document.getElementById('paModal').style.display = 'flex';
      onQtyModeChange();
    }
    
    // ========================
    // SIDEBAR
    // ========================
    const SECTION_LOADERS = {
      dashboard: function() { loadDashboard(); loadLaunchesHistory(); },
      paLoad: loadPaLoad,
      units: loadUnitsSummary,
      operations: loadOperationsSummary,
      print: loadPrint
    };
    const loadedSections = new Set();
    
    function showSection(name) {
      currentSection = name;
      document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
      const el = document.getElementById('section-' + name);
      if (el) el.classList.add('active');
      document.querySelectorAll('.sidebar-item').forEach(function(it) {
        it.classList.toggle('active', it.getAttribute('data-section') === name);
      });
      if (!loadedSections.has(name) && SECTION_LOADERS[name]) {
        loadedSections.add(name);
        SECTION_LOADERS[name]();
      }
    }
    
    function toggleSidebar() {
      const sb = document.getElementById('sidebar');
      const ct = document.getElementById('mainContent');
      const collapsed = sb.classList.toggle('collapsed');
      if (ct) ct.classList.toggle('sidebar-collapsed', collapsed);
      const btn = document.getElementById('sidebarToggleBtn');
      if (btn) btn.textContent = collapsed ? '▶' : '◀ Свернуть';
      try { localStorage.setItem('nd_sidebar_collapsed', collapsed ? '1' : '0'); } catch(e) {}
    }
    
    function restoreSidebar() {
      try {
        if (localStorage.getItem('nd_sidebar_collapsed') === '1') {
          const sb = document.getElementById('sidebar');
          const ct = document.getElementById('mainContent');
          if (sb) sb.classList.add('collapsed');
          if (ct) ct.classList.add('sidebar-collapsed');
          const btn = document.getElementById('sidebarToggleBtn');
          if (btn) btn.textContent = '▶';
        }
      } catch(e) {}
    }
    
    // ========================
    // DASHBOARD
    // ========================
    let lastDashboardData = null;
    
    function loadDashboard() {
      const kpiEl = document.getElementById('dashKpis');
      if (!kpiEl || kpiEl.closest('.section') === null) return;
      kpiEl.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      const gridEl = document.getElementById('dashPaGrid');
      if (gridEl) gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">Загрузка...</div>';
      const unitsEl = document.getElementById('dashUnits');
      if (unitsEl) unitsEl.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      const opsEl = document.getElementById('dashOps');
      if (opsEl) opsEl.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      google.script.run
        .withSuccessHandler(function(data) {
          renderDashboard(data || {});
        })
        .withFailureHandler(function() {
          kpiEl.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Ошибка загрузки</p></div>';
        })
        .getDashboardSummary();
    }
    
    function kpiCard(value, label) {
      return '<div class="kpi-card"><div class="kpi-value">' + value + '</div><div class="kpi-label">' + label + '</div></div>';
    }
    
    function renderDashboard(d) {
      lastDashboardData = d;
      const k = d.kpis || {};
      
      const kpiEl = document.getElementById('dashKpis');
      if (kpiEl) {
        kpiEl.innerHTML =
          kpiCard(k.totalLaunches != null ? k.totalLaunches : 0, 'Всего запусков') +
          kpiCard(k.activePAs != null ? k.activePAs : 0, 'Активных ПА') +
          kpiCard(k.completedPAs != null ? k.completedPAs : 0, 'ПА комплект готов') +
          kpiCard((k.readinessPct != null ? k.readinessPct : 0) + '%', 'Готовность') +
          kpiCard(k.totalCatalogItems != null ? k.totalCatalogItems : 0, 'Позиций в Catalog') +
          kpiCard(k.launchedItems != null ? k.launchedItems : 0, 'Запущено в пр-во') +
          kpiCard(k.inWorkItems != null ? k.inWorkItems : 0, 'В работе') +
          kpiCard(k.closedItems != null ? k.closedItems : 0, 'Закрыто ОТК');
      }
      
      // Сетка ПА
      const gridEl = document.getElementById('dashPaGrid');
      if (gridEl) {
        const paGrid = d.paGrid || [];
        let html = '';
        paGrid.forEach(function(pa) {
          const countText = pa.totalItems > 0 ? pa.totalItems + ' поз.' : '';
          html += '<div class="pa-grid-item ' + pa.status + '" data-pa="' + pa.paNumber + '" onclick="showDashPaDetail(this)" title="ПА ' + pa.paNumber + ' — готово ' + pa.completedItems + '/' + pa.totalItems + ' (' + pa.readinessPct + '%)">';
          html += pa.paNumber;
          if (countText) html += '<span class="pa-count">' + countText + '</span>';
          html += '</div>';
        });
        gridEl.innerHTML = html;
      }
      
      // Карточки узлов
      const unitsEl = document.getElementById('dashUnits');
      if (unitsEl) {
        const units = d.units || [];
        if (units.length === 0) {
          unitsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:20px;">Нет данных</div>';
        } else {
          let h = '';
          units.forEach(function(u) {
            const warn = u.readinessPct < 50;
            h += '<div class="unit-card' + (warn ? ' warn' : '') + '">';
            h += '<div class="unit-card-name">' + u.name + '</div>';
            h += '<div class="unit-card-kpis">';
            h += '<span>Всего: <b>' + u.totalItems + '</b></span>';
            h += '<span>Запущено: <b>' + u.launchedItems + '</b></span>';
            h += '<span>Готово: <b>' + u.completedItems + '</b></span>';
            h += '<span class="unit-card-pct">' + u.readinessPct + '%</span>';
            h += '</div>';
            h += '<div class="progress-track"><div class="progress-fill' + (u.readinessPct >= 100 ? ' green' : '') + '" style="width:' + Math.max(u.readinessPct, 2) + '%"></div></div>';
            h += '</div>';
          });
          unitsEl.innerHTML = h;
        }
      }
      
      // Полосы по типам обработки
      const opsEl = document.getElementById('dashOps');
      if (opsEl) {
        const ops = d.operations || [];
        if (ops.length === 0) {
          opsEl.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Нет данных</p></div>';
        } else {
          let h = '<div class="op-list">';
          ops.forEach(function(op) {
            const pct = op.loadPct;
            const color = pct >= 70 ? '#22c55e' : (pct >= 30 ? '#f59e0b' : '#ef4444');
            h += '<div class="op-row">';
            h += '<span class="op-row-label">' + op.label + '</span>';
            h += '<div class="op-row-track"><div class="op-row-fill" style="width:' + Math.max(pct, 2) + '%;background:' + color + '"></div></div>';
            h += '<span class="op-row-pct">' + op.launchedItems + '/' + op.totalItems + ' (' + pct + '%)</span>';
            h += '</div>';
          });
          h += '</div>';
          opsEl.innerHTML = h;
        }
      }
      
      // Последнее обновление
      const upd = document.getElementById('dashUpdated');
      if (upd) upd.textContent = 'Обновлено: ' + (d.lastUpdated || '');
    }
    
    function showDashPaDetail(element) {
      const paNumber = element.getAttribute('data-pa');
      const detail = document.getElementById('dashPaDetail');
      if (!paNumber || !detail) return;
      if (paNumber === detail.getAttribute('data-opened-pa')) {
        detail.classList.remove('show');
        detail.removeAttribute('data-opened-pa');
        return;
      }
      detail.setAttribute('data-opened-pa', paNumber);
      const pa = (lastDashboardData && lastDashboardData.paGrid || []).find(function(p) { return p.paNumber === paNumber; });
      let html = '<b>ПА ' + paNumber + ' — назначено: ' + (pa ? pa.launches.length : 0) + '</b>';
      if (!pa || pa.launches.length === 0) {
        html += '<div style="color:#94a3b8;font-size:13px;margin-top:6px;">Нет назначений</div>';
      } else {
        html += '<table class="agg-table">';
        html += '<tr><th>Код</th><th>Наименование</th><th>Кол-во</th><th>Статус</th></tr>';
        pa.launches.forEach(function(l) {
          const sc = (!l.status || l.status === '—') ? '--' : getStatusClass(l.status);
          html += '<tr>';
          html += '<td>' + l.itemCode + '</td>';
          html += '<td>' + l.itemName + '</td>';
          html += '<td>' + l.qty + '</td>';
          html += '<td><span class="status-chip status-chip-' + sc + '">' + (l.status || '—') + '</span></td>';
          html += '</tr>';
        });
        html += '</table>';
      }
      detail.innerHTML = html;
      detail.classList.add('show');
    }
    
    // ========================
    // ИСТОРИЯ ЗАПУСКОВ
    // ========================
    let histData = null;
    let editingLaunchId = null;
    
    function loadLaunchesHistory() {
      const statusEl = document.getElementById('histStatus');
      if (!statusEl) return;
      loadLaunchesHistoryPage({
        status: statusEl.value,
        search: document.getElementById('histSearch').value.trim(),
        dateFrom: document.getElementById('histDateFrom').value,
        dateTo: document.getElementById('histDateTo').value,
        page: 1,
        pageSize: 20
      });
    }
    
    let histLastFilters = null;
    
    function loadLaunchesHistoryPage(filters) {
      histLastFilters = Object.assign({}, filters);
      const wrap = document.getElementById('histTableWrap');
      if (!wrap) return;
      wrap.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      const info = document.getElementById('histInfo');
      if (info) info.textContent = '';
      const pager = document.getElementById('histPager');
      if (pager) pager.style.display = 'none';
      google.script.run
        .withSuccessHandler(function(data) {
          histData = data || { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
          renderLaunchesHistory();
        })
        .withFailureHandler(function() {
          wrap.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Ошибка загрузки</p></div>';
        })
        .getLaunchesHistory(filters);
    }
    
    function clearHistFilters() {
      document.getElementById('histStatus').value = '';
      document.getElementById('histSearch').value = '';
      document.getElementById('histDateFrom').value = '';
      document.getElementById('histDateTo').value = '';
      loadLaunchesHistory();
    }
    
    function renderLaunchesHistory() {
      const wrap = document.getElementById('histTableWrap');
      if (!wrap) return;
      const items = histData.items || [];
      if (items.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Запусков не найдено</p></div>';
      } else {
        let h = '<table class="agg-table" style="width:100%;">';
        h += '<tr><th>Дата</th><th>Код</th><th>Наименование</th><th>Узел</th><th>ПА</th><th>Кол-во</th><th>Статус</th><th>Кто</th><th style="width:80px;"></th></tr>';
        items.forEach(function(l) {
          const sc = (!l.status || l.status === '—') ? '--' : getStatusClass(l.status);
          h += '<tr>';
          h += '<td>' + l.createdAt + '</td>';
          h += '<td>' + l.itemCode + '</td>';
          h += '<td>' + l.itemName + '</td>';
          h += '<td>' + l.unit + '</td>';
          h += '<td>' + l.paNumbers + '</td>';
          h += '<td>' + l.qty + '</td>';
          h += '<td><span class="status-chip status-chip-' + sc + '">' + (l.status || '—') + '</span></td>';
          h += '<td>' + l.createdBy + '</td>';
          h += '<td style="white-space:nowrap;">';
          h += '<button class="btn-ghost" style="padding:4px 8px;font-size:12px;margin-right:4px;" data-id="' + l.id + '" data-qty="' + l.qty + '" data-pa="' + l.paNumbers + '" title="Редактировать" onclick="openEditLaunch(this)">✏️</button>';
          if (l.status === 'Готово') {
            h += '<button class="btn-ghost" style="padding:4px 8px;font-size:12px;opacity:.35;cursor:not-allowed;" title="Завершён — отмена недоступна">🗑️</button>';
          } else {
            h += '<button class="btn-ghost" style="padding:4px 8px;font-size:12px;color:#ef4444;" data-id="' + l.id + '" data-code="' + l.itemCode + '" title="Отменить" onclick="cancelLaunch(this)">🗑️</button>';
          }
          h += '</td>';
          h += '</tr>';
        });
        h += '</table>';
        wrap.innerHTML = h;
      }
      
      const info = document.getElementById('histInfo');
      if (info) info.textContent = 'Всего: ' + histData.total;
      
      const pager = document.getElementById('histPager');
      if (pager) {
        const tp = histData.totalPages || 0;
        const pc = histData.page || 1;
        if (tp > 1) {
          pager.style.display = 'flex';
          pager.innerHTML =
            '<span style="font-size:13px;color:#64748b;">Стр. ' + pc + ' из ' + tp + '</span>' +
            '<div>' +
            (pc > 1 ? '<button class="btn-ghost" onclick="historyPage(' + (pc - 1) + ')">← Назад</button>' : '') +
            (pc < tp ? '<button class="btn-ghost" style="margin-left:6px;" onclick="historyPage(' + (pc + 1) + ')">Вперёд →</button>' : '') +
            '</div>';
        } else {
          pager.style.display = 'none';
        }
      }
    }
    
    function historyPage(page) {
      loadLaunchesHistoryPage({
        status: document.getElementById('histStatus').value,
        search: document.getElementById('histSearch').value.trim(),
        dateFrom: document.getElementById('histDateFrom').value,
        dateTo: document.getElementById('histDateTo').value,
        page: page,
        pageSize: 20
      });
    }
    
    function cancelLaunch(btn) {
      const id = btn.getAttribute('data-id');
      const code = btn.getAttribute('data-code') || '';
      if (!id) return;
      if (!confirm('Отменить запуск "' + code + '" (#' + id + ')?\\nПозиция вернётся в «Не запущен», ПА освободятся.')) return;
      google.script.run
        .withSuccessHandler(function(r) {
          if (r && r.error) { showToast('❌ ' + r.error); return; }
          showToast('✅ Запуск отменён');
          loadLaunchesHistory();
          loadCatalog();
          if (currentSection === 'dashboard') loadDashboard();
        })
        .withFailureHandler(function(e) { showToast('❌ ' + (e.message || e)); })
        .deleteLaunch(id);
    }
    
    function openEditLaunch(btn) {
      const id = btn.getAttribute('data-id');
      editingLaunchId = id;
      document.getElementById('editPaNumbers').value = btn.getAttribute('data-pa') || '';
      document.getElementById('editQty').value = btn.getAttribute('data-qty') || '';
      document.getElementById('editLaunchHint').textContent = '';
      const item = histData.items.find(function(l) { return l.id === id; });
      document.getElementById('editLaunchInfo').textContent =
        item ? (item.itemCode + ' — ' + item.itemName + ' (' + item.unit + ')') : ('Запуск #' + id);
      document.getElementById('editLaunchModal').style.display = 'flex';
    }
    
    function closeEditLaunch() {
      document.getElementById('editLaunchModal').style.display = 'none';
      editingLaunchId = null;
    }
    
    function confirmEditLaunch() {
      const id = editingLaunchId;
      if (!id) return;
      const paNumbers = document.getElementById('editPaNumbers').value.trim();
      const qty = parseInt(document.getElementById('editQty').value, 10);
      const hint = document.getElementById('editLaunchHint');
      if (isNaN(qty) || qty < 0) { hint.textContent = 'Укажите корректное количество'; return; }
      if (!paNumbers) { hint.textContent = 'Укажите номера ПА'; return; }
      google.script.run
        .withSuccessHandler(function(r) {
          if (r && r.error) { hint.textContent = r.error; return; }
          closeEditLaunch();
          showToast('✅ Запуск обновлён');
          loadLaunchesHistory();
          loadCatalog();
          if (currentSection === 'dashboard') loadDashboard();
        })
        .withFailureHandler(function(e) { hint.textContent = e.message || e; })
        .updateLaunch(id, { paNumbers: paNumbers, qty: qty });
    }
    
    // ========================
    // ЗАГРУЗКА ПА
    // ========================
    function loadPaLoad() {
      const gridEl = document.getElementById('paLoadGrid');
      if (!gridEl) return;
      gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">Загрузка...</div>';
      google.script.run
        .withSuccessHandler(function(data) {
          renderPaLoadGrid(data || []);
        })
        .withFailureHandler(function() {
          gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">Ошибка загрузки</div>';
        })
        .getPAGridData();
    }
    
    function renderPaLoadGrid(data) {
      const gridEl = document.getElementById('paLoadGrid');
      if (!gridEl) return;
      if (data.length === 0) {
        gridEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">Нет данных</div>';
        return;
      }
      let html = '';
      data.forEach(function(pa) {
        const countText = pa.launches.length > 0 ? pa.launches.length + ' зап.' : '';
        html += '<div class="pa-grid-item ' + pa.status + '" data-pa="' + pa.paNumber + '" onclick="showPaLoadDetail(this)">';
        html += pa.paNumber;
        if (countText) {
          html += '<span class="pa-count">' + countText + '</span>';
        }
        html += '</div>';
      });
      gridEl.innerHTML = html;
    }
    
    function showPaLoadDetail(element) {
      const paNumber = element.getAttribute('data-pa');
      const detail = document.getElementById('paLoadDetail');
      if (!paNumber || !detail) return;
      google.script.run
        .withSuccessHandler(function(data) {
          let launches = [];
          (data || []).forEach(function(pa) {
            if (pa.paNumber === paNumber) launches = pa.launches || [];
          });
          let html = '<b>ПА ' + paNumber + ' — назначено: ' + launches.length + '</b>';
          if (launches.length === 0) {
            html += '<div style="color:#94a3b8;font-size:13px;margin-top:6px;">Нет назначений</div>';
          } else {
            html += '<table class="agg-table">';
            html += '<tr><th>Код</th><th>Наименование</th><th>Кол-во</th><th>Статус</th></tr>';
            launches.forEach(function(l) {
              const sc = (!l.status || l.status === '—') ? '--' : getStatusClass(l.status);
              html += '<tr>';
              html += '<td>' + l.itemCode + '</td>';
              html += '<td>' + l.itemName + '</td>';
              html += '<td>' + l.qty + '</td>';
              html += '<td><span class="status-chip status-chip-' + sc + '">' + (l.status || '—') + '</span></td>';
              html += '</tr>';
            });
            html += '</table>';
          }
          detail.innerHTML = html;
          detail.classList.add('show');
        })
        .withFailureHandler(function() {
          detail.innerHTML = '<div style="color:#ef4444;">Ошибка загрузки</div>';
          detail.classList.add('show');
        })
        .getPAGridData();
    }
    
    // ========================
    // УЗЛЫ
    // ========================
    function loadUnitsSummary() {
      const el = document.getElementById('unitsList');
      if (!el) return;
      el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      google.script.run
        .withSuccessHandler(function(data) {
          const items = enrichCatalog(data || []);
          const grouped = {};
          items.forEach(function(it) {
            const unit = it.unit || 'Без узла';
            if (!grouped[unit]) {
              grouped[unit] = 0;
            }
            grouped[unit]++;
          });
          renderUnitsSummary(grouped);
        })
        .withFailureHandler(function() {
          el.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Ошибка загрузки</p></div>';
        })
        .getCatalogForMaster();
    }
    
    function renderUnitsSummary(grouped) {
      const el = document.getElementById('unitsList');
      if (!el) return;
      const names = Object.keys(grouped).sort();
      if (names.length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>Нет данных</p></div>';
        return;
      }
      let html = '';
      names.forEach(function(name) {
        const total = grouped[name];
        html += '<div class="agg-row">';
        html += '<span class="agg-name">' + name + '</span>';
        html += '<span class="agg-meta">всего ' + total + '</span>';
        html += '</div>';
      });
      el.innerHTML = html;
    }
    
    // ========================
    // ТИПЫ ОБРАБОТКИ
    // ========================
    function loadOperationsSummary() {
      const el = document.getElementById('opsSummaryList');
      if (!el) return;
      el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      google.script.run
        .withSuccessHandler(function(data) {
          const items = enrichCatalog(data || []);
          const opMeta = [
            { key: 'cutting', label: 'Резка' },
            { key: 'thermo', label: 'Термо' },
            { key: 'plasma', label: 'Плазма' },
            { key: 'turning', label: 'Токарная' },
            { key: 'milling', label: 'Фрезерная' },
            { key: 'drilling', label: 'Сверлильная' },
            { key: 'metalwork', label: 'Слесарная' },
            { key: 'bending', label: 'Гибка' },
            { key: 'coating', label: 'Покрытие' }
          ];
          const counts = {};
          opMeta.forEach(function(m) {
            counts[m.key] = { label: m.label, total: 0 };
          });
          items.forEach(function(it) {
            opMeta.forEach(function(m) {
              const val = it[m.key];
              if (val === '+' || val === '1' || val === 'ДА') {
                counts[m.key].total++;
              }
            });
          });
          renderOpsSummary(counts, opMeta);
        })
        .withFailureHandler(function() {
          el.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Ошибка загрузки</p></div>';
        })
        .getCatalogForMaster();
    }
    
    function renderOpsSummary(counts, opMeta) {
      const el = document.getElementById('opsSummaryList');
      if (!el) return;
      let html = '';
      opMeta.forEach(function(m) {
        const g = counts[m.key];
        html += '<div class="agg-row">';
        html += '<span class="agg-name" style="min-width:160px;">' + g.label + '</span>';
        html += '<span class="agg-meta">деталей ' + g.total + '</span>';
        html += '</div>';
      });
      el.innerHTML = html;
    }
    
    // ========================
    // ОЧЕРЕДЬ ПЕЧАТИ
    // ========================
    function loadPrint() {
      const el = document.getElementById('printQueueList');
      if (!el) return;
      el.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
      google.script.run
        .withSuccessHandler(function(r) {
          const jobs = (r && r.jobs) || [];
          if (jobs.length === 0) {
            el.innerHTML = '<div class="empty-state"><div class="icon">🖨️</div><p>Очередь печати пуста</p></div>';
            return;
          }
          let html = '';
          jobs.forEach(function(j) {
            html += '<div class="print-job">';
            html += '<div class="top"><span class="num">📄 ' + j.orderNumber + '</span>';
            html += '<button class="btn-ghost" style="background:#22c55e;color:#fff;border:none;" onclick="markPrintJob(' + j.row + ', this)">✅ Напечатано</button></div>';
            html += '<div class="meta">' + j.itemName + ' • ' + (j.itemCode || '') + ' • ' + (j.quantity || 0) + ' шт.</div>';
            html += '<div class="meta">Оператор: ' + (j.operator || '-') + ' • Станок: ' + (j.machine || '-') + '</div>';
            html += '</div>';
          });
          el.innerHTML = html;
        })
        .withFailureHandler(function() {
          el.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Ошибка загрузки</p></div>';
        })
        .getPrintQueue();
    }
    
    function markPrintJob(row, btn) {
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      google.script.run
        .withSuccessHandler(function() {
          showToast('✅ Отмечено как напечатанное');
          loadPrint();
        })
        .withFailureHandler(function(e) {
          showToast('❌ ' + (e.message || e));
          if (btn) { btn.disabled = false; btn.textContent = '✅ Напечатано'; }
        })
        .markPrinted(row);
    }
    
    restoreSidebar();
    loadCatalog();
  </script>
  `;
}

// === ПОЛНАЯ СТРАНИЦА НАЧАЛЬНИКА ЦЕХА ===
// Возвращает полный HTML-документ, внутри которого <script> из
// getMasterPageFragment выполняется БРАУЗЕРОМ НАТИВНО (как на странице входа).
// Это надёжная альтернатива вставке фрагмента через document.body.innerHTML
// + runInsertedScripts, которая не запускала inline-<script> и оставляла
// дерево на вечной "Загрузка...".
function renderMasterAppPage(name) {
  const safeName = name || '';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Начальник цеха — ЦифровойНаряд</title>
</head>
<body>
  ${getMasterPageFragment(safeName)}
</body>
</html>
  `;
}