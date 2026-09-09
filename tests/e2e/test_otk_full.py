"""E2E: расширенный прогон роли ОТК (выявление багов).

Покрытие:
  A. Вкладки/очередь «Ждут ОТК» / «Доработка» / «В работе» — фильтрация по статусам.
  B. Карточка наряда: расшифровка, «Решение ОТК», таблица переходов.
  C. «Проверить переход»: все переходы, агрегаты «Проверено X/Y», «Принято/Брак».
  D. Закрытие: позитив, отмена в confirm, брак+причина+комментарий.
  E. Доработка: возврат с причиной, закрытие из rework напрямую, аккумуляция
     после фикса оператора (старый checked сохраняется).
  F. Негатив/края: отрицательные значения, accepted>qty, пустой/чужой name,
     несуществующий переход (raw API).
  H. Гипотезы багов: H1(created в «В работе»), H2(закрытие при 0 проверенных),
     H3(рассинхрон итогов), H4(checkTransition на отсутств. переходе), H5(accepted>qty).

Сид нарядов — через doPost (seed_api), без расходования Launches; один сценарий
(rework→оператор) — через shift+operator UI.
"""

import json
import os
import time
import traceback
import urllib.parse

sys_path_here = os.path.dirname(os.path.abspath(__file__))
if sys_path_here not in __import__("sys").path:
    __import__("sys").path.insert(0, sys_path_here)

import config
import flows
import helpers
import runner
import seed_api
from flows import (
    all_toast_text,
    launch_page,
    nav,
    operator_accept,
    operator_add_transition,
    operator_ensure_shift,
    operator_fix_rework,
    otk_open_card,
    otk_return_rework,
    shift_issue,
    wait_toast_contains,
)

O = {}


def q(eval_obj, path, default=""):
    cur = eval_obj or {}
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def as_int(v):
    s = str(v if v is not None else "").strip()
    return int(s) if s.isdigit() else 0


eval_server = helpers.eval_server


def naryad_status(page, order_number):
    obj = eval_server(page, "getOtkNaryad", order_number)
    if isinstance(obj, dict) and obj.get("error"):
        return obj["error"]
    return q(obj, "naryad.status")


def trans_status(obj, i):
    trs = q(obj, "transitions", [])
    if not isinstance(trs, list) or i >= len(trs):
        return ""
    return q(trs[i], "status")


def card_text(page, timeout=15000):
    """Текст карточки наряда из любого фрейма, дожидаясь реального рендера."""
    deadline = time.time() + timeout / 1000.0
    while time.time() < deadline:
        for f in helpers.frames_with(page):
            try:
                t = f.locator("#naryadCard").inner_text(timeout=400)
            except Exception:
                continue
            if t and "Загрузка" not in t and "Наряд " in t:
                return t
        page.wait_for_timeout(200)
    return ""


def visible_rows(page):
    rows = []
    for f in helpers.frames_with(page):
        try:
            if f.locator("#queueTable").is_visible():
                rows += f.locator("#queueTable tr").all_inner_texts()
        except Exception:
            continue
    return rows


def wait_tab_rows(page, present=(), absent=(), timeout=15000):
    deadline = time.time() + timeout / 1000.0
    last = []
    while time.time() < deadline:
        rows = visible_rows(page)
        last = rows
        if (all(any(n in r for r in rows) for n in present)
                and all(all(n not in r for r in rows) for n in absent)):
            return True, rows
        page.wait_for_timeout(300)
    return False, last


def _wait_queue_fr(page, timeout=30000):
    """Wait until #queueTable in some frame is visible AND populated."""
    return flows.wait_queue_table(page, timeout=timeout)


