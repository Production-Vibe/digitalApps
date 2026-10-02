"""E2E probe: catalog CRUD (справочник номенклатуры).

Drives the live stand (localhost:3000) after Этап 16:

  API  — create (201), duplicate code (409), blank code (400), shift -> 403;
          edit without code change (200); code change cascade
          (moved.launches >= 1); delete of a referenced code (409); delete
          after reference is gone (200); gone from GET /api/catalog.
  UI   — /admin tab «Номенклатура» mounts the catalog component (#cmAdd);
          /master tab «Номенклатура» mounts it too.
  Cleanup — test records (TST-*) removed via SQL (docker exec). The live
          catalog (2208 positions) is never touched.
"""

import json
import os
import random
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner

TS = time.strftime("%Y%m%d%H%M%S")
CODE_A = "TST-" + TS        # создаётся, правится, смена кода
CODE_B = "TST-" + TS + "-B" # результат смены кода
PA = "TST-PA-" + TS

BASE = config.APP_URL


def run_sql(sql):
    """Execute SQL against the stand DB via the docker container."""
    out = subprocess.run(
        ["docker", "exec", "server-db-1", "psql", "-U", "user", "-d", "digital_narad", "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return out.stdout.strip()


def api(request, method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    return request.fetch(BASE + path, method=method, data=json.dumps(body or {}), headers=headers)


def login(request, login, password):
    return api(request, "POST", "/api/login", {"login": login, "password": password, "remember": False})


def main():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel=config.BROWSER_CHANNEL,
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )

        # ---- API-часть ----
        ctx = browser.new_context()
        req = ctx.request
        tokens = {}
        for role in ["master", "shift", "admin"]:
            cred = config.CREDS[role]
            r = login(req, cred["login"], cred["password"])
            tokens[role] = r.json().get("accessToken")

        # 1. create (hand code allowed for admin only after auto-code contract)
        r = api(req, "POST", "/api/catalog", {"code": CODE_A, "name": "Тест-позиция", "designation": "TST-OB"}, token=tokens["admin"])
        ok = r.status == 201 and r.json().get("code") == CODE_A
        runner.check("каталог: create (admin) -> 201", ok, "status " + str(r.status))

        # 2. duplicate
        r = api(req, "POST", "/api/catalog", {"code": CODE_A, "name": "Дубль"}, token=tokens["admin"])
        runner.check("каталог: дубль кода -> 409", r.status == 409, str(r.status))

        # 3. blank code
        r = api(req, "POST", "/api/catalog", {"code": "", "name": "Пусто"}, token=tokens["master"])
        runner.check("каталог: пустой код -> 400", r.status == 400, str(r.status))

        # 4. shift cannot write
        r = api(req, "POST", "/api/catalog", {"code": "TST-no-" + TS, "name": "x"}, token=tokens["shift"])
        runner.check("каталог: create (shift) -> 403", r.status == 403, str(r.status))

        # 5. edit without code change
        r = api(req, "PUT", "/api/catalog/" + CODE_A, {"code": CODE_A, "name": "Тест-позиция v2", "designation": "TST-OB"}, token=tokens["admin"])
        ok = r.status == 200 and r.json().get("name") == "Тест-позиция v2" and "codeChanged" not in r.json()
        runner.check("каталог: PUT без смены кода -> 200", ok, "status " + str(r.status))

        # 6. code change with cascade (launch referencing CODE_A)
        r = api(req, "POST", "/api/launches", {"partCode": CODE_A, "paNumber": PA, "qty": 3, "name": "Тест-запуск"}, token=tokens["master"])
        launch_ok = r.status == 201 and bool(r.json().get("id"))
        runner.check("каталог: создан тестовый запуск на CODE_A", launch_ok, "status " + str(r.status))
        launch_id = r.json().get("id")

        r = api(req, "PUT", "/api/catalog/" + CODE_A, {"code": CODE_B, "name": "Тест-позиция v2", "designation": "TST-OB"}, token=tokens["admin"])
        body = r.json()
        ok = (
            r.status == 200
            and body.get("codeChanged") is True
            and body.get("moved", {}).get("launches") >= 1
            and body.get("code") == CODE_B
        )
        runner.check("каталог: смена кода с каскадом ссылок", ok, "status " + str(r.status) + " moved " + str(body.get("moved")))

        # 7. delete of a referenced code -> 409
        r = api(req, "DELETE", "/api/catalog/" + CODE_B, token=tokens["master"])
        body = r.json()
        ok = r.status == 409 and str(body.get("error", "")).startswith("Код используется") and body.get("refs", {}).get("launches") >= 1
        runner.check("каталог: delete занятого кода -> 409", ok, "status " + str(r.status))

        # 8. launch removed, 9. code removed
        r = api(req, "DELETE", "/api/launches/" + launch_id, token=tokens["master"])
        runner.check("каталог: тестовый запуск удалён", r.status == 200, str(r.status))
        r = api(req, "DELETE", "/api/catalog/" + CODE_B, token=tokens["master"])
        runner.check("каталог: delete освобождённого кода -> 200", r.status == 200 and r.json().get("ok") is True, str(r.status))

        # 10. gone from catalog
        r = api(req, "GET", "/api/catalog?search=" + CODE_A, token=tokens["master"])
        codes = [c.get("code") for c in r.json()]
        runner.check("каталог: после удаления TST-коды не в списке", r.status == 200 and CODE_A not in codes and CODE_B not in codes, str(codes))

        # 404 on direct fetch of removed code
        r = api(req, "GET", "/api/catalog/" + CODE_B, token=tokens["master"])
        runner.check("каталог: GET удалённого кода -> 404", r.status == 404, str(r.status))
        ctx.close()

        # ---- UI-часть: /admin таб «Номенклатура» ----
        adm_ctx = browser.new_context(viewport={"width": 1280, "height": 850})
        page = adm_ctx.new_page()
        ok = False
        try:
            helpers.open_app(page)
            helpers.do_login(page, config.CREDS["admin"])
            page.wait_for_url("**/admin", timeout=15000)
            page.click('button[data-panel="catalog"]')
            page.wait_for_selector("#cmAdd", timeout=15000)
            ok = page.is_visible("#cmAdd")
        except Exception as e:
            runner.check("UI admin: таб «Номенклатура» смонтирован (#cmAdd)", False, str(e)[:200])
        runner.check("UI admin: таб «Номенклатура» смонтирован (#cmAdd)", ok, "")
        helpers.save_screenshot(page, "catalog_admin_tab.png")
        adm_ctx.close()

        # ---- UI-часть: /master таб «Номенклатура» ----
        mst_ctx = browser.new_context(viewport={"width": 1280, "height": 850})
        page = mst_ctx.new_page()
        ok = False
        try:
            helpers.open_app(page)
            helpers.do_login(page, config.CREDS["master"])
            page.wait_for_url("**/master", timeout=15000)
            page.click('button[data-tab="nomenclatura"]')
            page.wait_for_selector("#cmAdd", timeout=15000)
            ok = page.is_visible("#cmAdd")
        except Exception as e:
            runner.check("UI master: таб «Номенклатура» смонтирован (#cmAdd)", False, str(e)[:200])
        runner.check("UI master: таб «Номенклатура» смонтирован (#cmAdd)", ok, "")
        helpers.save_screenshot(page, "catalog_master_tab.png")
        mst_ctx.close()

        # ---- Cleanup ----
        run_sql(
            "DELETE FROM \"Launches\" WHERE \"paNumber\" LIKE 'TST-PA-%';"
        )
        run_sql(
            "DELETE FROM \"Catalog\" WHERE \"code\" LIKE 'TST-%';"
        )
        left = run_sql(
            "SELECT count(*) FROM \"Catalog\" WHERE \"code\" LIKE 'TST-%';"
        )
        runner.check("cleanup: тестовые позиции каталога удалены", left == "0", left)

        browser.close()

    runner.finish()


if __name__ == "__main__":
    main()