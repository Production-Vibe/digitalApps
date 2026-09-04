import os

import config


def launch_context(playwright, *, headless=True, storage_state=None):
    """Launch chromium and return a context.

    When `storage_state` is given (a saved Google-authenticated session), it is
    applied so the consent gate is already passed. Otherwise returns a clean
    context (used by the one-time session bind).
    """
    ctx = playwright.chromium.launch_persistent_context(
        user_data_dir=config.PROFILE_DIR,
        channel=config.BROWSER_CHANNEL,
        headless=headless,
        args=["--no-sandbox"],
    )
    if storage_state and os.path.exists(storage_state):
        ctx.storage_state(path=storage_state)
    return ctx


def open_app(page, wait=True):
    """Navigate to the app URL. The consent gate is assumed already passed via
    the stored session; if it still appears we surface it for diagnosis."""
    page.goto(config.APP_URL, wait_until="domcontentloaded", timeout=60000)
    if wait:
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
    return page


def is_consent_gate(page):
    """Detect Google's unverified-app consent screen."""
    try:
        body = page.inner_text("body")
    except Exception:
        body = ""
    markers = [
        "создано пользователем Google Apps Script",
        "created by a user of Google Apps Script",
        "Сообщить о нарушении",
    ]
    return any(m in body for m in markers)


def goto_page(page, query):
    """Navigate to a specific app page by query string, e.g. 'page=master-app&name=X'."""
    url = config.APP_URL
    sep = "&" if "?" in url else "?"
    page.goto(url + sep + query, wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass
    return page


def frames_with(page):
    """Iterator over the page's main frame plus all child frames (the app runs
    inside a sandboxed iframe — userCodeAppPanel — so selectors must be looked
    up in each frame, not just the top-level document)."""
    yield page
    for fr in page.frames:
        if fr != page.main_frame:
            yield fr


def wait_for_in_any_frame(page, selector, timeout=15000):
    """Wait until `selector` resolves inside ANY frame of the page, then return
    that frame. Raises TimeoutError if never found."""
    import time

    deadline = time.time() + timeout / 1000.0
    last = None
    while time.time() < deadline:
        for fr in frames_with(page):
            try:
                if fr.wait_for_selector(selector, timeout=500):
                    return fr
            except Exception as e:
                last = e
        page.wait_for_timeout(200)
    raise last or TimeoutError(f"selector {selector} not found in any frame")


def frame_locator(page, selector, timeout=5000):
    """Return the first frame where `selector` currently resolves, else None."""
    for fr in frames_with(page):
        try:
            el = fr.wait_for_selector(selector, timeout=600)
            if el:
                return fr
        except Exception:
            continue
    return None


def do_in_app_login(page, cred):
    """Fill and submit the in-app login form (inside the app iframe) and return
    the frame it was submitted in, else None."""
    try:
        fr = wait_for_in_any_frame(page, "#login", timeout=15000)
    except Exception:
        return None
    try:
        fr.fill("#login", cred["login"])
        fr.fill("#password", cred["password"])
        fr.click("#loginBtn")
    except Exception:
        return None
    return fr


def login_form_visible(page):
    """Return True if the in-app login form (#login) is present in any frame."""
    try:
        return frame_locator(page, "#login", timeout=800) is not None
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