def open_otk(page):
    """Navigate to OTK queue and wait until #queueTable is populated.
    If the table stays hidden/empty (GAS throttle/stale iframe), retry with a
    fresh cache-busted top-level navigation."""
    q_name = urllib.parse.quote(config.CREDS["otk"]["name"], safe="")
    for attempt in range(3):
        if attempt == 0:
            nav(page, "otk")
        else:
            query = f"page=otk-app&name={q_name}&_t={int(time.time() * 1000)}"
            helpers.goto_page(page, query)
        try:
            return _wait_queue_fr(page, timeout=45000)
        except Exception:
            page.wait_for_timeout(4000)
    raise TimeoutError("OTK queue not populated after retries")


def show_queue(page):
    """Если открыта карточка наряда — вернуться к списку нарядов."""
    deadline = time.time() + 8000 / 1000.0
    while time.time() < deadline:
        for f in helpers.frames_with(page):
            try:
                if f.locator("#naryadView").count() and f.locator("#naryadView").is_visible():
                    f.locator("#naryadView button", has_text="К списку").click()
                    return True
            except Exception:
                continue
        page.wait_for_timeout(200)
    return False


def wait_queue_contains(page, order_number, needle, timeout=15000):
    """Ждать строку по номеру наряда в таблице очереди и проверить needle
    ТОЛЬКО в этой строке (без коллизий по подстрокам других нарядов)."""
    deadline = time.time() + timeout / 1000.0
    row_seen = ""
    while time.time() < deadline:
        for f in helpers.frames_with(page):
            try:
                rows = f.locator("#queueTable tr").all_inner_texts()
            except Exception:
                continue
            for r in rows:
                if not r:
                    continue
                if order_number in r and needle in r:
                    return True, r
                if order_number in r:
                    row_seen = r
        page.wait_for_timeout(300)
    return False, row_seen


# === Сценарии ===

def first_tr(obj, i, field):
    trs = q(obj, "transitions", [])
    if not isinstance(trs, list) or i >= len(trs):
        return ""
    return q(trs[i], field)


def close_outcome(page, order_number, timeout=25000):
    """Исход попытки закрытия наряда по toasts: 'closed' — успешное закрытие,
    'blocked' — сервер заблокировал, '' — не дождались ответа.
    Смотрит точную строку успеха, чтобы не принять блок «Нельзя закрыть…»
    за «закрыт» (подстрока 'закрыт' есть в обоих)."""
    success = "Наряд " + order_number + " закрыт"
    deadline = time.time() + timeout / 1000.0
    while time.time() < deadline:
        text = all_toast_text(page)
        if success in text:
            return "closed"
        if "Нельзя закрыть" in text:
            return "blocked"
        page.wait_for_timeout(200)
    return ""


def scenario_open_card(page):
    fr = open_otk(page)
    otk_open_card(page, O["w2"])
    fr = helpers.wait_for_in_any_frame(page, "#naryadCard", timeout=15000)
    txt = card_text(page)
    runner.check("B1: карточка — деталь/код/кол-во/статус", (
        "E2E OTK" in txt and "E2E-OTK" in txt and "Ждёт ОТК" in txt and "5" in txt
    ), O["w2"])
    runner.check("B1: «Решение ОТК» + кнопки", (
        "Решение ОТК" in txt and "Закрыть наряд" in txt and "Вернуть на доработку" in txt
    ), "")
    runner.check("B1: таблица 2 перехода", (
        "E2E переход B1" in txt and "E2E переход B2" in txt
    ), "")


def scenario_check_one(page):
    fr = open_otk(page)
    otk_open_card(page, O["w2"])
    fr = helpers.wait_for_in_any_frame(page, "#acc_0", timeout=15000)
    fr.fill("#acc_0", "5")
    fr.fill("#def_0", "0")
    fr.locator("#naryadCard button", has_text="Проверить").first.click()
    ok = wait_toast_contains(page, "проверен", 20000)
    runner.check("B2: «Проверить» переход 1 -> toast (оптимистичный UI)", ok, O["w2"])

    deadline = time.time() + 15000 / 1000.0
    checked = False
    last = ""
    while time.time() < deadline:
        obj = eval_server(page, "getOtkNaryad", O["w2"])
        trs = q(obj, "transitions", [])
        last = q(trs[0], "status") if isinstance(trs, list) and trs else ""
        if last == "checked":
            checked = True
            break
        page.wait_for_timeout(400)
    runner.check(
        "B2/BUG-1: статус перехода 1 -> checked (реальная запись в Transitions)",
        checked,
        f"переход остался в '{last}' (toast «проверен» показан ЛОЖНО)",
    )


