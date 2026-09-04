---
name: digitalapps-deploy
description: Deploy the "ЦифровойНаряд" Google Apps Script project from the markdown sources in this folder to Google via clasp. Use when editing any *.md code module (Code, Config, Auth, Shifts, OperatorUI, MasterUI, NaryadAPI, CatalogAPI, PlanningAPI, Launches, PrintQueue), when the user mentions deploy/push/развертывание/деплой, or when creating a new deployment version of the web app.
---

# DigitalApps — Apps Script deployment workflow

## What this is

The project lives as **markdown files that are literally `.gs` sources**. Each
code `.md` file on `\\FS1\Production\MVP\docs\digitalApps\` maps 1:1 to an
Apps Script file of the same name. They are deployed to Google Apps Script via
the `@google/clasp` CLI. There are **no real `.gs`/`.bas` files** — the `.md`
bodies are already valid JavaScript and are copied verbatim to `.gs`.

## The source of truth

Markdown files are the single source of truth. Never edit the generated
`.gs` files directly — they are disposable build output.

Code modules (`.md` → `.gs`):

- `Code` — `doPost`, `onEdit` entry points
- `Config` — constants (sheets, web app URL)
- `Auth` — `checkAuth`, `doGet`, login/redirect
- `Shifts` — shifts, operators, machines
- `OperatorUI` — operator web UI
- `MasterUI` — master/shop-chief web UI (tree, filters, launch modal)
- `NaryadAPI` — onряды, transitions, operator cards
- `CatalogAPI` — catalog upload, header parsing
- `PlanningAPI` — catalog reads (getCatalogForMaster, confirmBatchLaunch), queue/workorders
- `Launches` — `createLaunch`, PA occupancy, load summary
- `PrintQueue` — print jobs

Document-only files that are NEVER deployed:

- `Мастер-промпт.md` — the "master prompt" documentation
- `чек-лист внедрения - цифровые наряды, статусы.md` — implementation checklist

Do NOT map these two to `.gs`.

## Layout

```
docs/digitalApps/
├── <Name>.md            # source (authoritative)
├── Мастер-промпт.md     # docs — never deployed
├── чек-лист внедрения...md  # docs — never deployed
└── deploy/
    ├── .clasp.json      # {"scriptId":"...","rootDir":"dist"}
    ├── package.json     # scripts: build, push, deploy
    ├── build.mjs        # md -> dist/*.gs converter
    ├── .clasprc.json    # clasp auth (gitignored)
    ├── .gitignore
    └── dist/            # generated .gs + appsscript.json (gitignored)
        ├── appsscript.json
        ├── Code.gs
        ├── Config.gs
        └── ...
```

`rootDir` is `dist`, so clasp only ever sees `.gs` + `appsscript.json`.

## Build & convert

`build.mjs` reads the 11 code `.md` files from the parent folder and writes
each body verbatim into `dist/<Name>.gs`. It ignores the two doc files.

Run manually:

```powershell
cd deploy
node build.mjs
# or
npm run build
```

The `appsscript.json` manifest in `dist/` is static and preserved across
builds (do not delete it).

## Deploy

Full deploy (build + push + new version):

```powershell
cd deploy
npm run deploy
```

Which is: `node build.mjs && clasp push -f && clasp deploy`.

`clasp push -f` overwrites remote files with local `dist/` contents.
`clasp deploy` creates a new immutable version of the web app.

## Deployment policy (current conditions)

- **Auto-deploy is authorized**: after each meaningful code change to a code
  `.md` (`build.mjs` includes it), run the deploy and create a deployment
  version. Do this autonomously after completing an edit.
- **Warn first**: before deploying, briefly warn the user what will be pushed
  (files affected) and that it creates a new web-app version.
- **Deploy by choice**: if the change is trivial or the user is mid-tasking,
  you may wait for an explicit go — use your judgment, always warn before
  deploying.
- Do not spam deployments for tiny cosmetic-only edits; batch when sensible.

## Script ID / auth

- Script ID: `1JBgNT2ZGhBWc9z2fDG1gPhRmf3KJaeYm8_gCHJTuVpijeBTzZQUfyyqU`
- clasp is authenticated as the account that owns the script (stored globally
  in `~/.clasprc.json`, plus a gitignored copy under `deploy/`).
- Remote file set must exactly match the 11 modules + `appsscript.json`.
  If `clasp pull` shows a mismatch, stop and reconcile before pushing.

## Verification

Before/after deploy, sanity checks:

- `clasp status` — lists files clasp will push; ensure all 11 + appsscript.json.
- After `clasp push`, the project in Apps Script is updated.
- Confirm no doc-only `.md` sneaks into `dist/`.

## Remember

- `.md` is source, `.gs` is generated — never edit `dist/` by hand.
- Keep `Мастер-промпт.md` in sync with the current state of the UI/API docs
  when you change behavior (status badges, filters, launch modal, etc).
- Changes to config (`opencode.json`, skills, agents) require restarting
  opencode to take effect — but project code deploys via clasp, not restart.
