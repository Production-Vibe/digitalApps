"""E2E: full business cycle (new stack).

Drives the real production flow entirely through the UI of all four roles:

  master — launch planning (2 launches "Гидробак", qty 10/20, ПА E2E-71/E2E-72)
  shift  — issue 2 naryads to the active operator (created)
  operator — happy phase: take both in work + record transitions -> waiting_otk
  otk    — phase 1: happy close of naryad #1; send naryad #2 to rework
  operator — rework phase: fix naryad #2 (new transition) -> waiting_otk
  otk    — phase 2: check + close naryad #2; queue empty
  master — analytics dashboard shows the data (Сводка/Номенклатура/Отчёты)

All test data is removed at the end (SQL cleanup in the right FK order).
Live stand state (open shifts of operator, catalog 2208) is not touched.
"""

import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import helpers
import runner

ORDER_RE = re.compile(r"Н-\d{8}-\d{6}")

MARK_PA_1 = "E2E-71"
MARK_PA_2 = "E2E-72"
QTY_1 = 10
QTY_2 = 20


def run_sql(sql):
    """Execute SQL against the stand DB via the docker container."""
    out = subprocess.run(
        ["docker", "exec", "server-db-1", "psql", "-U", "user", "-d", "digital_narad", "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return out.stdout.strip()


def clean_test_data(order_numbers, launch_ids, shift_ids):
    """Delete all test artifacts in FK-correct order; leaves catalog alone."""
    nums = ",".join("'" + n + "'" for n in order_numbers)
    lns = ",".join("'" + l + "'" for l in launch_ids)
    shs = ",".join("'" + s + "'" for s in shift_ids)
    deletes = []
    if nums:
        deletes.append("DELETE FROM \"Transitions\" WHERE \"orderNumber\" IN (" + nums + ");")
        deletes.append("DELETE FROM \"ClosedOrders\" WHERE \"orderNumber\" IN (" + nums + ");")
        deletes.append("DELETE FROM \"PrintQueue\" WHERE \"orderNumber\" IN (" + nums + ");")
        deletes.append("DELETE FROM \"WorkOrders\" WHERE \"number\" IN (" + nums + ");")
    if lns:
        deletes.append("DELETE FROM \"Launches\" WHERE \"id\" IN (" + lns + ");")
    if shs:
        deletes.append("DELETE FROM \"Shifts\" WHERE \"id\" IN (" + shs + ");")
    if deletes:
        run_sql(" ".join(deletes))
    message_matches = " OR ".join(
        ["\"message\" LIKE '%" + n + "%'" for n in order_numbers]
        + ["\"message\" LIKE '%" + l + "%'" for l in launch_ids]
    )
    if message_matches:
        run_sql('DELETE FROM "Notification" WHERE ' + message_matches + ";")
    leftovers = run_sql("SELECT count(*) FROM \"Launches\" WHERE \"id\" IN (" + lns + ")") if lns else "0"
    runner.check("cleanup: тестовые запуски удалены", leftovers == "0", leftovers)


def login(browser, role):
    """Fresh context, JWT login, return (ctx, page)."""
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    )
    page = ctx.new_page()
    helpers.open_app(page)
    helpers.do_login(page, config.CREDS[role])
    try:
        page.wait_for_url("**" + config.LANDING[role], timeout=15000)
    except Exception:
        pass
    return ctx, page


def wait_selector(page, selector, timeout=20000, state="visible"):
    try:
        page.wait_for_selector(selector, timeout=timeout, state=state)
        return True
    except Exception:
        return False


def wait_text(page, text, root=None, timeout=20000):
    end = time.time() + timeout / 1000.0 + 1
    while time.time() < end:
        scope = root
        if scope is None:
            scope = page.locator("body")
        try:
            if text in scope.inner_text(timeout=2000):
                return True
        except Exception:
            pass
        try:
            page.wait_for_load_state("domcontentloaded")
        except Exception:
            pass
        time.sleep(0.4)
    return False


def row_by_first_cell(page, section, value):
    """Row of `section` whose first cell is exactly `value` (suffix-safe)."""
    return page.locator(section + " tbody tr").filter(
        has=page.locator("td", has_text=re.compile(r"^" + re.escape(value) + r"$"))
    )


def naryad_row(page, section, number):
    """Row of `section` whose first cell is exactly `number` (suffix-safe)."""
    return row_by_first_cell(page, section, number)


def wait_detached(page, number, section, timeout=20000):
    """Wait until the row with exact `number` leaves `section` (list re-render)."""
    try:
        naryad_row(page, section, number).wait_for(state="detached", timeout=timeout)
        return True
    except Exception:
        return False


def make_dialog_handler(qty):
    """Accept the two checkTransition prompts: accepted=qty, defect=0."""

    def _h(dialog):
        if "Принято" in dialog.message:
            dialog.accept(str(qty))
        else:
            dialog.accept("0")

    return _h


def master_create_launches(page):
    runner.check("master: вход", "Планирование" in page.inner_text("body"), "")
    page.click(".tab-btn[data-tab='plan']")
    if not wait_selector(page, "#tab-plan:not([hidden])"):
        runner.check("master: вкладка Планирование активна", False, "")
        return []

    ids = []
    for pa, qty in ((MARK_PA_1, QTY_1), (MARK_PA_2, QTY_2)):
        page.fill("#launchSearch", "Гидробак")
        if not wait_selector(page, "#catalogResults .catalog-item"):
            runner.check("master: результаты поиска каталога", False, "")
            return ids
        page.click("#catalogResults .catalog-item")
        c = wait_text(page, "Выбрано:", root=page.locator("#selectedItem"))
        runner.check("master: деталь выбрана (" + pa + ")", c, "")
        page.fill("#launchQty", str(qty))
        page.fill("#launchPA", pa)
        page.click("button:has-text('Создать запуск')")
        if not wait_text(page, pa, root=page.locator("#launchesSection")):
            runner.check("master: запуск " + pa + " создан", False, "")
            return ids
        row = page.locator("#launchesSection tbody tr", has_text=pa)
        launch_id = row.locator("td").first.inner_text().strip()
        ids.append(launch_id)
        runner.check("master: запуск " + pa + " создан", bool(launch_id), launch_id)
    return ids


def shift_issue(page):
    runner.check("shift: вход", "Выдача нарядов" in page.inner_text("body"), "")
    if not wait_selector(page, "#launchTable tbody tr"):
        runner.check("shift: таблица запусков", False, "")
        return
    for idx, pa in enumerate((MARK_PA_1, MARK_PA_2)):
        machine = "Т1-1" if idx == 0 else "Т1-2"
        row = page.locator("#launchTable tbody tr", has_text=pa)
        if not wait_text(page, pa, root=page.locator("#launchTable")):
            runner.check("shift: запуск " + pa + " виден", False, "")
            continue
        row.locator("button:has-text('Выдать')").click()
        if not wait_selector(page, "#issueOperator"):
            runner.check("shift: оператор в модалке", False, "")
            return
        if not wait_selector(page, "#issueMachine"):
            runner.check("shift: станок в модалке", False, "")
            return
        if not wait_text(page, pa, root=page.locator("#issueDetails")):
            runner.check("shift: модалка по запуску " + pa, False, "")
            return
        page.select_option("#issueOperator", index=0)
        page.select_option("#issueMachine", label=machine)
        page.click("#issueModal button:has-text('Выдать наряд')")
        issued = wait_text(page, "Выдано", root=row)
        runner.check("shift: наряд по " + pa + " выдан", issued, machine)


def operator_open_shift(page, machine, phase):
    """Open a shift on `machine` (used before shift issues naryads)."""
    ok = wait_text(page, "Наряды в работе")
    runner.check("operator: вход (открытие смены)", ok, "")
    if not wait_selector(page, "#openMachine", state="visible"):
        runner.check("operator: форма открытия смены доступна", False, "")
        return None
    page.select_option("#openMachine", label=machine)
    page.click("button:has-text('Открыть смену')")
    shift_id = None
    try:
        open_row = page.locator("#shiftsSection tbody tr", has_text="Открыта").last
        open_row.wait_for(state="visible", timeout=20000)
        shift_id = open_row.locator("td").first.inner_text().strip()
    except Exception:
        pass
    runner.check("operator: смена " + machine + " открыта (" + phase + ")", bool(shift_id), shift_id or "")
    return shift_id


def parse_operator_orders(page):
    """Return {number: qty} pairs visible in the operator's orders table."""
    rows = page.locator("#ordersSection tbody tr")
    count = rows.count()
    result = {}
    for i in range(0, count):
        cells = rows.nth(i).locator("td")
        num = cells.nth(0).inner_text().strip()
        qty = cells.nth(3).inner_text().strip()
        result[num] = qty
    return result


def badge_value(page):
    """Current unread badge value (0 when hidden/absent)."""
    b = page.locator("#notifBadge")
    try:
        if b.count() and b.is_visible():
            t = b.inner_text().strip()
            return int(t) if t.isdigit() else 0
    except Exception:
        pass
    return 0


def operator_check_notifications(page, phase):
    """Bell + unread badge + dropdown + mark-read against real notifications."""
    runner.check(
        "operator: колокольчик уведомлений (" + phase + ")",
        page.locator(".notif__bell").count() > 0,
        "",
    )

    unread = 0
    end = time.time() + 20
    while time.time() < end:
        unread = badge_value(page)
        if unread >= 1:
            break
        time.sleep(0.3)
    runner.check("operator: бейдж непрочитанных ≥ 1 (" + phase + ")", unread >= 1, str(unread))

    if page.locator(".notif__bell").count() == 0:
        return
    page.click(".notif__bell")
    if not wait_selector(page, "#notifPanel", state="visible"):
        runner.check("operator: dropdown уведомлений открыт (" + phase + ")", False, "")
        return

    items = page.locator("#notifPanel .notif__item")
    items_end = time.time() + 10
    while time.time() < items_end and items.count() == 0:
        time.sleep(0.2)
    n_items = items.count()
    runner.check("operator: dropdown непуст (" + phase + ")", n_items >= 1, str(n_items) + " шт")
    panel_text = page.locator("#notifPanel").inner_text()
    runner.check(
        "operator: уведомление о наряде (" + phase + ")",
        "наряд" in panel_text.lower(),
        panel_text[:80].replace("\n", " "),
    )
    if n_items == 0:
        return

    items.first.click()
    drop_end = time.time() + 12
    while time.time() < drop_end and badge_value(page) >= max(unread, 1):
        time.sleep(0.3)
    runner.check(
        "operator: уведомление помечено прочитанным (" + phase + ")",
        badge_value(page) < max(unread, 1),
        "badge " + str(badge_value(page)),
    )


def operator_wait_toast(page, phase, keywords=("наряд", "закрыт", "доработк"), timeout=30000):
    """Wait for a real notification toast on the still-open operator page.

    Polls every 15s, so allow up to ~30s. Operator action toasts (e.g.
    «Переход записан») are ignored via `keywords`.
    """
    end = time.time() + timeout / 1000.0
    text = ""
    while time.time() < end:
        t = page.locator("#toast")
        try:
            if t.count() and t.is_visible():
                current = (t.inner_text() or "").strip()
                if any(k in current.lower() for k in keywords):
                    text = current
                    break
        except Exception:
            pass
        time.sleep(0.2)
    runner.check("operator: тост уведомления (" + phase + ")", bool(text), text[:80].replace("\n", " "))


def operator_close_shift_history(page, machine, shift_id):
    """Close the init shift; the open form + collapsed history must still render."""
    runner.check("operator: вход (история смен)", wait_text(page, "Смены", timeout=25000), "")
    if not wait_selector(page, "#shiftsSection tbody tr"):
        runner.check("operator: таблица смен", False, "")
        return
    before = wait_text(page, "Можно открыть ещё одну смену", root=page.locator("#shiftsSection"))
    runner.check("operator: одна открытая смена (перед закрытием)", before, "")

    if shift_id:
        open_row = row_by_first_cell(page, "#shiftsSection", shift_id)
    else:
        open_row = page.locator("#shiftsSection tbody tr", has_text="Открыта").last
    if open_row.locator("button:has-text('Закрыть')").count() == 0:
        runner.check("operator: кнопка закрытия смены", False, "")
        return
    open_row.locator("button:has-text('Закрыть')").click()

    zero = wait_text(page, "Откройте смену на станке", root=page.locator("#shiftsSection"))
    runner.check("operator: форма открытия видна после закрытия смены", zero, "")
    runner.check(
        "operator: select станка доступен после закрытия",
        wait_selector(page, "#openMachine", state="visible"),
        "",
    )

    summary = page.locator("#shiftsSection details summary")
    runner.check("operator: история смен присутствует", summary.count() > 0, "")
    if summary.count() == 0:
        return
    if "Закрыта" not in page.locator("#shiftsSection").inner_text():
        summary.first.click()
    hist = wait_text(page, "Закрыта", root=page.locator("#shiftsSection"))
    runner.check("operator: закрытая смена в истории", hist, shift_id or machine)


def operator_run(page, target_qty, phase):
    if not wait_text(page, "Наряды в работе", timeout=25000):
        runner.check("operator: вход (" + phase + ")", False, page.url)
        return None
    runner.check("operator: вход (" + phase + ")", True, "")
    orders = parse_operator_orders(page)
    for attempt in range(5):
        if orders:
            break
        try:
            page.click("button:has-text('Обновить')")
        except Exception:
            pass
        if not wait_text(page, "Наряды в работе"):
            runner.check("operator: наряды видны (" + phase + ")", False, "")
            return None
        orders = parse_operator_orders(page)
        time.sleep(0.5)
    if not orders:
        runner.check("operator: наряды видны (" + phase + ")", False, "")
        return None
    runner.check("operator: наряды видны (" + phase + ")", True, str(len(orders)) + " шт")
    matched = [n for n, q in orders.items() if q == str(target_qty)]
    if not matched:
        runner.check("operator: наряд qty=" + str(target_qty) + " найден (" + phase + ")", False, "")
        return None
    number = matched[0]

    row = naryad_row(page, "#ordersSection", number)
    if row.locator("button:has-text('В работу')").count() > 0:
        row.locator("button:has-text('В работу')").click()
        if not wait_text(page, "В работе", root=page.locator("#ordersSection")):
            runner.check("operator: наряд принят в работу (" + phase + ")", False, "")
            return number
        runner.check("operator: наряд принят в работу (" + phase + ")", True, number)

    row = naryad_row(page, "#ordersSection", number)
    row.locator("button:has-text('+ Переход')").click()
    if not wait_selector(page, "#trDescription"):
        runner.check("operator: модалка перехода (" + phase + ")", False, "")
        return number
    page.fill("#trDescription", "Обработка E2E " + phase)
    page.fill("#trTime", "0.5")
    page.fill("#trQty", str(target_qty))
    page.fill("#trMelt", "Э-12345")
    page.click("#transitionModal button:has-text('Отправить')")
    gone = wait_detached(page, number, "#ordersSection")
    runner.check("operator: переход записан, наряд ушёл к ОТК (" + phase + ")", gone, number)
    return number


def otk_check_and_close(page, number, qty):
    row = naryad_row(page, "#queueSection", number)
    if not row.count():
        runner.check("otk: наряд " + number + " в очереди", False, "")
        return
    row.locator("button:has-text('Открыть')").click()
    if not wait_selector(page, "#naryadContent button:has-text('Проверить')"):
        runner.check("otk: наряд открыт, есть переходы (" + number + ")", False, "")
        return
    page.on("dialog", make_dialog_handler(qty))
    page.locator("#naryadContent button:has-text('Проверить')").first.click()
    if not wait_text(page, "Проверен", root=page.locator("#naryadContent")):
        runner.check("otk: переход проверен (" + number + ")", False, "")
        return
    runner.check("otk: переход проверен (" + number + ")", True, "")
    if not wait_selector(page, "#closeReason") or not wait_selector(page, "#closeComment"):
        runner.check("otk: форма закрытия (" + number + ")", False, "")
        return
    page.fill("#closeReason", "E2E без брака")
    page.fill("#closeComment", "проверка цикла")
    page.click("#naryadContent button:has-text('Закрыть наряд')")
    gone = wait_detached(page, number, "#queueSection")
    runner.check("otk: наряд закрыт (" + number + ")", gone, "")


def otk_send_to_rework(page, number):
    row = naryad_row(page, "#queueSection", number)
    if not row.count():
        runner.check("otk: наряд " + number + " в очереди (rework)", False, "")
        return
    row.locator("button:has-text('Открыть')").click()
    if not wait_selector(page, "#reworkReason"):
        runner.check("otk: форма доработки (" + number + ")", False, "")
        return
    page.fill("#reworkReason", "Требует доводки E2E")
    page.click("#naryadContent button:has-text('На доработку')")
    ok = wait_text(page, "Доработка", root=page.locator("#queueSection"))
    runner.check("otk: наряд отправлен на доработку (" + number + ")", ok, "")


def master_analytics(page):
    runner.check("master: вход (аналитика)", "Сводка" in page.inner_text("body"), "")
    if not wait_selector(page, "#orderCardsSection .stat-card"):
        runner.check("master: сводка загружена", False, "")
        return
    card = page.locator("#orderCardsSection .stat-card", has_text="Закрыт").first
    value = card.locator(".stat-card__value").inner_text().strip()
    runner.check("master: сводка — закрытых нарядов 2", value == "2", value)
    pa_canvas = page.locator("#paChartSection canvas").count() > 0
    runner.check("master: сводка — график загруженности ПА", pa_canvas, "")
    machines = wait_text(page, "Станки", root=page.locator("#machinesSection"))
    runner.check("master: сводка — станки", machines, "")

    page.click(".tab-btn[data-tab='nomenclatura']")
    if wait_selector(page, "#tab-nomenclatura:not([hidden])"):
        tree_ok = wait_selector(page, "#treeSection .tree-node")
        closed2 = wait_text(page, "закрыто: 2", root=page.locator("#treeSection"))
        runner.check("master: номенклатура — дерево", tree_ok, "")
        runner.check("master: номенклатура — закрыто по поддереву", closed2, "")
    else:
        runner.check("master: вкладка Номенклатура", False, "")

    page.click(".tab-btn[data-tab='otchety']")
    page.wait_for_timeout(1200)
    if wait_selector(page, "#tab-otchety:not([hidden])"):
        timeline = page.locator("#timelineSection canvas").count() > 0
        exec_ok = wait_text(page, "ЗАКРЫТО НАРЯДОВ", root=page.locator("#execSection"))
        if not exec_ok:
            txt = page.locator("#execSection").inner_text()[:300] if page.locator("#execSection").count() else "NO execSection"
            print("DIAG #execSection:", txt.replace("\n", " | "))
        runner.check("master: отчёты — график динамики", timeline, "")
        runner.check("master: отчёты — выполнение за период", exec_ok, "")
        exec_rows = page.locator("#execSection tbody tr").count()
        runner.check("master: отчёты — таблица выполнения непуста", exec_rows >= 1, str(exec_rows) + " строк")
        rep = page.locator("#reportMachinesSection").inner_text().strip()
        runner.check("master: отчёты — разрез по станкам", len(rep) > 0, rep[:60].replace("\n", " "))
    else:
        runner.check("master: вкладка Отчёты", False, "")


def main():
    from playwright.sync_api import sync_playwright

    launch_ids = []
    order_numbers = []
    shift_ids = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                channel=config.BROWSER_CHANNEL,
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                ],
                ignore_default_args=["--enable-automation"],
            )
            try:
                ctx, page = login(browser, "master")
                launch_ids = master_create_launches(page)
                ctx.close()

                ctx, page = login(browser, "operator")
                shift_id = operator_open_shift(page, "Т1-1", "инициализация")
                if shift_id:
                    shift_ids.append(shift_id)
                ctx.close()

                ctx, page = login(browser, "shift")
                shift_issue(page)
                ctx.close()

                op_ctx, op_page = login(browser, "operator")
                for qty, phase in ((QTY_1, "happy-1"), (QTY_2, "happy-2")):
                    n = operator_run(op_page, qty, phase)
                    if n:
                        order_numbers.append(n)
                    if phase == "happy-1":
                        operator_check_notifications(op_page, "happy-1")

                if len(order_numbers) >= 2:
                    number1, number2 = order_numbers[0], order_numbers[1]

                    ctx, page = login(browser, "otk")
                    if wait_selector(page, "#queueSection tbody tr"):
                        runner.check("otk: очередь — 2 наряда", page.locator("#queueSection tbody tr").count() == 2, "")
                        otk_check_and_close(page, number1, QTY_1)
                        otk_send_to_rework(page, number2)
                    ctx.close()

                    operator_wait_toast(op_page, "rework")
                    op_ctx.close()

                    ctx, page = login(browser, "operator")
                    n = operator_run(page, QTY_2, "rework")
                    if n:
                        order_numbers.append(n)
                    ctx.close()

                    ctx, page = login(browser, "otk")
                    if wait_selector(page, "#queueSection tbody tr"):
                        otk_check_and_close(page, number2, QTY_2)
                    else:
                        runner.check("otk: наряд " + number2 + " в очереди (после rework)", False, "")
                    empty = wait_text(page, "Очередь пуста", root=page.locator("#queueSection"))
                    runner.check("otk: очередь пуста после закрытия", empty, "")
                    ctx.close()

                    ctx, page = login(browser, "master")
                    master_analytics(page)
                    ctx.close()

                    ctx, page = login(browser, "operator")
                    operator_close_shift_history(page, "Т1-1", shift_ids[0] if shift_ids else None)
                    ctx.close()
            finally:
                browser.close()
    finally:
        clean_test_data(list(set(order_numbers)), launch_ids, shift_ids)

    print("TEST DATA (для ручной зачистки если что):", order_numbers, launch_ids)
    runner.finish()


if __name__ == "__main__":
    main()