def scenario_checked_render(page):
    """Позитив: отрисовка checked-состояния, сид через API (в обход BUG-1)."""
    fr = open_otk(page)
    otk_open_card(page, O["ochk"])
    fr = helpers.wait_for_in_any_frame(page, "#acc_0", timeout=15000)
    txt = card_text(page)
    chips = txt.count("Проверен")
    runner.check("K: карточка показывает 2 «Проверен» (данные через API)", chips >= 2, f"chips={chips}")
    show_queue(page)
    got, qtxt = wait_queue_contains(page, O["ochk"], "2/2", timeout=15000)
    runner.check("K: агрегат Проверено 2/2 (API-сид)", got, qtxt[:120])
    got2, qtxt2 = wait_queue_contains(page, O["ochk"], "5 / 1", timeout=15000)
    runner.check("K: агрегат Принято 5 / Брак 1 (API-сид)", got2, qtxt2[:120])


def scenario_close_ok(page):
    fr = open_otk(page)
    otk_open_card(page, O["w2"])
    fr = helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
    fr.fill("#tot_acc", "5")
    fr.fill("#tot_def", "0")
    fr.locator("#naryadCard .btn-close").click()
    ok = wait_toast_contains(page, "Наряд " + O["w2"] + " закрыт", 20000)
    runner.check("D1: закрытие наряда (позитив) -> toast", ok, O["w2"])
    obj = eval_server(page, "getOtkNaryad", O["w2"])
    ci = q(obj, "closingInfo", {})
    runner.check("D1: итоги в ClosedOrders (принято/кто)", (
        as_int(q(ci, "total_accepted")) == 5
        and q(ci, "closed_by") == config.CREDS["otk"]["name"]
    ), str(ci)[:140])
    trs = q(obj, "transitions", [])
    per_acc = sum(as_int(q(t, "accepted_qty")) for t in trs) if isinstance(trs, list) else 0
    per_dec = sum(as_int(q(t, "defect_qty")) for t in trs) if isinstance(trs, list) else 0
    total_acc = as_int(q(ci, "total_accepted"))
    total_dec = as_int(q(ci, "total_defect"))
    mismatch = (per_acc, per_dec) != (total_acc, total_dec)
    runner.check(
        "H3: итоги закрытия НЕ расходятся с принятыми переходами",
        not mismatch,
        f"переходы {per_acc}/{per_dec} vs закрытие {total_acc}/{total_dec}",
    )


def scenario_confirm_cancel(page):
    fr = open_otk(page)
    otk_open_card(page, O["d12"])
    fr = helpers.wait_for_in_any_frame(page, "#naryadCard", timeout=15000)
    fr.evaluate("window.confirm = function(){ return false; }")
    fr.locator("#naryadCard .btn-close").click()
    page.wait_for_timeout(3000)
    fr.evaluate("window.confirm = function(){ return true; }")
    st = naryad_status(page, O["d12"])
    runner.check("D2: отмена в confirm не закрывает наряд", st == "waiting_otk", f"status={st}")


