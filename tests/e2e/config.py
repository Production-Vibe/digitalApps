import os

# Deployed Apps Script web app URL (target of E2E).
APP_URL = os.environ.get(
    "ND_APP_URL",
    "https://script.google.com/macros/s/AKfycbzoPmk9b8lmACXpKdlAqDCY7xSLscxN5y4UoQdbW7KRjjGigKd-GG_oeAzl-28wha7KqA/exec",
)

# Browser channel for Playwright. Use a real installed browser (chrome/msedge)
# instead of the bundled chromium, because Google blocks the automated
# Playwright build from signing in ("браузер или приложение небезопасны").
BROWSER_CHANNEL = os.environ.get("ND_BROWSER_CHANNEL", "chrome")

# Persistent browser profile dir (holds the authenticated Google session and
# the one-time app consent approval). Keep out of VCS (see .gitignore).
PROFILE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profile")

# Storage-state file written after a successful manual login+consent.
STORAGE_STATE = os.path.join(PROFILE_DIR, "storage_state.json")

# Screenshots/artifacts output dir.
SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")

# In-app role credentials (from лист «Сотрудники»). Supplied via env so secrets
# are never committed. Fall back to empty and let each test skip if missing.
def _cred(role):
    login = os.environ.get("ND_LOGIN_" + role.upper())
    pwd = os.environ.get("ND_PASSWORD_" + role.upper())
    name = os.environ.get("ND_NAME_" + role.upper())
    if not all([login, pwd]):
        return None
    return {"login": login, "password": pwd, "name": name}


# Sample known test accounts (from prior testing notes). Requires env overrides
# on machines where these differ.
CREDS = {
    "operator": _cred("operator") or {"login": "operator", "password": "123", "name": "Иванов И.И."},
    "otk": _cred("otk") or {"login": "otk", "password": "123", "name": "Сидоров С.С."},
    "master": _cred("master") or {"login": "master", "password": "123", "name": "Качурин И.К."},
    "shift": _cred("shift") or {"login": "shift", "password": "123", "name": "Умнов И.П."},
}

# Expected post-login landing page per role.
LANDING = {
    "operator": "page=operator",
    "otk": "page=otk-app",
    "master": "page=master-app",
    "shift": "page=shift-app",
}
