"""E2E: shift role.

Verifies:
  1. Login lands shift on the FULL page (?page=shift-app).
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

    fr = helpers.do_in_app_login(page, cred)
    if fr is not None:
        runner.check("вход по форме", True, cred["login"])
    else:
        runner.check("вход — без формы (сессия уже активна)", True, "")
    try:
        page.wait_for_url("**page=shift-app*", timeout=15000)
    except Exception:
        pass

    runner.full_page_and_refresh(page, "page=shift-app", "нач. смены", "shift")


if __name__ == "__main__":
    runner.run("shift", shift_flow)