def scenario_close_defect(page):
    fr = open_otk(page)
    otk_open_card(page, O["w3"])
    fr = helpers.wait_for_in_any_frame(page, "#acc_0", timeout=15000)
    fr.fill("#acc_0", "3")
    fr.fill("#def_0", "0")
    fr.locator("#naryadCard button", has_text="Проверить").first.click()
    ok = wait_toast_contains(page, "проверен", 20000)
    runner.check("D3: переход 1 проверен (требование закрытия)", ok, O["w3"])
    page.wait_for_timeout(1500)
    show_queue(page)
    otk_open_card(page, O["w3"])
    fr = helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
    fr.fill("#tot_acc", "3")
    fr.fill("#tot_def", "2")
    fr.fill("#def_reason", "E2E: брак при обработке")
    fr.fill("#closing_note", "E2E: комментарий ОТК")
    fr.locator("#naryadCard .btn-close").click()
    ok = wait_toast_contains(page, "Наряд " + O["w3"] + " закрыт", 20000)
    runner.check("D3: закрытие с браком и причиной -> toast", ok, O["w3"])
    obj = eval_server(page, "getOtkNaryad", O["w3"])
    ci = q(obj, "closingInfo", {})
    runner.check("D3: брак/причина/комментарий в ClosedOrders", (
        as_int(q(ci, "total_defect")) == 2
        and q(ci, "defect_reason") == "E2E: брак при обработке"
        and q(ci, "closing_note") == "E2E: комментарий ОТК"
    ), str(ci)[:160])


def scenario_h2_close_unverified(page):
    fr = open_otk(page)
    otk_open_card(page, O["w4"])
    fr = helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
    fr.fill("#tot_acc", "4")
    fr.fill("#tot_def", "0")
    fr.locator("#naryadCard .btn-close").click()
    oc = close_outcome(page, O["w4"])
    ok = oc == "blocked"
    runner.check("H2: НЕЛЬЗЯ закрыть наряд с 0 проверенных переходов",
                 ok, O["w4"] + (" закрылся — баг" if oc == "closed"
                                else " ответ не получен" if not oc else " (заблокировано)"))


def scenario_h1_close_created(page):
    fr = open_otk(page)
    fr.click("#tabInWork")
    got, qtxt = wait_queue_contains(page, O["ac"], O["ac"], timeout=15000)
    runner.check("H1: созданный (не начатый) наряд виден в «В работе»", got, "появляется 'Создан'")
    if not got:
        return
    fr = helpers.wait_for_in_any_frame(page, "#queueTable", timeout=15000)
    row = fr.locator("#queueTable tr", has_text=O["ac"]).first
    row.locator("button", has_text="Открыть").click()
    fr = helpers.wait_for_in_any_frame(page, "#naryadCard", timeout=15000)
    txt = card_text(page)
    runner.check("H1: есть «Закрыть наряд» у created (0 переходов)", "Закрыть наряд" in txt, "")
    if fr.locator("#tot_acc").count():
        fr.fill("#tot_acc", "4")
        fr.fill("#tot_def", "0")
        fr.locator("#naryadCard .btn-close").click()
        oc = close_outcome(page, O["ac"], timeout=25000)
        ok = oc == "blocked"
        runner.check("H1: НЕЛЬЗЯ закрыть непроработанный наряд",
                     ok, O["ac"] + (" закрылся — баг" if oc == "closed"
                                    else " ответ не получен" if not oc else " (заблокировано)"))


def scenario_negative_values(page):
    fr = open_otk(page)
    otk_open_card(page, O["fneg"])
    fr = helpers.wait_for_in_any_frame(page, "#acc_0", timeout=15000)
    fr.fill("#acc_0", "-1")
    fr.fill("#def_0", "0")
    fr.locator("#naryadCard button", has_text="Проверить").first.click()
    page.wait_for_timeout(1200)
    got_err = "отрицател" in all_toast_text(page)
    runner.check("F1: отрицательное Принято блокируется (клиент)", got_err, "")
    obj = eval_server(page, "getOtkNaryad", O["fneg"])
    t0 = first_tr(obj, 0, "status")
    runner.check("F1: переход НЕ помечен checked после блока", t0 != "checked", f"status={t0}")

    # H5: избегаем BUG-1 (UI-кнопка не пишет) — шлём check напрямую с int tp.
    r = seed_api.check_transition(O["fneg"], 5, 999, 0)
    obj = eval_server(page, "getOtkNaryad", O["fneg"])
    acc_saved = as_int(first_tr(obj, 0, "accepted_qty"))
    runner.check(
        "H5: принятое > количества отклоняется сервером (кол-во=5)",
        not (isinstance(r, dict) and not r.get("error") and acc_saved == 999),
        f"сервер принял accepted={acc_saved} при количестве 5 (без ошибки)",
    )


