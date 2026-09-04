import os
import sys
import traceback

# Force UTF-8 console output so emoji/Cyrillic evidence prints on Windows
# (default cp1251 console would raise UnicodeEncodeError).
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers

RESULTS = []


def check(name, cond, detail=""):
    """Record a single pass/fail check and print it."""
    status = "PASS" if cond else "FAIL"
    RESULTS.append({"name": name, "pass": bool(cond), "detail": detail})
    line = f"[{status}] {name}"
    if detail:
        line += f" — {detail}"
    try:
        print(line)
    except UnicodeEncodeError:
        # Console can't encode emoji/Cyrillic in the detail — print a safe copy.
        safe = line.encode("ascii", errors="replace").decode("ascii")
        print(safe)


def full_page_and_refresh(page, expected_page_param, label, shot_prefix):
    """Common E2E for full-page roles (otk/master/shift):
    verify landing URL, non-empty body, and F5 does not bounce to login."""
    url = page.url
    check(
        f"URL — полная страница {label}",
        (expected_page_param in url) and ("page=login" not in url),
        url,
    )
    # The app body lives in the sandboxed iframe; a non-empty frame body means
    # the role page actually rendered (top-frame text is the Google wrapper).
    body_ok = False
    for fr in page.frames:
        try:
            txt = fr.inner_text("body").strip()
            if len(txt) > 30:
                body_ok = True
                break
        except Exception:
            continue
    check(f"страница {label} отрисована (не пустая)", body_ok, "")
    helpers.save_screenshot(page, f"{shot_prefix}_landed.png")

    page.reload(wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass
    bounced = helpers.login_form_visible(page)
    check(
        f"F5 не перебрасывает на форму входа ({label})",
        not bounced,
        "bounced_to_login" if bounced else "ok",
    )
    helpers.save_screenshot(page, f"{shot_prefix}_after_refresh.png")


def finish(exit_code=True):
    """Summarize all checks and exit non-zero if any failed."""
    total = len(RESULTS)
    failed = [r for r in RESULTS if not r["pass"]]
    print()
    print("=" * 60)
    print(f"Итог: {total - len(failed)}/{total} проверок прошло.")
    for r in failed:
        print(f"  FAIL: {r['name']}: {r['detail']}")
    print("=" * 60)
    if failed:
        raise SystemExit(1)


def run(role, fn):
    """Shared entry: open app with stored session, run role-specific fn."""
    from playwright.sync_api import sync_playwright

    if not os.path.exists(config.STORAGE_STATE):
        print("Нет сохранённой сессии. Сначала выполните: python session_setup.py")
        raise SystemExit(2)

    cred = config.CREDS.get(role)
    if not cred:
        print(f"Нет учётных данных для роли '{role}'.")
        raise SystemExit(2)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel=config.BROWSER_CHANNEL,
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
            ignore_default_args=["--enable-automation"],
        )
        # Fresh context per test seeded ONLY with the saved Google session.
        # The app's own localStorage is empty -> the in-app login form always
        # shows, so each role run starts clean regardless of prior runs.
        ctx = browser.new_context(
            storage_state=config.STORAGE_STATE,
            viewport={"width": 1280, "height": 850},
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        page = ctx.new_page()
        try:
            fn(page, cred)
            finish()
        except Exception as e:
            print("Исключение в тесте:")
            traceback.print_exc()
            helpers.save_screenshot(page, f"{role}_error.png")
            raise SystemExit(1)
        finally:
            browser.close()
