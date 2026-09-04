# If the page shows «Загрузка…» / blank after deploy

Full checklist: `docs/МАСТЕР-ДИАГНОСТИКА.md` (single source of truth).

Quick steps:

1. Check which page actually loads (Console: `document.body.innerHTML.slice(0,300)`,
   `document.getElementById('planningList')`).
2. Confirm the script bundle is attached to the correct spreadsheet (scriptId match).
3. Re-point the active `/exec` deployment to a **new version**.
4. Open ONLY the fresh `/exec` URL (not a stale bookmark).
5. Verify `typeof loadCatalog` etc. are `"function"` on the new URL.
6. If still broken, verify the deployed `.md` bodies contain the latest edits.