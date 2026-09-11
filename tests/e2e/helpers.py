import os

import config

# The app renders full pages (no sandboxed iframe), so selectors are resolved
# against the top-level document only.


def open_app(page, wait=True):
    """Navigate to the app login page."""
    page.goto(config.APP_URL + "/login", wait_until="domcontentloaded", timeout=60000)
    if wait:
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
    return page


def do_login(page, cred):
    """Fill and submit the login form on /login; returns True on success."""
    try:
        page.wait_for_selector("#login", timeout=15000)
        page.fill("#login", cred["login"])
        page.fill("#password", cred["password"])
        page.click("#loginForm button[type='submit']")
        return True
    except Exception:
        return False


def login_form_visible(page):
    """Return True if the login form (#login) is present on the page."""
    try:
        return page.is_visible("#login", timeout=800)
    except Exception:
        return False


def save_screenshot(page, name):
    os.makedirs(config.SCREENSHOT_DIR, exist_ok=True)
    path = os.path.join(config.SCREENSHOT_DIR, name)
    page.screenshot(path=path, full_page=True)
    return path


def capture_console(page):
    """Return a list of collected console error/warning strings (non-empty)."""
    logs = []

    def _on(msg):
        if msg.type in ("error", "warning"):
            logs.append(msg.text)

    page.on("console", _on)
    return logs