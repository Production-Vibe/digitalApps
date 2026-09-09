"""Прямое обращение к doPost WebApp: сиды нарядов и проверка данных.

Используется тестами для детерминированной набивки состояний наряда без UI и
без расходования запусков Launches:
  created -> create_naryad
  waiting_otk -> create_naryad + create_transition + complete_transition
  checked -> + check_transition
  closed -> + close_naryad (требует closed_by = роль otk)

Чтение очередей/карточек для ассертов — getOtkQueue/getOtkNaryad через
google.script.run на странице ОТК (eval_server в test_otk_full.py).
"""

import json
import os
import random
import time
import urllib.request

import config


def post(action, payload=None, attempts=4):
    data = {"action": action}
    if payload:
        data.update(payload)
    url = config.APP_URL
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                raw = r.read().decode("utf-8")
                try:
                    return json.loads(raw)
                except ValueError:
                    return {"error": "non-json: " + raw[:200]}
        except Exception as e:
            last = e
            time.sleep(3 + i * 3)
    return {"error": f"POST {action} failed after {attempts}: {last}"}


def new_order_number():
    # Н-<yymmdd>-<6 цифр> — формат генератора нарядов приложения.
    stamp = time.strftime("%y%m%d")
    return f"Н-{stamp}-{random.randint(0, 999999):06d}"


def create_naryad(order_number, qty, detail_name="E2E OTK", detail_code="E2E-OTK"):
    return post("create_naryad", {
        "naryad_number": order_number,
        "detail_name": detail_name,
        "detail_code": detail_code,
        "quantity": qty,
    })


def create_transition(order_number, desc, machine="Т1-1", operator=None, qty=1):
    operator = operator or config.CREDS["operator"]["name"]
    return post("create_transition", {
        "naryad_number": order_number,
        "description": desc,
        "operator": operator,
        "machine": machine,
        "actual_time": 5,
        "melt": "E2E-ПЛАВКА-" + order_number[-4:],
        "quantity": qty,
    })


def _tp_int(tp):
    """Лист Transitions хранит '№ перехода' числом (5), а API отдаёт строку '005';
    сервер сравнивает строго (===), поэтому передаём число."""
    try:
        return int(str(tp).strip())
    except (TypeError, ValueError):
        return tp


def complete_transition(order_number, tp):
    return post("complete_transition", {
        "naryad_number": order_number,
        "tp": _tp_int(tp),
    })


def check_transition(order_number, tp, accepted_qty=0, defect_qty=0):
    return post("check_transition", {
        "naryad_number": order_number,
        "tp": _tp_int(tp),
        "accepted_qty": accepted_qty,
        "defect_qty": defect_qty,
    })


def close_naryad(order_number, accepted_qty=0, defect_qty=0,
                 defect_reason="", closing_note=""):
    return post("close_naryad", {
        "naryad_number": order_number,
        "total_accepted": accepted_qty,
        "total_defect": defect_qty,
        "defect_reason": defect_reason,
        "closing_note": closing_note,
        "closed_by": config.CREDS["otk"]["name"],
    })


def make_waiting(order_number, qty, descs, operator=None):
    """Создать наряд waiting_otk с заданными описаниями переходов (completed)."""
    create_naryad(order_number, qty)
    tps = []
    for d in descs:
        r = create_transition(order_number, d, operator=operator)
        tp = r.get("tp")
        tps.append(tp)
        complete_transition(order_number, tp)
    return tps


def make_closed(order_number, qty, descs, acc=0, dec=0,
                defect_reason="", closing_note=""):
    """Создать наряд и закрыть (без проверки переходов вручную)."""
    make_waiting(order_number, qty, descs)
    return close_naryad(order_number, acc, dec, defect_reason, closing_note)


def make_checked(order_number, qty, specs):
    """Создать waiting_otk и отметить переходы checked.

    specs — список (описание, принято, брак). tps генерируются приложением.
    """
    descs = [s[0] for s in specs]
    tps = make_waiting(order_number, qty, descs)
    for tp, (_, acc, dec) in zip(tps, specs):
        check_transition(order_number, tp, acc, dec)
    return tps