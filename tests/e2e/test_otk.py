"""E2E: otk role.

Verifies:
  1. Login lands otk on the FULL page (?page=otk-app).
  2. Refresh does not bounce to login (full page stays).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


def otk_flow(page, cred):
    helpers.open_app(page)

    fr = helpers.do_in_app_login(page, cred)
    if fr is not None:
        runner.check("вход по форме", True, cred["login"])
    else:
        runner.check("вход — без формы (сессия уже активна)", True, "")
    try:
        page.wait_for_url("**page=otk-app*", timeout=15000)
    except Exception:
        pass

    runner.full_page_and_refresh(page, "page=otk-app", "ОТК", "otk")


if __name__ == "__main__":
    runner.run("otk", otk_flow)
