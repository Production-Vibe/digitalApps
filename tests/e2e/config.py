import os

# Target of E2E: local Node/Express stack (JWT-auth, EJS pages).
APP_URL = os.environ.get("ND_APP_URL", "http://localhost:3000")

# Headless chromium (Playwright bundled) — no Google session involved anymore.
# Real installed browser channel no longer required.
BROWSER_CHANNEL = os.environ.get("ND_BROWSER_CHANNEL") or None

# Screenshots/artifacts output dir.
SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")

# Role credentials (from server/prisma/data/employees.json seed). Supplied via
# env so secrets are never committed; fall back to the seeded test accounts.
def _cred(role):
    login = os.environ.get("ND_LOGIN_" + role.upper())
    pwd = os.environ.get("ND_PASSWORD_" + role.upper())
    name = os.environ.get("ND_NAME_" + role.upper())
    if not all([login, pwd]):
        return None
    return {"login": login, "password": pwd, "name": name}


CREDS = {
    "operator": _cred("operator") or {"login": "operator", "password": "123", "name": "Иванов И. И."},
    "otk": _cred("otk") or {"login": "otk", "password": "123", "name": "Сидоров С. С."},
    "master": _cred("master") or {"login": "master", "password": "123", "name": "Качурин И. К."},
    "shift": _cred("shift") or {"login": "shift", "password": "123", "name": "Умнов И. П."},
}

# Expected post-login page per role (JWT-based client redirect in EJS views).
LANDING = {
    "operator": "/operator",
    "otk": "/otk",
    "master": "/master",
    "shift": "/shift",
}