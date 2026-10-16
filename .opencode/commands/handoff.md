---
description: Сжать текущую сессию в переносимый handoff-документ для следующего агента (качественная замена lossy-compaction)
agent: build
---

Write a portable **handoff document** for the conversation you are in, so a fresh
session or agent can pick the work up without re-explaining it. Save it to
`.opencode/handoff/handoff-<yyMMdd-HHmmss>.md` (create the directory if missing) —
in the repo, not in `%TEMP%`, so it survives the session and a reboot.

Argument (what the next session is for): `$ARGUMENTS`. When given, aim the document
at that purpose; when empty, aim at "continue this work".

Open the document with the **YAML frontmatter block** of the cycle (required by
`instructions/session-loop.md` — all five keys are mandatory, without `loop` the
driver treats the brief as invalid and stops):

```yaml
---
loop: continue                      # continue | done | blocked
iteration: <int>                    # CURRENT iteration number — see below
approved_plan: <ref>                # approved plan: path in docs/specs/, .opencode/design/ or a stage report
session_config: .opencode/session/config.json   # session preset config — see instructions/session-bootstrap.md
next_action: <short>                # one concrete action for the next session
---
```

`iteration` is the number of the **current** iteration of the cycle — take it
from the driver prompt of this run or from `.opencode/loop/state.json` (the
file the driver maintains). It is NOT a fresh "1" by default: the driver hands
out resume only when `loop`/`iteration`/`approved_plan` in the brief agree with
`state.json`, so a wrong `iteration` makes the driver **quietly fall back to a
cold start** (full pre-approval) instead of resuming the work.

Carry the **live thread**: what is in flight, why, and what the next action is.
Add a **Suggested skills** section naming the skills the next agent should reach
for — pick from `.opencode/skills/`, the phase table in `AGENTS.md`, and `GLOSSARY.md`.

Reference, don't copy. Specs (`docs/specs/`), ADRs (`docs/specs/adr/`), the stage
report (`docs/reports/`) and `docs/reports/STATUS.md`, commits and diffs go in as
paths or URLs, never as pasted text — the settled detail lives in one place, not two
that drift apart. Anything already written down is linked, not restated.

Keep the **why**, not only the what: preserve the reasoning that bears on the stated
next task. Mark anything you only assumed (not verified) as an assumption — the next
agent trusts the file and will not re-check it. Redact secrets before writing:
tokens, passwords, connection strings, `.env` values, keys.

Use `GLOSSARY.md` terms for the domain (наряд, запуск, переход, смена, ОТК).
Do not deploy; deploy is a separate, explicit decision.
