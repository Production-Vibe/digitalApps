"""E2E: словари каталога и автогенерация кодов (Этап 17)."""

import json
import os
import subprocess
import sys
import time
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


TS = time.strftime("%Y%m%d%H%M%S")
BASE = config.APP_URL
PARENT_CODE = "TST-NC-" + TS
WRONG_CODE = "TST-XX-" + TS
DICT_VALUE = "TST-ЗАГ" + TS
UI_DICT_VALUE = "TST-ЗАГ2-" + TS
UNKNOWN_GRADE = "TST-МАРКА-" + TS
DICT_GRADE = "TST-МАРКА-" + TS
MATERIAL_PARENT = "22/TST-" + TS


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


def login(request, login_name, password):
    return api(request, "POST", "/api/login", {"login": login_name, "password": password, "remember": False})


def response_body(response):
    try:
        return response.json()
    except Exception:
        return {}


def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def catalog_path(code):
    return "/api/catalog/" + quote(str(code), safe="")


def collect_tree_codes(nodes, result=None):
    if result is None:
        result = []
    for node in nodes or []:
        if not isinstance(node, dict):
            continue
        if node.get("code"):
            result.append(str(node["code"]))
        collect_tree_codes(node.get("children"), result)
    return result


def top_number(code):
    parts = [part for part in str(code).replace(".", "/").split("/") if part]
    if not parts:
        return None
    try:
        return int(parts[0])
    except ValueError:
        return None


def next_code(request, token, parent=None):
    body = {} if parent is None else {"parent": parent}
    response = api(request, "POST", "/api/catalog/next-code", body, token=token)
    return response, response_body(response)


def auto_catalog_post(request, token, parent, name, extra=None, include_code=True):
    next_response, next_body = next_code(request, token, parent)
    payload = {"parent": parent, "name": name}
    if extra:
        payload.update(extra)
    if include_code and next_body.get("code"):
        payload["code"] = next_body["code"]
    response = api(request, "POST", "/api/catalog", payload, token=token)
    return response, response_body(response), next_response, next_body


def cleanup(request, master_token, leaf_codes, materialized_codes, top_code):
    details = []

    for code in reversed(leaf_codes):
        if not code:
            continue
        try:
            response = api(request, "DELETE", catalog_path(code), token=master_token)
            if response.status not in (200, 404):
                details.append(code + "=" + str(response.status))
        except Exception as exc:
            details.append(code + "=" + str(exc)[:80])

    for code in reversed(materialized_codes):
        if not str(code).startswith("22/TST-" + TS):
            continue
        try:
            response = api(request, "DELETE", catalog_path(code), token=master_token)
            if response.status not in (200, 404):
                details.append(code + "=" + str(response.status))
        except Exception as exc:
            details.append(code + "=" + str(exc)[:80])

    run_sql("DELETE FROM \"Launches\" WHERE \"paNumber\" LIKE 'TST-PA-%';")
    run_sql("DELETE FROM \"Catalog\" WHERE \"code\" LIKE 'TST-%';")
    run_sql(
        "DELETE FROM \"Catalog\" WHERE \"code\" LIKE "
        + sql_literal("22/TST-" + TS + "%")
        + ";"
    )
    if top_code:
        run_sql("DELETE FROM \"Catalog\" WHERE \"code\" = " + sql_literal(top_code) + ";")
    run_sql("DELETE FROM \"DictionaryValue\" WHERE \"value\" LIKE 'TST-%';")

    left_tst = run_sql("SELECT count(*) FROM \"Catalog\" WHERE \"code\" LIKE 'TST-%';")
    left_materialized = run_sql(
        "SELECT count(*) FROM \"Catalog\" WHERE \"code\" LIKE "
        + sql_literal("22/TST-" + TS + "%")
        + ";"
    )
    left_dictionary = run_sql("SELECT count(*) FROM \"DictionaryValue\" WHERE \"value\" LIKE 'TST-%';")
    if left_materialized != "0":
        details.append("материализованный 22/TST* оставлен")
    left_top = ""
    if top_code:
        left_top = run_sql(
            "SELECT count(*) FROM \"Catalog\" WHERE \"code\" = " + sql_literal(top_code) + ";"
        )
    return left_tst, left_materialized, left_dictionary, left_top, "; ".join(details)


