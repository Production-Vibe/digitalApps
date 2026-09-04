# Deployment policy and full procedure

Source of truth for the manual deploy. See also `docs/specs/adr/deploy-manual.md`
(why manual, no clasp) and `AGENTS.md` («Деплой (только ручной!)»).

## Deployment policy

- **Never deploy automatically.** Google's web-app deployments are changed
  manually by the user in the Apps Script editor.
- **Always warn before deploying**: state which modules will change and that a
  new web-app version will be created.
- **Only deploy with explicit user consent.** After the deploy stage completes,
  tell the user «тестируй».
- Do not batch tiny cosmetic edits into a deployment unless asked; deploy at
  the end of a meaningful logical step.

## Manual deploy procedure

1. **Edit** the code module `modules/*.md`. The **whole file is the body** —
   there is no markdown fence or heading to strip; module files are plain JS.
   The `.md` file maps 1:1 to the Apps Script file with the same name.
2. **Verify syntax**:
   `node .opencode/skills/digitalapps-deploy/scripts/check-modules.js [ModuleName]`
   (no arguments checks all modules; also checks `<script>...</script>` blocks
   of UI modules separately).
3. **Copy the entire file content** into the Apps Script editor, into the file
   with the **same name**, on the spreadsheet whose scriptId is listed in
   `docs/МАСТЕР-ДИАГНОСТИКА.md` (ШАГ 2):
   - `12g5YaTk6fKmpA7UZLKcG42LBGlZHUHRpnKOSuIr7EBg`
   - If the opened script's `/d/<SCRIPT_ID>/edit` does NOT match — you are on
     the wrong (old) spreadsheet. Work only on the current one.
4. **Deploy**: Apps Script → **Развернуть → Управление развертываниями** →
   active `/exec` entry → **Изменить (✎) → Версия: Новая версия → Сохранить**.
   If there is no active deployment: **Развернуть → Новое развертывание** →
   Тип: Веб-приложение → выполнять от имени вашей учётки → доступ: «Любой»
   (или «Любой в вашей организации») → Развернуть → copy the new `/exec` URL.
5. **Warn user to test**: после логина роли `master` и `shift` открываются по
   `?page=master-app` / `?page=shift-app` (нативный URL WebApp).

## Verification rules

- Every changed code module must pass `check-modules.js` before deploy.
- Modules must remain self-contained JS (no JSX/TS): they run on Rhino/V8 in
  Apps Script (ES5/ES6+ compatible).
- PowerShell: use `cmd1; if ($?) { cmd2 }` (no `&&` in PowerShell 5.1).