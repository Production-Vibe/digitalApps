"""E2E: operator role (new stack).

Verifies:
  1. JWT-login lands the operator on the FULL page /operator.
  2. Refresh (F5) does NOT bounce to the login form.
  3. The operator UI core elements render (shifts + orders sections).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


def operator_flow(page, cred):
    helpers.open_app(page)

    logged = helpers.do_login(page, cred)
    runner.check("вход по форме", logged, cred["login"])

    try:
        page.wait_for_url("**/operator", timeout=15000)
    except Exception:
        pass

    url = page.url
    runner.check(
        "URL — полная страница оператора",
        "/operator" in url and "/login" not in url,
        url,
    )

    try:
        page.wait_for_selector("#shiftsSection, #ordersSection", timeout=15000)
        has_ui = True
    except Exception:
        has_ui = False
    runner.check("UI оператора отрисован", has_ui, "")

    ui_text = page.inner_text("body")
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
        orders_ok = page.is_visible("#ordersSection")
        shifts_ok = page.is_visible("#shiftsSection")
    except Exception:
        orders_ok, shifts_ok = False, False
    runner.check("присутствуют секции смен и нарядов", orders_ok and shifts_ok, "")


if __name__ == "__main__":
    runner.run("operator", operator_flow)