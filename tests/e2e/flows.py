"""Общие E2E-шаги флоу «ЦифровойНаряд» (roles: operator/shift/otk).

Смена ролей — прямая навигация ?page=<role>&name=<ФИО> (как страницы ролей и
открываются; вход по форме покрывают smoke-тесты). Конфигурация — config.py
(ФИО должны совпадать с листом Employees, т.к. серверные isRole() сверяют ФИО).

Используется тестами:
  test_bizcycle.py — полный бизнес-цикл (выдача -> оператор -> ОТК -> rework)
  test_otk_full.py — расширенный прогон роли ОТК (позитив + негатив + края)
"""

import re
import time
import urllib.parse

import config
import helpers
import runner


def launch_page(playwright):
    """Браузер с сохранённой сессией, confirm->true и принятием диалогов.

    Возвращает (browser, page). Закрытие browser — на вызывающей стороне.
    """
    browser = playwright.chromium.launch(
        channel=config.BROWSER_CHANNEL,
        headless=True,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation"],
    )
    ctx = browser.new_context(
        storage_state=config.STORAGE_STATE,
        viewport={"width": 1280, "height": 850},
    )
    ctx.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.confirm = function(){ return true; };
        """
    )
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    return browser, page


def all_toast_text(page):
    out = []
    for fr in helpers.frames_with(page):
        try:
            txt = fr.eval_on_selector_all(
                ".toast, #toast", "els => els.map(e => e.textContent || '').join(' ')"
            )
            if txt:
                out.append(txt)
        except Exception:
            continue
    return " | ".join(out)


def wait_toast_contains(page, marker, timeout=20000):
    deadline = time.time() + timeout / 1000.0
    while time.time() < deadline:
        if marker in all_toast_text(page):
            return True
        page.wait_for_timeout(150)
    return False


def capture_order_from_toast(page, timeout=12000):
    pat = re.compile(r"Н-\d{6}-\d{6}")
    deadline = time.time() + timeout / 1000.0
    while time.time() < deadline:
        m = pat.search(all_toast_text(page))
        if m:
            return m.group(0)
        page.wait_for_timeout(150)
    return None


def nav(page, role):
    name = urllib.parse.quote(config.CREDS[role]["name"], safe="")
    helpers.goto_page(page, config.LANDING[role] + "&name=" + name)


def machine_from_shift_block(fr):
    headers = fr.locator(".shift-header")
    for i in range(headers.count()):
        txt = headers.nth(i).inner_text()
        m = re.search(r"Станок:\s*(.+?)\s*$", txt)
        if m:
            return m.group(1).strip()
    return None


def operator_ensure_shift(page):
    try:
        helpers.wait_for_in_any_frame(page, ".shift-active", timeout=10000)
        fr = helpers.wait_for_in_any_frame(page, ".shift-active")
        machine = machine_from_shift_block(fr)
        runner.check("смена оператора уже открыта (переиспользована)", bool(machine), machine)
        return machine
    except Exception:
        pass

    fr = helpers.wait_for_in_any_frame(page, "#shiftMachine", timeout=25000)
    opts = fr.eval_on_selector_all("#shiftMachine option", "els => els.map(e => e.value)")
    if len(opts) <= 1 or not opts[1]:
        runner.check("оператор открыл смену", False, "нет свободных станков")
        raise RuntimeError("Не открыть смену оператора: список станков пуст")
    fr.select_option("#shiftMachine", index=1)
    btn = fr.locator("#openShiftBtn").first
    if btn.is_disabled():
        raise RuntimeError("Кнопка открытия смены заблокирована (нет свободных станков)")
    btn.click()
    opened = wait_toast_contains(page, "Смена открыта", 20000)
    helpers.wait_for_in_any_frame(page, ".shift-active", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, ".shift-active")
    machine = machine_from_shift_block(fr)
    runner.check("оператор открыл смену на станке", opened and bool(machine), machine)
    return machine


def shift_pick_row(fr):
    rows = fr.locator("#launchTable tr.clickable")
    for i in range(rows.count()):
        try:
            lq = rows.nth(i).locator(".left-qty").inner_text(timeout=1500)
        except Exception:
            continue
        m = re.search(r"(\d+)\s*/\s*\d+", lq)
        if m and int(m.group(1)) > 0:
            return rows.nth(i), int(m.group(1))
    return None, 0


def wait_active_operator(page, operator_name, timeout=15000):
    deadline = time.time() + timeout / 1000.0
    while time.time() < deadline:
        for fr in helpers.frames_with(page):
            try:
                pills = fr.locator(".operator-pill")
                for i in range(pills.count()):
                    if operator_name in pills.nth(i).inner_text(timeout=500):
                        return True
            except Exception:
                continue
        page.wait_for_timeout(200)
    return False


def shift_issue(page, operator_name, machine, qty=1):
    fr = helpers.wait_for_in_any_frame(page, "#launchTable", timeout=20000)
    if not wait_active_operator(page, operator_name, timeout=15000):
        runner.check("оператор виден в «Активные операторы» shift", False, operator_name)
        raise RuntimeError("Оператор '" + operator_name + "' не появился в активных операторах shift")
    row, remain = shift_pick_row(fr)
    if row is None:
        runner.check("найден запуск «К запуску» с остатком", False, "нет данных для выдачи")
        raise RuntimeError("Нет запусков «К запуску» с остатком для выдачи")
    runner.check("shift выбрал запуск с остатком", remain > 0, f"остаток {remain}")
    row.click()
    helpers.wait_for_in_any_frame(page, "#issueModal", timeout=10000)
    fr = helpers.wait_for_in_any_frame(page, "#issueModal")

    op_vals = fr.eval_on_selector_all("#issueOperator option", "els => els.map(e => e.value)")
    if operator_name not in op_vals:
        raise RuntimeError("Оператор '" + operator_name + "' не в списке активных операторов: " + str(op_vals))
    fr.select_option("#issueOperator", value=operator_name)
    mc_vals = fr.eval_on_selector_all("#issueMachine option", "els => els.map(e => e.value)")
    if machine not in mc_vals:
        raise RuntimeError("Станок '" + machine + "' не в списке: " + str(mc_vals))
    fr.select_option("#issueMachine", value=machine)
    fr.fill("#issueQty", str(qty))
    fr.locator("#issueModal button", has_text="Выдать").click()

    order_number = capture_order_from_toast(page)
    runner.check("shift выдал наряд (номер из toast)", bool(order_number), order_number or "")
    if not order_number:
        raise RuntimeError("Не удалось захватить номер наряда из toast")
    return order_number


def operator_accept(page, order_number):
    fr = helpers.wait_for_in_any_frame(page, "#assigned-content", timeout=20000)
    card = fr.locator(".card", has_text=order_number).first
    card.wait_for(state="visible", timeout=20000)
    card.locator("button", has_text="Принять").click()
    ok = wait_toast_contains(page, "принята", 20000)
    runner.check("оператор принял наряд (created → in_progress)", ok, order_number)


def operator_add_transition(page, order_number, desc, minutes=5, qty=1, lab="сохранён"):
    fr = helpers.wait_for_in_any_frame(page, ".tab", timeout=20000)
    fr.click('.tab[data-tab="current"]')
    fr = helpers.wait_for_in_any_frame(page, "#manualNaryadId", timeout=15000)
    fr.fill("#manualNaryadId", order_number)
    fr.locator("#panel-current button", has_text="Открыть").click()
    helpers.wait_for_in_any_frame(page, "#f_description", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, "#f_description")
    fr.fill("#f_description", desc)
    fr.fill("#f_melt", "E2E-ПЛАВКА-" + order_number[-4:])
    fr.fill("#f_time", str(minutes))
    fr.fill("#f_qty", str(qty))
    fr.click("#submitBtn")
    ok = wait_toast_contains(page, lab, 30000)
    if not ok:
        deadline = time.time() + 20000 / 1000.0
        while time.time() < deadline:
            obj = helpers.eval_server(page, "getOtkNaryad", order_number)
            st = (obj or {}).get("naryad", {}).get("status", "")
            if st == "waiting_otk":
                ok = True
                break
            page.wait_for_timeout(1500)
    runner.check(f"оператор сохранил переход (→ waiting_otk)", ok, desc)


def wait_queue_table(page, timeout=45000):
    """Ждать, пока #queueTable в каком-либо фрейме не пуст и видим.
    Без перезагрузок/перезапросов: страница сама вызывает loadQueue() при старте."""
    deadline = time.time() + timeout / 1000.0
    last = None
    while time.time() < deadline:
        for fr in helpers.frames_with(page):
            try:
                el = fr.locator("#queueTable")
                if el.count() == 0:
                    continue
                if el.is_visible() and el.inner_text(timeout=2000).strip():
                    return fr
            except Exception as e:
                last = e
        page.wait_for_timeout(300)
    raise last or TimeoutError("#queueTable not populated")


def otk_waiting_row(page, order_number):
    fr = wait_queue_table(page, timeout=30000)
    row = fr.locator("#queueTable tr", has_text=order_number).first
    row.wait_for(state="visible", timeout=20000)
    return fr, row


def otk_verify_in_waiting(page, order_number):
    fr, row = otk_waiting_row(page, order_number)
    seen = order_number in row.inner_text(timeout=2000)
    runner.check("OTK: наряд ВИДЕН в «Ждут ОТК» (фикс очереди)", seen, order_number)
    if not seen:
        raise RuntimeError("Наряд не появился в OTK-очереди «Ждут ОТК»")
    return fr, row


def otk_open_card(page, order_number):
    """Открыть карточку наряда по строке очереди текущей вкладки.

    Ждёт РЕНДЕР карточки (текст содержит «Наряд », без «Загрузка наряда…»),
    а не mere-появление `#naryadCard`: openNaryad() сначала ставит плейсхолдер и
    лишь потом асинхронно рендерит карточку; первый холодный getOtkNaryad под
    нагрузкой GAS может превышать 6s — прежний wait_by_element давал флейк B1."""
    fr = wait_queue_table(page, timeout=30000)
    row = fr.locator("#queueTable tr", has_text=order_number).first
    row.wait_for(state="visible", timeout=20000)
    row.locator("button", has_text="Открыть").click(timeout=60000)
    deadline = time.time() + 20000 / 1000.0
    last = None
    while time.time() < deadline:
        for f in helpers.frames_with(page):
            try:
                el = f.locator("#naryadCard")
                if el.count() == 0:
                    continue
                t = el.inner_text(timeout=400)
                if t and "Загрузка" not in t and "Наряд " in t:
                    return f
            except Exception as e:
                last = e
        page.wait_for_timeout(200)
    raise last or TimeoutError("#naryadCard not rendered")


def otk_check_transition(page, order_number, qty=0, defect=0, idx=0):
    """Проверить переход № idx: проставить Принято/Брак и кликнуть «Проверить»."""
    fr, row = otk_verify_in_waiting(page, order_number)
    row.locator("button", has_text="Открыть").click()
    helpers.wait_for_in_any_frame(page, f"#acc_{idx}", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, f"#acc_{idx}")
    fr.fill(f"#acc_{idx}", str(qty))
    fr.fill(f"#def_{idx}", str(defect))
    fr.locator("#naryadCard button", has_text="Проверить").nth(idx).click()

    deadline = time.time() + 25000 / 1000.0
    ok = False
    toast = ""
    while time.time() < deadline:
        toast = all_toast_text(page)
        if "проверен" in toast:
            ok = True
            break
        page.wait_for_timeout(200)
    runner.check("ОТК проверил переход", ok, order_number + " | " + toast[:140])
    if not ok:
        try:
            helpers.save_screenshot(page, "otk_check_error.png")
        except Exception:
            pass
    return ok


def wait_not_in_waiting(page, order_number, timeout=15000):
    deadline = time.time() + timeout / 1000.0
    while time.time() < deadline:
        for fr in helpers.frames_with(page):
            try:
                txt = fr.locator("#queueTable").inner_text(timeout=400)
            except Exception:
                continue
            if "Ждут ОТК" in txt and order_number not in txt:
                return True
        page.wait_for_timeout(200)
    return False


def otk_fill_decision(fr, qty, defect=0, reason="", note=""):
    fr.fill("#tot_acc", str(qty))
    fr.fill("#tot_def", str(defect))
    if reason:
        fr.fill("#def_reason", reason)
    if note:
        fr.fill("#closing_note", note)


def otk_close(page, order_number, qty, defect=0, reason="", note="", expect="закрыт", gone=True):
    """Закрытие открытой карточки наряда. Открытие карточки — до вызова.
    gone=True — доп. проверка, что наряд исчез из вкладки «Ждут ОТК»."""
    helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, "#tot_acc")
    otk_fill_decision(fr, qty, defect, reason, note)
    fr.locator("#naryadCard .btn-close").click()

    deadline = time.time() + 10000 / 1000.0
    ok = False
    toast = ""
    while time.time() < deadline:
        toast = all_toast_text(page)
        if expect in toast:
            ok = True
            break
        page.wait_for_timeout(200)
    runner.check("ОТК закрыл наряд (→ ClosedOrders)", ok, order_number + " | " + toast[:140])
    if gone:
        gone_ok = wait_not_in_waiting(page, order_number)
        runner.check("наряд ушёл из «Ждут ОТК»", gone_ok, order_number)
    if not ok:
        try:
            helpers.save_screenshot(page, "otk_close_error.png")
        except Exception:
            pass
    return ok


def otk_return_rework(page, order_number, reason="E2E: требуется доработка",
                      wait_rework_tab=True, reopen=True):
    """Вернуть наряд на доработку (карточка открывается из очереди) и проверить
    показ в вкладке «Доработка» с причиной."""
    if reopen:
        fr, row = otk_verify_in_waiting(page, order_number)
        row.locator("button", has_text="Открыть").click()
        helpers.wait_for_in_any_frame(page, "#def_reason", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, "#def_reason")
    if reason:
        fr.fill("#def_reason", reason)
    fr.locator("#naryadCard .btn-rework").click()
    ok = wait_toast_contains(page, "возвращён", 25000)
    runner.check("ОТК вернул наряд на доработку", ok, order_number)

    if wait_rework_tab:
        fr = helpers.wait_for_in_any_frame(page, "#tabRework", timeout=15000)
        fr.click("#tabRework")
        deadline = time.time() + 25000 / 1000.0
        txt = ""
        while time.time() < deadline:
            for f in helpers.frames_with(page):
                try:
                    rows = f.locator("#queueTable tr").all_inner_texts()
                except Exception:
                    continue
                for r in rows:
                    if order_number in r and "Причина:" in r:
                        return ok and True
                    if order_number in r:
                        txt = r
            page.wait_for_timeout(300)
        runner.check(
            "наряд в «Доработка» с причиной (Причина доработки записана)",
            False,
            order_number,
        )
    return ok


def operator_fix_rework(page, order_number):
    fr = helpers.wait_for_in_any_frame(page, ".tab", timeout=20000)
    fr.click('.tab[data-tab="inwork"]')
    item = fr.locator("#inwork-content .naryad-list-item", has_text=order_number).first
    item.wait_for(state="visible", timeout=20000)
    itext = item.inner_text(timeout=2000)
    runner.check("оператор видит «Доработка» в списке", "Доработка" in itext, order_number)
    item.click()

    helpers.wait_for_in_any_frame(page, "#f_description", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, "#f_description")
    fr.fill("#f_description", "E2E: доработка внесена")
    fr.fill("#f_melt", "E2E-ПЛАВКА2-" + order_number[-4:])
    fr.fill("#f_time", "3")
    fr.fill("#f_qty", "1")
    fr.click("#submitBtn")
    ok = wait_toast_contains(page, "сохранён", 30000)
    if not ok:
        deadline = time.time() + 20000 / 1000.0
        while time.time() < deadline:
            obj = helpers.eval_server(page, "getOtkNaryad", order_number)
            st = (obj or {}).get("naryad", {}).get("status", "")
            if st == "waiting_otk":
                ok = True
                break
            page.wait_for_timeout(1500)
    runner.check("оператор внёс доработку (rework → waiting_otk)", ok, order_number)


def operator_verify_closed(page, order_number, qty):
    fr = helpers.wait_for_in_any_frame(page, ".tab", timeout=20000)
    fr.click('.tab[data-tab="closed"]')

    deadline = time.time() + 30000 / 1000.0
    seen = ""
    while time.time() < deadline:
        for fr2 in helpers.frames_with(page):
            try:
                t = fr2.locator("#closed-content").inner_text(timeout=400)
            except Exception:
                continue
            if t:
                seen = t
                if order_number in seen:
                    break
        if order_number in seen:
            break
        page.wait_for_timeout(250)
    if order_number not in seen:
        runner.check(
            "оператор видит закрытый наряд + итоги ОТК",
            False,
            order_number + " | closed-content: " + seen.replace("\n", " ") [:180],
        )
        try:
            helpers.save_screenshot(page, "op_closed_missing.png")
        except Exception:
            pass
        return

    fr = helpers.wait_for_in_any_frame(page, "#closed-content")
    item = fr.locator(".naryad-list-item", has_text=order_number).first
    item.click()

    deadline = time.time() + 20000 / 1000.0
    txt = ""
    while time.time() < deadline:
        for fr2 in helpers.frames_with(page):
            try:
                html = fr2.locator("#current-content").inner_text(timeout=400)
            except Exception:
                continue
            if "Итоги ОТК" in html or "закрыт" in html:
                txt = html
                break
        if txt:
            break
        page.wait_for_timeout(250)
    ok = "Итоги ОТК" in txt and "Принято" in txt and str(qty) in txt
    runner.check("оператор видит закрытый наряд + итоги ОТК", ok, order_number + " | " + txt.replace("\n", " ")[:150])