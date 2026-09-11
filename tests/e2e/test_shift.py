"""E2E: shift role (new stack).

Verifies:
  1. JWT-login lands shift on the FULL page /shift.
  2. The shift shell renders (non-empty body).
  3. Refresh does not bounce to login.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


def shift_flow(page, cred):
    helpers.open_app(page)

    logged = helpers.do_login(page, cred)
    runner.check("вход по форме", logged, cred["login"])

    try:
        page.wait_for_url("**/shift", timeout=15000)
    except Exception:
        pass

    runner.full_page_and_refresh(page, "/shift", "нач. смены", "shift")


if __name__ == "__main__":
    runner.run("shift", shift_flow)