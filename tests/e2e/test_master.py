"""E2E: master role (new stack).

Verifies:
  1. JWT-login lands master on the FULL page /master.
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

    logged = helpers.do_login(page, cred)
    runner.check("вход по форме", logged, cred["login"])

    try:
        page.wait_for_url("**/master", timeout=15000)
    except Exception:
        pass

    runner.full_page_and_refresh(page, "/master", "мастера", "master")


if __name__ == "__main__":
    runner.run("master", master_flow)