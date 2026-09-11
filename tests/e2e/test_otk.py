"""E2E: otk role (new stack).

Verifies:
  1. JWT-login lands otk on the FULL page /otk.
  2. The otk shell renders (non-empty body).
  3. Refresh does not bounce to login.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


def otk_flow(page, cred):
    helpers.open_app(page)

    logged = helpers.do_login(page, cred)
    runner.check("вход по форме", logged, cred["login"])

    try:
        page.wait_for_url("**/otk", timeout=15000)
    except Exception:
        pass

    runner.full_page_and_refresh(page, "/otk", "ОТК", "otk")


if __name__ == "__main__":
    runner.run("otk", otk_flow)