"""E2E: полный бизнес-цикл на каноне WorkOrders (ADR-003).

Прогон на задеплоенной версии с англоязычными листами:
  Employees | WorkOrders (+«Причина доработки») | Transitions | ClosedOrders | Shifts

Цепочка (смена ролей — прямая навигация по URL, как страницы ролей и открываются):
  1. operator -> открывает (или переиспользует) смену на станке
  2. shift    -> выдаёт наряд №1 из запуска «К запуску» (номер из toast)
  3. operator -> принимает наряд (acceptOrder) + вводит переход -> waiting_otk
  4. otk      -> наряд ВИДЕН в «Ждут ОТК» (регресс фикса OTK-очереди),
                 проверка перехода, закрытие -> итог в ClosedOrders
  5. rework   -> otk возвращает наряд №2 на доработку (rework + причина),
                 оператор правит (ещё переход) -> waiting_otk, otk закрывает

Вход по форме (лист Employees) покрывают smoke-тесты test_operator/otk/master/shift.
"""

import os
import re
import sys
import time
import traceback
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner


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


def wait_toast_contains(page, marker, timeout=10000):
    deadline = time.time() + timeout / 1000.0
    while time.time() < deadline:
        if marker in all_toast_text(page):
            return True
        page.wait_for_timeout(150)
    return False


def capture_order_from_toast(page, timeout=8000):
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
    opened = wait_toast_contains(page, "Смена открыта", 10000)
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
    ok = wait_toast_contains(page, "принята", 10000)
    runner.check("оператор принял наряд (created → in_progress)", ok, order_number)


def operator_add_transition(page, order_number, desc, minutes=5, qty=1):
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
    ok = wait_toast_contains(page, "сохранён", 15000)
    runner.check("оператор сохранил переход (→ waiting_otk)", ok, desc)


def otk_waiting_row(page, order_number):
    fr = helpers.wait_for_in_any_frame(page, "#queueTable", timeout=20000)
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


def otk_check_transition(page, order_number, qty):
    fr, row = otk_verify_in_waiting(page, order_number)
    row.locator("button", has_text="Открыть").click()
    helpers.wait_for_in_any_frame(page, "#acc_0", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, "#acc_0")
    fr.fill("#acc_0", str(qty))
    fr.fill("#def_0", "0")
    fr.locator("#naryadCard button", has_text="Проверить").first.click()

    deadline = time.time() + 10000 / 1000.0
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


def otk_close(page, order_number, qty):
    helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, "#tot_acc")
    fr.fill("#tot_acc", str(qty))
    fr.fill("#tot_def", "0")
    fr.locator("#naryadCard .btn-close").click()

    deadline = time.time() + 10000 / 1000.0
    ok = False
    toast = ""
    while time.time() < deadline:
        toast = all_toast_text(page)
        if "закрыт" in toast:
            ok = True
            break
        page.wait_for_timeout(200)
    gone = wait_not_in_waiting(page, order_number)
    runner.check("ОТК закрыл наряд (→ ClosedOrders)", ok, order_number + " | " + toast[:140])
    runner.check("наряд ушёл из «Ждут ОТК»", gone, order_number)
    if not ok:
        try:
            helpers.save_screenshot(page, "otk_close_error.png")
        except Exception:
            pass


def otk_return_rework(page, order_number):
    fr, row = otk_verify_in_waiting(page, order_number)
    row.locator("button", has_text="Открыть").click()
    helpers.wait_for_in_any_frame(page, "#def_reason", timeout=15000)
    fr = helpers.wait_for_in_any_frame(page, "#def_reason")
    fr.fill("#def_reason", "E2E: требуется доработка")
    fr.locator("#naryadCard .btn-rework").click()
    ok = wait_toast_contains(page, "возвращён", 10000)
    runner.check("ОТК вернул наряд на доработку", ok, order_number)

    fr = helpers.wait_for_in_any_frame(page, "#tabRework", timeout=15000)
    fr.click("#tabRework")
    row2 = fr.locator("#queueTable tr", has_text=order_number).first
    row2.wait_for(state="visible", timeout=20000)
    txt = fr.locator("#queueTable").inner_text(timeout=2000)
    runner.check(
        "наряд в «Доработка» с причиной (Причина доработки записана)",
        order_number in txt and "Причина:" in txt,
        order_number,
    )


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
    ok = wait_toast_contains(page, "сохранён", 15000)
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


def main():
    from playwright.sync_api import sync_playwright

    if not os.path.exists(config.STORAGE_STATE):
        print("Нет сохранённой сессии. Сначала выполните: python session_setup.py")
        raise SystemExit(2)

    op_name = config.CREDS["operator"]["name"]

    with sync_playwright() as p:
        browser = p.chromium.launch(
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

        def _on_dialog(d):
            try:
                d.accept()
            except Exception:
                pass

        page.on("dialog", _on_dialog)
        try:
            # 1. operator: смена
            nav(page, "operator")
            machine = operator_ensure_shift(page)
            if not machine:
                raise RuntimeError("Не получен станок оператора")

            # 2. shift: выдача наряда №1
            nav(page, "shift")
            order1 = shift_issue(page, op_name, machine, qty=1)

            # 3. operator: приём + переход -> waiting_otk
            nav(page, "operator")
            operator_accept(page, order1)
            operator_add_transition(page, order1, "E2E: токарная обработка")

            # 4. otk: «Ждут ОТК» (ключевой фикс) -> проверка -> закрытие -> итоги
            nav(page, "otk")
            otk_check_transition(page, order1, qty=1)
            otk_close(page, order1, qty=1)
            nav(page, "operator")
            operator_verify_closed(page, order1, qty=1)

            # 5. цикл доработки на наряде №2
            nav(page, "shift")
            order2 = shift_issue(page, op_name, machine, qty=1)
            runner.check("наряды для цикла разные", order1 != order2, order1 + " / " + order2)
            if order1 == order2:
                raise RuntimeError("Второй наряд совпал с первым")

            nav(page, "operator")
            operator_accept(page, order2)
            operator_add_transition(page, order2, "E2E: фрезеровка")
            nav(page, "otk")
            otk_return_rework(page, order2)
            nav(page, "operator")
            operator_fix_rework(page, order2)
            nav(page, "otk")
            otk_check_transition(page, order2, qty=1)
            otk_close(page, order2, qty=1)

            runner.finish()
        except Exception as e:
            traceback.print_exc()
            try:
                helpers.save_screenshot(page, "bizcycle_error.png")
            except Exception:
                pass
            runner.check("бизнес-цикл выполнен без исключений", False, str(e)[:200])
            runner.finish()
        finally:
            browser.close()


if __name__ == "__main__":
    main()