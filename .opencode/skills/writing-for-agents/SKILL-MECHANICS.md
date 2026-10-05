# Skill mechanics (OpenCode)

The skill-specific branch of [`writing-for-agents`](SKILL.md): what changes when the
document is a **skill** rather than a general doc. Everything else about writing it is
the universal reference in `SKILL.md`.

## Discovery and frontmatter

A skill is a directory `.opencode/skills/<name>/SKILL.md`. OpenCode lists every one
of them, with its `name` and `description`, in the `skill` tool description at session
start; the agent loads one by name via `skill({ name: "<name>" })`. Nothing is loaded
until then.

Only these frontmatter fields are read:

| Field | Required | Notes |
|---|---|---|
| `name` | yes | 1–64 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`, **must match the directory name** |
| `description` | yes | 1–1024 chars; this is the context pointer — see below |
| `license` | no | |
| `compatibility` | no | e.g. `opencode` |
| `metadata` | no | string→string map |

**Unknown fields are silently ignored.** A frontmatter key that does nothing is worse
than no key: it reads as a promise the runtime does not keep. (the Claude Code field `disable-model-invocation` is not recognised here)
is exactly this — it is a Claude Code field, and here it would be inert while
appearing to guarantee that the model can never fire the skill.)

## Two ways to be reachable

OpenCode has no user-invoked-only skill. Every skill in `.opencode/skills/` is
discoverable by the model. If you need something the model must **not** fire on its own,
put it in `.opencode/commands/` instead:

| | Skill | Command |
|---|---|---|
| Path | `.opencode/skills/<name>/SKILL.md` | `.opencode/commands/<name>.md` |
| Invoked | by the model, or by naming the `skill` tool | by the human typing `/<name>` |
| Frontmatter | `name` + `description` | `description`, optional `agent`/`model`/`subtask` |
| Context load | description always loaded | none until typed |

Rule of thumb: **behaviour the agent should apply automatically → skill. A deliberate
entry point the human invokes → command.** Most flows here live in skills; only
`grill-with-docs` and `code-review` are commands, because those are choices a human
makes on purpose, not reflexes an agent should have.

A command can be a one-liner that loads the skill and adds repo-specific context —
that keeps the reusable instructions in the skill (where they stay reachable and
updatable) and the project wiring in the command.

## The description is the pointer

The description is permanently in context and is the only thing that decides whether
the agent reaches for the skill. It is a **context pointer**, so the pointer-writing
rules in `SKILL.md` apply in full: front-load the leading word, one trigger per branch,
cut identity the body already carries.

- `description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing GLOSSARY.md, or recording or editing an ADR.` — a what plus the branches that should trigger it.
- `description: Useful documentation.` — a what with no branches. The agent cannot tell when to reach, so it never does.

In a project whose users write Russian, include the Russian trigger words in the
description. The model's decision is driven by what the user actually typed.

## Splitting by invocation

The invocation cut of splitting (the sequence cut lives in `SKILL.md`): split a skill
in two when you have a distinct leading word that should trigger one half on its own
(which is a command if it must stay human-only), or when the body has grown both a
runnable procedure and a flat reference that different phases need independently.
The new skill pays context load for its always-loaded description, so independent reach
has to be worth it.

## When a skill stops being found

1. `SKILL.md` must be all caps.
2. Frontmatter needs `name` and `description`.
3. `name` must match the directory name exactly.
4. The skill must not be `deny`-ed in `permission.skill` (`opencode.json`), and the
   agent must have the `skill` tool enabled.
5. Project-local discovery walks up from the cwd to the git worktree — outside the
   repo, project skills are invisible.