"""E2E probe: auth, registration, login protection, deactivation (new stack).

Drives the live stand (localhost:3000) with the shared demo password:

  Авторизация — login of all 5 seeded roles -> 200 + token; wrong password -> 401;
                session/refresh/logout lifecycle; /me.
  Регистрация  — API: role in body is forced to operator, auto-login, duplicate
                login -> 409, validation 400s; UI: tab «Регистрация» -> /operator.
  Защита входа — 5 failed logins on a TEST login -> 6th attempt blocked (429).
  Деактивация  — admin deactivates the test operator -> login 403, session/refresh
                401, excluded from GET /api/employees, reactivation -> 200;
                admin self-deactivation -> 400.

The test operator is created, exercised and then REMOVED via SQL (docker exec).
The throttle block affects only the synthetic `nobody-probe` login (in-memory,
expires in 15 min, never a live role).
"""

import json
import os
import random
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import runner

TS = time.strftime("%H%M%S") + str(random.randint(10, 99))
OP_LOGIN = "op_probe_" + TS
OP_UI_LOGIN = "op_ui_" + TS
OP_PASS = "probe12345"  # тестовый пароль, к боевым/сидовым не относится
OP_NAME = "Пробов Т. Т."
PROBE_LOGIN = "nobody-probe"

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

        # ---- Авторизация: вход всех 5 боевых ролей ----
        auth_ctx = browser.new_context()
        auth_req = auth_ctx.request
        tokens = {}
        for role in ["admin", "master", "shift", "operator", "otk"]:
            cred = config.CREDS[role]
            r = login(auth_req, cred["login"], cred["password"])
            body = r.json()
            ok = r.status == 200 and bool(body.get("accessToken")) and body.get("user", {}).get("role") == role
            if role == "admin":
                tokens["admin"] = body.get("accessToken")
            runner.check("авторизация: вход " + role, ok, "status " + str(r.status))

        cu = auth_ctx.cookies()
        has_refresh = any(c.get("name") == "nd_refresh" for c in cu)
        runner.check("авторизация: кука nd_refresh установлена", has_refresh, str(len(cu)) + " cookies")

        # Неверный пароль отклоняется даже для существующего логина
        r = login(auth_req, config.CREDS["admin"]["login"], "wrong-pass-000")
        runner.check("авторизация: неверный пароль отклонён (401)", r.status == 401, str(r.status))

        # refresh / session / logout lifecycle (кука текущей сессии в контексте)
        r = api(auth_req, "POST", "/api/refresh")
        runner.check("авторизация: refresh -> 200", r.status == 200 and bool(r.json().get("accessToken")), str(r.status))
        r = api(auth_req, "GET", "/api/session")
        runner.check("авторизация: session -> 200", r.status == 200 and bool(r.json().get("accessToken")), str(r.status))
        api(auth_req, "POST", "/api/logout", {})
        after_logout = [c.get("name") for c in auth_ctx.cookies()]
        runner.check("авторизация: logout очистил куку", "nd_refresh" not in after_logout, str(after_logout))
        r = api(auth_req, "GET", "/api/session")
        runner.check("авторизация: session после logout -> 401", r.status == 401, str(r.status))

        # /me с Bearer-токеном
        r = api(auth_req, "GET", "/api/me", token=tokens["admin"])
        runner.check("авторизация: /me (bearer) -> role admin", r.status == 200 and r.json().get("user", {}).get("role") == "admin", str(r.status))

        # ---- Регистрация (API) ----
        r = api(auth_req, "POST", "/api/register", {
            "fullName": OP_NAME,
            "login": OP_LOGIN,
            "password": OP_PASS,
            "confirmPassword": OP_PASS,
            "remember": False,
            "role": "otk",  # сервер должен игнорировать
        })
        body = r.json()
        forced_operator = r.status == 200 and body.get("user", {}).get("role") == "operator"
        runner.check("регистрация: 200 + авто-вход, роль принудительно operator", forced_operator, "status " + str(r.status) + " role " + str(body.get("user", {}).get("role")))

        r = api(auth_req, "POST", "/api/register", {
            "fullName": OP_NAME,
            "login": OP_LOGIN,
            "password": OP_PASS,
            "confirmPassword": OP_PASS,
            "remember": False,
        })
        runner.check("регистрация: дубль логина -> 409", r.status == 409, str(r.status))

        invalid = [
            ("пустой логин", {"fullName": OP_NAME, "login": "", "password": OP_PASS, "confirmPassword": OP_PASS}),
            ("логин > 40", {"fullName": OP_NAME, "login": "x" * 41, "password": OP_PASS, "confirmPassword": OP_PASS}),
            ("ФИО одним словом", {"fullName": "Пробов", "login": "no_login_1", "password": OP_PASS, "confirmPassword": OP_PASS}),
            ("пароль < 6", {"fullName": OP_NAME, "login": "no_login_2", "password": "12345", "confirmPassword": "12345"}),
            ("пароли не совпадают", {"fullName": OP_NAME, "login": "no_login_3", "password": OP_PASS, "confirmPassword": OP_PASS + "!"}),
        ]
        for label, payload in invalid:
            r = api(auth_req, "POST", "/api/register", payload)
            runner.check("регистрация: 400 (" + label + ")", r.status == 400, str(r.status))

        # ---- Регистрация (UI): таб «Регистрация» -> /operator ----
        ui_ctx = browser.new_context()
        page = ui_ctx.new_page()
        page.goto(BASE + "/login", wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        try:
            page.wait_for_selector("#tabRegister", timeout=15000)
            page.click("#tabRegister")
            page.fill("#regFullName", OP_NAME)
            page.fill("#regLogin", OP_UI_LOGIN)
            page.fill("#regPassword", OP_PASS)
            page.fill("#regConfirm", OP_PASS)
            page.click("#registerForm button[type='submit']")
            page.wait_for_url("**/operator", timeout=15000)
            runner.check("UI регистрация: редирект на /operator", "/operator" in page.url, page.url)
            try:
                page.click("text=Выйти")
                page.wait_for_url("**/login", timeout=15000)
                runner.check("UI регистрация: Выйти -> /login", "/login" in page.url, page.url)
            except Exception:
                runner.check("UI регистрация: Выйти -> /login", False, "нет кнопки Выйти")
        except Exception as e:
            runner.check("UI регистрация: редирект на /operator", False, str(e)[:200])
        ui_ctx.close()

        # ---- Защита входа: 5 неудач -> блок (429) на 6-й попытке ----
        th_ctx = browser.new_context()
        th_req = th_ctx.request
        fails = 0
        for _ in range(5):
            r = login(th_req, PROBE_LOGIN, "wrong-pass")
            if r.status == 401:
                fails += 1
        runner.check("защита: 5 неудач подряд -> 401", fails == 5, str(fails))
        r = login(th_req, PROBE_LOGIN, "whatever")
        runner.check("защита: 6-я попытка -> 429 блок", r.status == 429, str(r.status))
        th_ctx.close()

        # ---- Деактивация (тестовый оператор) ----
        op_ctx = browser.new_context()
        op_req = op_ctx.request
        r = login(op_req, OP_LOGIN, OP_PASS)
        runner.check("деактивация: вход тестового оператора -> 200", r.status == 200, str(r.status))
        cm = config.CREDS["admin"]
        admin_token = login(auth_req, cm["login"], cm["password"]).json().get("accessToken")

        r = api(op_req, "PATCH", "/api/admin/employees/" + OP_LOGIN, {"isActive": False}, token=admin_token)
        runner.check("деактивация: PATCH isActive=false (admin)", r.status == 200, str(r.status))

        r = login(op_req, OP_LOGIN, OP_PASS)
        runner.check("деактивация: вход отключённого -> 403", r.status == 403, str(r.status))
        r = api(op_req, "GET", "/api/session")
        runner.check("деактивация: session отключённого -> 401", r.status == 401, str(r.status))
        r = api(op_req, "POST", "/api/refresh")
        runner.check("деактивация: refresh отключённого -> 401", r.status == 401, str(r.status))

        r = api(auth_req, "GET", "/api/employees", token=admin_token)
        logins = [e.get("login") for e in r.json()]
        runner.check("деактивация: отключённый скрыт из /api/employees", r.status == 200 and OP_LOGIN not in logins, str(r.status))

        r = api(op_req, "PATCH", "/api/admin/employees/" + OP_LOGIN, {"isActive": True}, token=admin_token)
        runner.check("деактивация: реактивация -> 200", r.status == 200, str(r.status))
        r = login(op_req, OP_LOGIN, OP_PASS)
        runner.check("деактивация: вход после реактивации -> 200", r.status == 200, str(r.status))

        r = api(auth_req, "PATCH", "/api/admin/employees/" + cm["login"], {"isActive": False}, token=admin_token)
        runner.check("деактивация: сам-отключение admin -> 400", r.status == 400, str(r.status))

        # ---- Cleanup: тестовый оператор удаляется SQL-ом ----
        run_sql("DELETE FROM \"Employees\" WHERE \"login\" IN ('" + OP_LOGIN + "', '" + OP_UI_LOGIN + "');")
        left = run_sql("SELECT count(*) FROM \"Employees\" WHERE \"login\" IN ('" + OP_LOGIN + "', '" + OP_UI_LOGIN + "');")
        runner.check("cleanup: тестовые операторы удалены", left == "0", left)

        op_ctx.close()
        auth_ctx.close()
        browser.close()

    runner.finish()


if __name__ == "__main__":
    main()