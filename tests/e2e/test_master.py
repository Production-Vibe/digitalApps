"""E2E: master role (new stack).

Verifies:
  1. JWT-login lands master on the FULL page /master.
  2. The master shell renders (non-empty body).
  3. Refresh does not bounce to login.
  4. Tabs (Сводка/Планирование/Номенклатура/Отчёты) switch panels; the
     planning tab keeps the create-launch UI.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner

# key = data-tab, marker = text that must be visible when the tab is active
TABS = {
    "svodka": "Сводка по цеху",
    "plan": "Создать запуск",
    "nomenclatura": "Номенклатура",
    "otchety": "Период",
}


def master_flow(page, cred):
    helpers.open_app(page)

    logged = helpers.do_login(page, cred)
    runner.check("вход по форме", logged, cred["login"])

    try:
        page.wait_for_url("**/master", timeout=15000)
    except Exception:
        pass

    runner.full_page_and_refresh(page, "/master", "мастера", "master")

    for key, marker in TABS.items():
        page.click(f".tab-btn[data-tab='{key}']")
        try:
            page.wait_for_selector(f"#tab-{key}:not([hidden])", timeout=5000)
        except Exception:
            pass
        runner.check(f"вкладка {marker} активна", page.is_visible(f"#tab-{key}"), marker)
        runner.check(f"вкладка {marker} — контент", marker in page.inner_text("body"), marker)

    page.click(".tab-btn[data-tab='svodka']")
    helpers.save_screenshot(page, "master_tabs.png")


if __name__ == "__main__":
    runner.run("master", master_flow)