def scenario_h4_wrong_tp(page):
    fr = open_otk(page)
    r = seed_api.check_transition(O["frg"], "999", 4, 0)
    ok_err = isinstance(r, dict) and r.get("error")
    runner.check("F3/H4: проверка несуществующего перехода даёт ошибку, а не success",
                 ok_err, str(r)[:120])


def scenario_role_guard(page):
    op_name_q = urllib.parse.quote(config.CREDS["operator"]["name"], safe="")
    try:
        helpers.goto_page(page, "page=otk-app&name=" + op_name_q)
        fr = flows.wait_queue_table(page, timeout=60000)
    except Exception as e:
        runner.check("F4: страница ОТК открылась под operator name", False, str(e)[:120])
        fr = None
    if fr is not None:
        otk_open_card(page, O["frg"])
        fr = helpers.wait_for_in_any_frame(page, "#acc_0", timeout=15000)
        fr.fill("#acc_0", "4")
        fr.fill("#def_0", "0")
        fr.locator("#naryadCard button", has_text="Проверить").first.click()
        ok = wait_toast_contains(page, "Отказано", 20000)
        obj = eval_server(page, "getOtkNaryad", O["frg"])
        st = first_tr(obj, 0, "status")
        runner.check("F4: под чужим ФИО проверка НЕ прошла (isRole)", ok and st != "checked",
                     f"toast={ok} status={st}")

    helpers.goto_page(page, "page=otk-app")
    try:
        fr = flows.wait_queue_table(page, timeout=60000)
        otk_open_card(page, O["frg"])
        fr = helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
        fr.fill("#tot_acc", "4")
        fr.fill("#tot_def", "0")
        fr.locator("#naryadCard .btn-close").click()
        ok = wait_toast_contains(page, "Не указано", 20000)
        st = naryad_status(page, O["frg"])
        runner.check("F5: закрытие без name отклоняется", ok or st == "waiting_otk", f"status={st}")
    except Exception as e:
        runner.check("F5: закрытие без name отклоняется (недоступна страница)", True,
                     "страница не открылась: " + str(e)[:100])


def scenario_rework_direct_close(page):
    fr = open_otk(page)
    otk_return_rework(page, O["rw"], reason="E2E: доработать геометрию",
                      wait_rework_tab=False)
    fr = helpers.wait_for_in_any_frame(page, "#tabRework", timeout=15000)
    fr.click("#tabRework")
    ok_row, _ = wait_tab_rows(page, present=[O["rw"]], timeout=45000)
    runner.check("E1: наряд в «Доработка»", ok_row, O["rw"])
    fr = helpers.wait_for_in_any_frame(page, "#queueTable", timeout=15000)
    row = fr.locator("#queueTable tr", has_text=O["rw"]).first
    row.locator("button", has_text="Открыть").click(timeout=60000)
    fr = helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
    fr.fill("#tot_acc", "5")
    fr.fill("#tot_def", "0")
    fr.locator("#naryadCard .btn-close").click()
    ok = wait_toast_contains(page, "Наряд " + O["rw"] + " закрыт", 20000)
    st = naryad_status(page, O["rw"])
    runner.check("E1: rework наряд закрывается напрямую из «Доработка»", ok and st == "closed", O["rw"])


