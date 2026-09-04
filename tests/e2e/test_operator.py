"""E2E: operator role.

Verifies:
  1. Login lands the operator on the FULL page (?page=operator&name=...) and
     NOT the login form / fragment injection.
  2. Refresh (F5) does NOT bounce to the login form (bug #1 fix).
  3. The operator UI core elements render (shift block, tabs).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


def operator_flow(page, cred):
    helpers.open_app(page)

    # Always attempt the in-app login (waits up to 15s for the form in the
    # sandboxed iframe). If the session is already active, do_in_app_login
    # times out and returns None — then we just verify the landing page.
    fr = helpers.do_in_app_login(page, cred)
    if fr is not None:
        runner.check("вход по форме", True, cred["login"])
    else:
        runner.check("вход — без формы (сессия уже активна)", True, "")
    try:
        page.wait_for_url("**page=operator*", timeout=15000)
    except Exception:
        pass

    url = page.url
    runner.check(
        "URL — полная страница оператора",
        "page=operator" in url and "page=login" not in url,
        url,
    )

    # The operator UI renders inside the Apps Script sandboxed iframe, so check
    # for our selectors across all frames (not just the top document).
    try:
        helpers.wait_for_in_any_frame(page, ".header, #shiftBlock", timeout=15000)
        has_ui = True
    except Exception:
        has_ui = False
    runner.check("UI оператора отрисован", has_ui, "")
    # Textual evidence of the rendered interface (no image viewing available).
    ui_text = ""
    for fr in page.frames:
        try:
            t = fr.inner_text("body")
            if "Мои наряды" in t or "Смена не открыта" in t or "Открыть смену" in t:
                ui_text = t
                break
        except Exception:
            continue
    runner.check(
        "текст интерфейса оператора",
        ui_text != "",
        (ui_text[:80].replace(chr(10), " | ") if ui_text else "empty"),
    )
    helpers.save_screenshot(page, "operator_landed.png")

    page.reload(wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass
    bounced = helpers.login_form_visible(page)
    runner.check("F5 не перебрасывает на форму входа", not bounced, "bounced_to_login" if bounced else "ok")
    helpers.save_screenshot(page, "operator_after_refresh.png")

    try:
        fr = helpers.wait_for_in_any_frame(page, ".tabs", timeout=10000)
        tabs_ok = len(fr.query_selector_all(".tab")) >= 4
    except Exception:
        tabs_ok = False
    runner.check("присутствуют 4 вкладки", tabs_ok, "")


if __name__ == "__main__":
    runner.run("operator", operator_flow)