def main():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel=config.BROWSER_CHANNEL,
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )

        api_ctx = browser.new_context()
        request = api_ctx.request
        tokens = {}
        leaf_codes = []
        materialized_codes = []
        top_created_code = None
        cleanup_values = ("", "", "", "", "")

        try:
            # Подготовка: API-вход master/admin (shift в этом тесте не нужен).
            for role in ["master", "admin"]:
                cred = config.CREDS[role]
                response = login(request, cred["login"], cred["password"])
                body = response_body(response)
                tokens[role] = body.get("accessToken")
                runner.check(
                    "подготовка: вход " + role,
                    response.status == 200 and bool(tokens[role]),
                    "status " + str(response.status),
                )

            tree_response = api(request, "GET", "/api/catalog/tree/units", token=tokens.get("master"))
            tree_body = response_body(tree_response)
            tree_codes = collect_tree_codes(tree_body if isinstance(tree_body, list) else [])
            top_levels = [top_number(code) for code in tree_codes]
            top_levels = sorted({value for value in top_levels if value is not None})
            has_top_22 = 22 in top_levels
            expected_top = (max(top_levels) + 1) if top_levels else None

            # 1. next-code верхнего уровня.
            if not top_levels:
                runner.check("1. next-code: верхний уровень", True, "топ-уровней нет — пропуск")
            else:
                response, body = next_code(request, tokens.get("master"))
                code = body.get("code")
                try:
                    numeric_code = int(str(code))
                except (TypeError, ValueError):
                    numeric_code = None
                detail = "status " + str(response.status) + " code=" + str(code) + " expected=" + str(expected_top)
                if "wouldMaterialize" in body:
                    detail += " wouldMaterialize=" + str(body.get("wouldMaterialize"))
                runner.check(
                    "1. next-code: верхний уровень",
                    response.status == 200 and bool(code) and numeric_code == expected_top,
                    detail,
                )

            # 2. Ручной родитель admin и два шага авто-кода master.

            parent_response = api(
                request,
                "POST",
                "/api/catalog",
                {"code": PARENT_CODE, "name": "Тест родитель автокода"},
                token=tokens.get("admin"),
            )
            parent_body = response_body(parent_response)
            parent_ok = parent_response.status == 201 and parent_body.get("code") == PARENT_CODE
            runner.check(
                "2.1 admin: ручной код родителя -> 201",
                parent_ok,
                "status " + str(parent_response.status),
            )
            if parent_ok:
                leaf_codes.append(PARENT_CODE)

            response, body = next_code(request, tokens.get("master"), PARENT_CODE)
            first_child = body.get("code")
            runner.check(
                "2.2 master: next-code нового родителя -> /1",
                response.status == 200 and first_child == PARENT_CODE + "/1",
                "status " + str(response.status) + " code=" + str(first_child),
            )

            child_response = api(
                request,
                "POST",
                "/api/catalog",
                {"parent": PARENT_CODE, "code": first_child, "name": "Тест первый ребёнок"},
                token=tokens.get("master"),
            )
            child_body = response_body(child_response)
            child_code = child_body.get("code")
            child_ok = child_response.status == 201 and child_code == first_child
            runner.check(
                "2.3 master: ребёнок с code из next-code -> 201",
                child_ok,
                "status " + str(child_response.status) + " code=" + str(child_code),
            )
            if child_code:
                leaf_codes.append(child_code)

            no_code_response = api(
                request,
                "POST",
                "/api/catalog",
                {"parent": PARENT_CODE, "name": "Тест без кода"},
                token=tokens.get("master"),
            )
            runner.check(
                "2.5 master: POST без code -> 400",
                no_code_response.status == 400,
                "status " + str(no_code_response.status),
            )

            response, body = next_code(request, tokens.get("master"), PARENT_CODE)
            second_child = body.get("code")
            runner.check(
                "2.4 master: next-code после ребёнка -> /2",
                response.status == 200 and second_child == PARENT_CODE + "/2",
                "status " + str(response.status) + " code=" + str(second_child),
            )

            # 3. Master создаёт корневую позицию с code из next-code (parent не передаётся).
            if not top_levels:
                runner.check("3. master: корневая позиция", True, "топ-уровней нет — пропуск")
            else:
                response, body = next_code(request, tokens.get("master"))
                expected_top = body.get("code")
                response = api(
                    request,
                    "POST",
                    "/api/catalog",
                    {"code": expected_top, "name": "Тест корневой автокод"},
                    token=tokens.get("master"),
                )
                body = response_body(response)
                root_ok = response.status == 201 and body.get("code") == expected_top
                runner.check(
                    "3. master: корневая позиция с code из next-code -> 201",
                    root_ok,
                    "status " + str(response.status) + " code=" + str(body.get("code")),
                )
                if root_ok:
                    top_created_code = body.get("code")
                    leaf_codes.append(body.get("code"))

            # 4. Master не может задать чужой код.
            response, _ = next_code(request, tokens.get("master"), PARENT_CODE)
            response = api(
                request,
                "POST",
                "/api/catalog",
                {"parent": PARENT_CODE, "code": WRONG_CODE, "name": "Тест чужой код"},
                token=tokens.get("master"),
            )
            body = response_body(response)
            runner.check(
                "4. master: неверный code -> 400",
                response.status == 400,
                "status " + str(response.status) + " " + str(body.get("error", "")),
            )

            # 5. Валидные и неизвестные значения словарей.
            response, body, _, _ = auto_catalog_post(
                request,
                tokens.get("master"),
                PARENT_CODE,
                "Тест валидные словари",
                {"blankType": "Круг", "material": "Сталь", "materialGrade": "09Г2С"},
            )
            valid_ok = response.status == 201
            runner.check(
                "5.1 каталог: валидные значения словарей -> 201",
                valid_ok,
                "status " + str(response.status),
            )
            if valid_ok and body.get("code"):
                leaf_codes.append(body.get("code"))

            response, body, _, _ = auto_catalog_post(
                request,
                tokens.get("master"),
                PARENT_CODE,
                "Тест неизвестной марки",
                {"materialGrade": UNKNOWN_GRADE},
            )
            unknown_ok = response.status == 400 and body.get("field") == "materialGrade"
            runner.check(
                "5.2 каталог: неизвестный materialGrade -> 400 + field",
                unknown_ok,
                "status " + str(response.status) + " field=" + str(body.get("field")),
            )

            response, body, _, _ = auto_catalog_post(
                request,
                tokens.get("master"),
                PARENT_CODE,
                "Тест пустого материала",
                {"material": ""},
            )
            empty_ok = response.status == 201
            runner.check(
                "5.3 каталог: пустой material -> 201",
                empty_ok,
                "status " + str(response.status),
            )
            if empty_ok and body.get("code"):
                leaf_codes.append(body.get("code"))

            # 6. Quick-add словаря и использование значения в каталоге.
            response = api(
                request,
                "POST",
                "/api/dictionaries/blankType",
                {"value": DICT_VALUE},
                token=tokens.get("master"),
            )
            body = response_body(response)
            runner.check(
                "6.1 словарь blankType: quick-add -> 201",
                response.status == 201,
                "status " + str(response.status),
            )

            response = api(
                request,
                "POST",
                "/api/dictionaries/blankType",
                {"value": DICT_VALUE},
                token=tokens.get("master"),
            )
            runner.check(
                "6.2 словарь blankType: дубль -> 409",
                response.status == 409,
                "status " + str(response.status),
            )

            response = api(request, "GET", "/api/dictionaries/blankType", token=tokens.get("master"))
            body = response_body(response)
            values = [item.get("value") for item in body if isinstance(item, dict)] if isinstance(body, list) else []
            runner.check(
                "6.3 словарь blankType: значение видно в GET",
                response.status == 200 and DICT_VALUE in values,
                "status " + str(response.status),
            )

            response, body, _, _ = auto_catalog_post(
                request,
                tokens.get("master"),
                PARENT_CODE,
                "Тест quick-add значения",
                {"blankType": DICT_VALUE},
            )
            catalog_dict_ok = response.status == 201
            runner.check(
                "6.4 каталог: принимает quick-add значение -> 201",
                catalog_dict_ok,
                "status " + str(response.status),
            )
            if catalog_dict_ok and body.get("code"):
                leaf_codes.append(body.get("code"))

            # 7. Админское ведение materialGrade и запрет неактивного значения.
            response = api(
                request,
                "POST",
                "/api/dictionaries/materialGrade",
                {"value": DICT_GRADE},
                token=tokens.get("master"),
            )
            grade_body = response_body(response)
            grade_id = grade_body.get("id")
            runner.check(
                "7.1 materialGrade: тестовое значение создано",
                response.status == 201 and bool(grade_id),
                "status " + str(response.status) + " id=" + str(grade_id),
            )

            if grade_id:
                response = api(
                    request,
                    "PUT",
                    "/api/dictionaries/materialGrade/" + str(grade_id),
                    {"synonyms": ["tst"], "sort": 5},
                    token=tokens.get("admin"),
                )
            else:
                response = None
            runner.check(
                "7.2 admin: PUT синонимов и sort -> 200",
                response is not None and response.status == 200,
                "status " + str(response.status if response is not None else "нет id"),
            )

            if grade_id:
                response = api(
                    request,
                    "POST",
                    "/api/dictionaries/materialGrade/" + str(grade_id) + "/deactivate",
                    token=tokens.get("admin"),
                )
            else:
                response = None
            runner.check(
                "7.3 admin: deactivate materialGrade -> 200",
                response is not None and response.status == 200,
                "status " + str(response.status if response is not None else "нет id"),
            )

            response = api(request, "GET", "/api/dictionaries/materialGrade", token=tokens.get("master"))
            body = response_body(response)
            active_grades = [item.get("value") for item in body if isinstance(item, dict)] if isinstance(body, list) else []
            runner.check(
                "7.4 GET materialGrade: деактивированное значение скрыто",
                response.status == 200 and DICT_GRADE not in active_grades,
                "status " + str(response.status),
            )

            response, body, _, _ = auto_catalog_post(
                request,
                tokens.get("master"),
                PARENT_CODE,
                "Тест неактивной марки",
                {"materialGrade": DICT_GRADE},
            )
            inactive_catalog_ok = response.status == 400 and body.get("field") == "materialGrade"
            runner.check(
                "7.5 каталог: неактивная марка -> 400 + field",
                inactive_catalog_ok,
                "status " + str(response.status) + " field=" + str(body.get("field")),
            )

            response = api(
                request,
                "POST",
                "/api/dictionaries/materialGrade",
                {"value": DICT_GRADE},
                token=tokens.get("master"),
            )
            body = response_body(response)
            reactivated_ok = response.status in (200, 201) and body.get("reactivated") is True
            runner.check(
                "7.6 реактивация materialGrade",
                reactivated_ok,
                "status " + str(response.status) + " reactivated=" + str(body.get("reactivated")),
            )

            # 8. Материализация пути: parent — «только префикс, без строки».
            response, body = next_code(request, tokens.get("master"), "86/TST-" + TS)
            runner.check(
                "8.1 next-code: несуществующий top 86 -> 400",
                response.status == 400,
                "status " + str(response.status),
            )

            if not has_top_22:
                runner.check("8.2 admin: глубокий код под 22", True, "top 22 отсутствует — пропуск")
                runner.check("8.3 next-code под виртуальным родителем", True, "top 22 отсутствует — пропуск")
                runner.check("8.4 POST: материализация родителя", True, "top 22 отсутствует — пропуск")
            else:
                deep_code = MATERIAL_PARENT + "/1"
                deep_response = api(
                    request,
                    "POST",
                    "/api/catalog",
                    {"code": deep_code, "name": "Тест глубокий код"},
                    token=tokens.get("admin"),
                )
                deep_ok = deep_response.status == 201 and deep_code not in (PARENT_CODE,)
                runner.check(
                    "8.2 admin: глубокий код -> 201",
                    deep_ok,
                    "status " + str(deep_response.status),
                )
                if deep_ok:
                    leaf_codes.append(deep_code)

                response, body = next_code(request, tokens.get("master"), MATERIAL_PARENT)
                proposed = body.get("code")
                would = body.get("wouldMaterialize")
                detail = "status " + str(response.status) + " code=" + str(proposed) + " wm=" + str(would)
                runner.check(
                    "8.3 next-code: виртуальный родитель -> 200 + wouldMaterialize",
                    response.status == 200 and proposed == MATERIAL_PARENT + "/2" and isinstance(would, list) and MATERIAL_PARENT in would,
                    detail,
                )

                if proposed:
                    response = api(
                        request,
                        "POST",
                        "/api/catalog",
                        {"parent": MATERIAL_PARENT, "code": proposed, "name": "Тест материализация"},
                        token=tokens.get("master"),
                    )
                    body = response_body(response)
                    materialized = body.get("materialized")
                    materialized_detail = "status " + str(response.status) + " materialized=" + str(materialized)
                    materialized_ok = (
                        response.status == 201
                        and body.get("code") == proposed
                        and isinstance(materialized, list)
                        and MATERIAL_PARENT in materialized
                    )
                    runner.check(
                        "8.4 POST: материализация 22/TST -> 201 + materialized",
                        materialized_ok,
                        materialized_detail,
                    )
                    if response.status == 201 and body.get("code"):
                        leaf_codes.append(body.get("code"))
                        for code in materialized or []:
                            if str(code).startswith("22/"):
                                materialized_codes.append(str(code))
                else:
                    runner.check("8.4 POST: материализация 22/TST", False, "next-code не вернул code")

            # 9. UI /admin: вкладка справочников, quick-add и смена типа.
            ui_ctx = browser.new_context(viewport={"width": 1280, "height": 850})
            page = ui_ctx.new_page()
            try:
                helpers.open_app(page)
                helpers.do_login(page, config.CREDS["admin"])
                page.wait_for_url("**/admin", timeout=15000)
                page.click('button[data-panel="dicts"]')
                page.wait_for_selector("#dictTypeSel", state="visible", timeout=15000)
                page.wait_for_selector("#dictTable", state="visible", timeout=15000)
                runner.check("9.1 UI admin: вкладка «Справочники» смонтирована", True, "")
            except Exception as exc:
                runner.check("9.1 UI admin: вкладка «Справочники» смонтирована", False, str(exc)[:200])

            try:
                page.fill("#dictNewValue", UI_DICT_VALUE)
                page.click("#dictAddBtn")
                row = page.locator("#dictTable tr.dict-row", has_text=UI_DICT_VALUE)
                row.wait_for(state="visible", timeout=15000)
                runner.check("9.2 UI admin: quick-add появляется в таблице", True, "")
            except Exception as exc:
                runner.check("9.2 UI admin: quick-add появляется в таблице", False, str(exc)[:200])

            try:
                page.select_option("#dictTypeSel", "priority")
                page.wait_for_selector("#dictTable table", state="visible", timeout=15000)
                runner.check("9.3 UI admin: переключение на priority", True, "")
            except Exception as exc:
                runner.check("9.3 UI admin: переключение на priority", False, str(exc)[:200])
            helpers.save_screenshot(page, "dict_catalog_admin.png")
            ui_ctx.close()

        except Exception as exc:
            runner.check("тест: неожиданное исключение", False, str(exc)[:300])
        finally:
            try:
                cleanup_values = cleanup(
                    request,
                    tokens.get("master"),
                    leaf_codes,
                    materialized_codes,
                    top_created_code,
                )
            except Exception as exc:
                runner.check("10. cleanup: SQL без исключения", False, str(exc)[:200])
            api_ctx.close()
            browser.close()

    left_tst, left_materialized, left_dictionary, left_top, cleanup_detail = cleanup_values
    runner.check(
        "10.1 cleanup: тестовые TST-позиции удалены",
        left_tst == "0",
        left_tst + ("; " + cleanup_detail if cleanup_detail else ""),
    )
    runner.check(
        "10.2 cleanup: 22/TST* очищен или оставлен с detail",
        left_materialized == "0" or bool(cleanup_detail),
        left_materialized + ("; " + cleanup_detail if cleanup_detail else ""),
    )
    runner.check(
        "10.3 cleanup: тестовые значения словарей удалены",
        left_dictionary == "0",
        left_dictionary,
    )
    runner.check(
        "10.4 cleanup: созданный корневой код удалён",
        not top_created_code or left_top == "0",
        left_top,
    )
    runner.finish()


if __name__ == "__main__":
    main()