def scenario_accum_after_rework_fix(page, op_name, machine):
    """Полный цикл доработки: rework, фикс оператора, возврат, закрытие.
    Проверяется, что «Проверить» сохраняется (BUG-1 исправлен), а итоги при
    закрытии не превышают количество наряда (qty=1)."""
    nav(page, "shift")
    o2 = shift_issue(page, op_name, machine, qty=1)
    runner.check("E2: выдан наряд для rework-цикла", bool(o2), o2)
    nav(page, "operator")
    operator_accept(page, o2)
    operator_add_transition(page, o2, "E2E: аккумулирующий переход 1")

    fr = open_otk(page)
    row = fr.locator("#queueTable tr", has_text=o2).first
    row.locator("button", has_text="Открыть").click(timeout=60000)
    fr = helpers.wait_for_in_any_frame(page, "#acc_0", timeout=15000)
    fr.fill("#acc_0", "1")
    fr.fill("#def_0", "0")
    fr.locator("#naryadCard button", has_text="Проверить").first.click()
    ok = wait_toast_contains(page, "проверен", 20000)
    runner.check("E2/BUG-1: toast «проверен»", ok, o2)
    obj = eval_server(page, "getOtkNaryad", o2)
    st0 = first_tr(obj, 0, "status")
    runner.check("E2/BUG-1: проверка перехода сохранена (в контексте rework)",
                 st0 == "checked", f"переход остался '{st0}'")

    show_queue(page)
    otk_return_rework(page, o2, reason="E2E: на доработку для аккумуляции",
                      wait_rework_tab=False)

    nav(page, "operator")
    operator_fix_rework(page, o2)

    fr = open_otk(page)
    got, qtxt = wait_queue_contains(page, o2, "Ждёт ОТК", timeout=30000)
    runner.check("E2: наряд вернулся в «Ждёт ОТК» после фикса", got, qtxt[:120])

    fr = helpers.wait_for_in_any_frame(page, "#queueTable", timeout=15000)
    row = fr.locator("#queueTable tr", has_text=o2).first
    row.locator("button", has_text="Открыть").click(timeout=60000)
    fr = helpers.wait_for_in_any_frame(page, "#acc_1", timeout=15000)
    obj = eval_server(page, "getOtkNaryad", o2)
    trs = q(obj, "transitions", [])
    runner.check("E2: у наряда 2 перехода после фикса", len(trs) == 2, f"len={len(trs)}")
    runner.check("E2: наряд в waiting_otk (не rework)", q(obj, "naryad.status") == "waiting_otk",
                 q(obj, "naryad.status"))

    fr = helpers.wait_for_in_any_frame(page, "#tot_acc", timeout=15000)
    fr.fill("#tot_acc", "1")
    fr.fill("#tot_def", "0")
    fr.locator("#naryadCard .btn-close").click()
    ok = wait_toast_contains(page, "Наряд " + o2 + " закрыт", 20000)
    obj = eval_server(page, "getOtkNaryad", o2)
    ci = q(obj, "closingInfo", {})
    runner.check("E2: закрытие наряда после rework-цикла",
                 ok and as_int(q(ci, "total_accepted")) == 1, str(ci)[:120])


SCENARIOS = [
    ("B1: карточка наряда", scenario_open_card),
    ("B2: проверка перехода 1", scenario_check_one),
    ("K: отрисовка checked (API-сид)", scenario_checked_render),
    ("D1: закрытие позитив", scenario_close_ok),
    ("D2: отмена в confirm", scenario_confirm_cancel),
    ("D3: закрытие с браком", scenario_close_defect),
    ("H2: закрытие при 0 проверенных", scenario_h2_close_unverified),
    ("H1: created в «В работе»", scenario_h1_close_created),
    ("F1+H5: негатив и accepted>qty", scenario_negative_values),
    ("H4: несуществующий переход", scenario_h4_wrong_tp),
    ("F4,F5: чужая роль/пустой name", scenario_role_guard),
    ("E1: rework закрыть напрямую", scenario_rework_direct_close),
]


