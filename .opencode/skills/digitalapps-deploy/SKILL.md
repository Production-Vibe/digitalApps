---
name: digitalapps-deploy
description: Deploy the "ЦифровойНаряд" Google Apps Script web app from the markdown sources. Deployment is MANUAL only — there is no clasp, no build scripts, no dist/, no .gs/.bas files to edit. Use when the user mentions deploy/push/развертывание/деплой/новая версия, after editing any *.md code module in modules/ (Code, Config, Auth, Shifts, ShiftUI, OperatorUI, MasterUI, NaryadAPI, CatalogAPI, PlanningAPI, Launches, PrintQueue), or when a page shows «Загрузка…»/blank after a deploy. NOT for: business-logic design (see docs/specs), sheet structure changes, otk role development, ordinary code editing with no deploy goal.
---

# ЦифровойНаряд — ручной деплой в Apps Script

## What this is

Markdown files in `modules/*.md` are literally the `.gs` sources (1:1 module
mapping, same file names). Deployment is **manual**: copy the file content into
the Apps Script editor, then re-point the active deployment to a new version.

There are **no real `.gs`/`.bas` files**, no `deploy/`, no `dist/`, no clasp.
Never create them.

## Quick steps

1. Edit the code module in `modules/*.md`. The **whole file is the body** — there
   is no markdown fence or heading to strip.
2. Verify syntax:
   `node .opencode/skills/digitalapps-deploy/scripts/check-modules.js [ModuleName]`
   (no args = all modules; UI `<script>` blocks checked separately).
3. Copy the **entire file content** into the Apps Script editor, file with the
   **same name**, on the spreadsheet whose scriptId is in
   `references/deploy-procedure.md`.
4. Apps Script → **Развернуть → Управление развертываниями** → активное `/exec`
   → версия «Новая версия».
5. Warn the user to test and say «тестируй»; open only the fresh `/exec` URL.

## Files in this skill

- `references/deploy-procedure.md` — full policy and step-by-step procedure, scriptId, verification rules.
- `references/diagnostics.md` — if the page shows «Загрузка…»/blank after a deploy (source: `docs/МАСТЕР-ДИАГНОСТИКА.md`).
- `scripts/check-modules.js` — deterministic syntax check of module bodies + inline `<script>` blocks (Node).

## Deployment policy (summary)

- **Never deploy automatically.** Web-app deployments are changed manually by the user.
- **Always warn before deploying**: which modules change, that a new version is created.
- **Only deploy with explicit user consent**; after the stage, say «тестируй».
- Do not batch tiny cosmetic edits into a deployment unless asked.

## Code modules

Code-модули в `modules/` (`.md` → `.gs`): `Code` (doPost/onEdit), `Config`
(constants), `Auth` (checkAuth/doGet/routing), `Shifts`, `OperatorUI`, `MasterUI`,
`ShiftUI`, `NaryadAPI`, `CatalogAPI`, `PlanningAPI`, `Launches`, `PrintQueue`.

Document-only, NEVER deployed: `README.md`, `AGENTS.md`, everything under
`docs/`. Do NOT copy these into Apps Script.

## Remember

- `.md` is source; there is no generated artifact.
- Keep `docs/specs/*.md` aligned with actual code when behavior changes
  (statuses, routing, sheet columns).
- Changes to `opencode.json`, skills, agents require restarting opencode to
  take effect — project code deploys via the manual procedure above.