import os
import sys
import time
import urllib.parse

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, r"C:\Projects\digitalApps\tests\e2e")

import config
import helpers

from playwright.sync_api import sync_playwright


def call(page, fn, *args):
    import json
    fr = helpers.app_frame(page)
    args_js = ",".join(json.dumps(a, ensure_ascii=False) for a in args)
    expr = (
        "new Promise(function(res, rej){"
        "google.script.run.withSuccessHandler(function(v){ res(v); })"
        ".withFailureHandler(function(e){ rej(String(e)); })"
        ".%s(%s);})" % (fn, args_js)
    )
    return fr.evaluate(expr)


with sync_playwright() as p:
    browser = p.chromium.launch(
        channel=config.BROWSER_CHANNEL,
        headless=True,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation"],
    )
    ctx = browser.new_context(storage_state=config.STORAGE_STATE, viewport={"width": 1280, "height": 850})
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    helpers.goto_page(page, "page=otk-app&name=" + urllib.parse.quote(config.CREDS["otk"]["name"], safe=""))
    time.sleep(4)

    for pa, qty, name in [("118", 1, "E2E сид-запуск 1"), ("119", 2, "E2E сид-запуск 2"), ("120", 1, "E2E сид-запуск 3")]:
        r = call(page, "createLaunch", "E2E-OTK", name, "шт", qty, pa, "К запуску", "Основной", "", "")
        print(pa, "->", r, flush=True)
        time.sleep(1.5)
    browser.close()