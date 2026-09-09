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
Общие шаги вынесены в flows.py.
"""

import os
import traceback

sys_path_here = os.path.dirname(os.path.abspath(__file__))
if sys_path_here not in __import__("sys").path:
    __import__("sys").path.insert(0, sys_path_here)

import config
import helpers
import runner
from flows import (
    capture_order_from_toast,
    launch_page,
    nav,
    operator_accept,
    operator_add_transition,
    operator_ensure_shift,
    operator_fix_rework,
    operator_verify_closed,
    otk_check_transition,
    otk_close,
    otk_return_rework,
    shift_issue,
)


def main():
    from playwright.sync_api import sync_playwright

    if not os.path.exists(config.STORAGE_STATE):
        print("Нет сохранённой сессии. Сначала выполните: python session_setup.py")
        raise SystemExit(2)

    op_name = config.CREDS["operator"]["name"]

    with sync_playwright() as p:
        browser, page = launch_page(p)
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