---
description: Ревью изменений по двум осям — Standards (конвенции репозитория) и Spec (задача)
agent: build
---

Load the `code-review` skill with the `skill` tool and run it.

If no fixed point was given, ask for one (`main`, a tag, `HEAD~5`, a commit SHA).

Repo specifics are already wired into the skill: standards sources are
`AGENTS.md` («Технические конвенции кода», «Do / Don't»),
`instructions/verification.md`, `instructions/safety.md` and `GLOSSARY.md`;
the spec is a file under `docs/specs/` or the stage report under `docs/reports/`.
There is no issue tracker in this project.