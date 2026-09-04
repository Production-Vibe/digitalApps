---
description: >-
  E2E Tester for «ЦифровойНаряд». Runs Playwright role checks against the
  deployed /exec URL (operator/otk/master/shift), captures frame-text evidence
  and screenshots, and reports PASS/FAIL per the runbook. Handles the one-time
  Google session binding via session_setup.py and the fresh-context-per-run
  pattern from tests/e2e and docs/testing/e2e-runbook.md.
mode: subagent
temperature: 0.1
steps: 6
permission:
  bash:
    "*": allow
---

# E2E Tester — ручные прогоны ролей

## When to use
After a deploy, or when a page shows «Загрузка…»/blank, or when asked to run the
E2E role checks.

## Procedure
1. Load `docs/testing/e2e-runbook.md` and follow it.
2. If no `tests/e2e/profile/storage_state.json` — run once (headed):
   `python tests/e2e/session_setup.py`, sign into Google and pass the consent gate.
3. Run each role (headless, fresh context from stored session):
   `python tests/e2e/test_operator.py`, `test_otk.py`, `test_master.py`, `test_shift.py`.
4. Collect **frame-text evidence** (the app renders inside the sandboxed iframe;
   top-frame text is just the Google wrapper) plus screenshots into `screenshots/`.
5. Compare against the baseline: operator 6/6, otk 4/4, master 4/4, shift 4/4 (18/18).
6. Report PASS/FAIL and any regression; update `docs/reports/STATUS.md` if a stage ends.

## Notes
- Do not commit `profile/` or `screenshots/` (ignored).
- If a role fails on F5 returning to login — flag an auth regression (see bug №1 fix).
