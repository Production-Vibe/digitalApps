---
description: Жёсткое интервью по задаче или решению, попутно фиксируя домен (GLOSSARY.md) и ADR
agent: build
---

Load the `grilling` and `domain-modeling` skills with the `skill` tool, then run them.

Additions for this repo:

- Ground every question in the code: check `server/src/**` and
  `server/prisma/schema.prisma` before asking something that may already be
  implemented.
- Read `docs/reports/STATUS.md` first — anything already decided, done, or
  explicitly deferred is not a question.
- Use the Russian domain terms from `GLOSSARY.md` (наряд, запуск, техпереход, ОТК).
- When the frontier empties, the agreed design is written to `docs/specs/`
  (domain terms → `GLOSSARY.md`, hard-to-reverse decisions → `docs/specs/adr/`).
  Do not stop at a chat summary.
- Do not deploy. Deployment is a separate, explicit decision by the user.