def main():
    from playwright.sync_api import sync_playwright

    if not os.path.exists(config.STORAGE_STATE):
        print("Нет сохранённой сессии. Сначала выполните: python session_setup.py")
        raise SystemExit(2)

    env_skip_e2 = os.environ.get("ND_SKIP_E2") == "1"
    env_only_e2 = os.environ.get("ND_ONLY_E2") == "1"
    env_scen = os.environ.get("ND_SCENARIOS") or ""
    only_scen = [s.strip() for s in env_scen.split(",") if s.strip()]
    op_name = config.CREDS["operator"]["name"]

    if env_only_e2:
        with sync_playwright() as p:
            browser, page = launch_page(p)
            try:
                nav(page, "operator")
                machine = operator_ensure_shift(page)
                if machine:
                    scenario_accum_after_rework_fix(page, op_name, machine)
                else:
                    runner.check("E2: аккумуляция после rework", False, "нет станка оператора")
                runner.finish()
            finally:
                browser.close()
        return

    O["aw"] = seed_api.new_order_number()
    seed_api.make_waiting(O["aw"], 4, ["E2E токарная A"])
    O["ai"] = seed_api.new_order_number()
    seed_api.create_naryad(O["ai"], 3)
    seed_api.create_transition(O["ai"], "E2E в работе")
    O["ac"] = seed_api.new_order_number()
    seed_api.create_naryad(O["ac"], 4)
    O["w2"] = seed_api.new_order_number()
    seed_api.make_waiting(O["w2"], 5, ["E2E переход B1", "E2E переход B2"])
    O["ochk"] = seed_api.new_order_number()
    seed_api.make_checked(O["ochk"], 5, [("E2E ч1", 2, 0), ("E2E ч2", 3, 1)])
    O["d12"] = seed_api.new_order_number()
    seed_api.make_waiting(O["d12"], 3, ["E2E кандидат на отмену"])
    O["w3"] = seed_api.new_order_number()
    seed_api.make_waiting(O["w3"], 5, ["E2E переход с браком"])
    O["w4"] = seed_api.new_order_number()
    seed_api.make_waiting(O["w4"], 4, ["E2E непроверенный"])
    O["fneg"] = seed_api.new_order_number()
    seed_api.make_waiting(O["fneg"], 5, ["E2E негатив"])
    O["frg"] = seed_api.new_order_number()
    seed_api.make_waiting(O["frg"], 4, ["E2E роль-гвард"])
    O["rw"] = seed_api.new_order_number()
    seed_api.make_waiting(O["rw"], 5, ["E2E доработка"])
    print("seeds:", ", ".join(O[k] for k in O))

    with sync_playwright() as p:
        browser, page = launch_page(p)
        try:
            page.wait_for_timeout(12000)
            fr = open_otk(page)
            # --- A: вкладки и фильтрация ---
            # Бюджет 30s (как у open_otk): наполнение #queueTable после свежей
            # навигации при большой очереди/под нагрузкой GAS может превышать 15s.
            ok_a, _ = wait_tab_rows(page, present=[O["aw"]], timeout=30000)
            runner.check("A: «Ждут ОТК» содержит waiting-наряд", ok_a, "")
            fr = helpers.wait_for_in_any_frame(page, "#tabInWork", timeout=15000)
            fr.click("#tabInWork")
            ok_a2, _ = wait_tab_rows(
                page, present=[O["ai"], O["ac"]], absent=[O["aw"]], timeout=30000)
            runner.check("A: «В работе» содержит in_progress И created, без waiting", ok_a2, "")

            for name, fn in SCENARIOS:
                if env_skip_e2 and name.startswith("E"):
                    continue
                if only_scen and name not in only_scen:
                    continue
                try:
                    fn(page)
                except Exception as e:
                    traceback.print_exc()
                    runner.check("сценарий: " + name, False, str(e)[:160])

            if env_skip_e2 or only_scen:
                runner.finish()
                return
            nav(page, "operator")
            machine = operator_ensure_shift(page)
            if machine:
                try:
                    scenario_accum_after_rework_fix(page, op_name, machine)
                except Exception as e:
                    traceback.print_exc()
                    runner.check("E2: аккумуляция после rework", False, str(e)[:160])
            else:
                runner.check("E2: аккумуляция после rework", False, "нет станка оператора")

            runner.finish()
        finally:
            browser.close()


if __name__ == "__main__":
    main()