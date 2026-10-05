---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing GLOSSARY.md, or recording or editing an ADR.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

This repo has a single context:

```
/
├── GLOSSARY.md                      ← domain terms (наряд, запуск, ОТК, …)
├── docs/
│   ├── specs/                       ← architecture, roles, data-model
│   │   └── adr/
│   │       ├── ADR-006-ui-tech.md
│   │       └── ADR-009-dictionaries-catalog.md
│   └── reports/                     ← STATUS.md + dated stage reports
└── server/src/
```

ADR naming here is `ADR-NNN-<slug>.md` (not `0001-`). Scan `docs/specs/adr/` for the highest existing number and increment.

Create files lazily: only when you have something to write.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `GLOSSARY.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update GLOSSARY.md inline

When a term is resolved, update `GLOSSARY.md` right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

`GLOSSARY.md` should be totally devoid of implementation details. Do not treat `GLOSSARY.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

**Not here:** `GLOSSARY.md` is not a status board. What *is* happening and what comes next lives in `docs/reports/STATUS.md` — never duplicate that here.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

This repo also commits: **статус решений в чате не заменяет ADR**, а отчёт этапа в `docs/reports/` не заменяет спеку в `docs/specs/` — если решение архитектурное, оно идёт в `docs/specs/adr/`.
