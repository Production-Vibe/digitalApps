# GLOSSARY.md Format

## Structure

```md
# {Project Name}

{One or two sentence description of what this project is and why it exists.}

## {Group name}

**{Term}**:
{A one or two sentence definition — what it IS, not what it does.}
_Avoid_: {wrong words for the same thing}
```

Terms in this repo are written **in Russian** — the domain language is Russian (наряд, запуск, техпереход, смена, ОТК, ПА, КД), and code/identifiers are English. Define terms in the language the users actually use.

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Only include terms specific to this project's context.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively. Before adding a term, ask: is this a concept unique to this context, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge (Roles, Documents, Statuses, Contours). If all terms belong to a single cohesive area, a flat list is fine.
- **One file.** This repo is a single context: `GLOSSARY.md` at the root. No map file.
