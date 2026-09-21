"""E2E: admin role (new stack).

Verifies:
  1. JWT-login lands admin on the FULL page /admin.
  2. The admin shell renders a non-empty body with the employees section.
  3. Refresh does not bounce to login.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


def admin_flow(page, cred):
    helpers.open_app(page)

    logged = helpers.do_login(page, cred)
    runner.check("вход по форме", logged, cred["login"])

    try:
        page.wait_for_url("**/admin", timeout=15000)
    except Exception:
        pass

    url = page.url
    runner.check(
        "URL — полная страница admin",
        ("/admin" in url) and ("/login" not in url),
        url,
    )
    body_ok = len(page.inner_text("body").strip()) > 30
    runner.check("страница admin отрисована (не пустая)", body_ok, "")
    helpers.save_screenshot(page, "admin_landed.png")

    page.reload(wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=20000)
    except Exception:
        pass
    bounced = helpers.login_form_visible(page)
    runner.check(
        "F5 не перебрасывает на форму входа (admin)",
        not bounced,
        "bounced_to_login" if bounced else "ok",
    )
    helpers.save_screenshot(page, "admin_after_refresh.png")

    try:
        page.wait_for_selector("#employeesSection", timeout=15000)
        runner.check("таблица сотрудников присутствует", True, "")
    except Exception:
        runner.check("таблица сотрудников присутствует", False, "нет #employeesSection")


if __name__ == "__main__":
    runner.run("admin", admin_flow)