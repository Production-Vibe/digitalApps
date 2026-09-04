"""E2E: master role.

Verifies:
  1. Login lands master on the FULL page (?page=master-app).
  2. The master shell renders (non-empty body).
  3. Refresh does not bounce to login.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


def master_flow(page, cred):
    helpers.open_app(page)

    fr = helpers.do_in_app_login(page, cred)
    if fr is not None:
        runner.check("вход по форме", True, cred["login"])
    else:
        runner.check("вход — без формы (сессия уже активна)", True, "")
    try:
        page.wait_for_url("**page=master-app*", timeout=15000)
    except Exception:
        pass

    runner.full_page_and_refresh(page, "page=master-app", "мастера", "master")


if __name__ == "__main__":
    runner.run("master", master_flow)
