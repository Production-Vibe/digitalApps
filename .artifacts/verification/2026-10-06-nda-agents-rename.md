# Переименование проектных агентов: architect → nda-architect, orchestrator → nda-orchestrator

Дата: 06.10.2026
Задача: развязать конфликт имён проектных агентов с плагином `@nest4869/argos`,
чтобы opencode в обычном (не `--pure`) режиме грузил проектные агенты с их
ролями и запретами.

## 1. Grep-обзор старых функциональных ссылок (до изменений)

Область, указанная в задаче: `tools/`, `.opencode/`, `*.cmd` (корень),
`opencode.json`.

| Файл:строка | Совпадение | Статус |
|---|---|---|
| `tools/mcp-orchestrator/index.mjs:14` | `const DEFAULT_AGENT = "orchestrator";` — дефолт `ORCH_AGENT`, уходит в `spawn … --agent` (стр. 294) | **ИЗМЕНЕНО** → `"nda-orchestrator"` |
| `tools/mcp-orchestrator/index.mjs:114` | `process.env.ORCH_AGENT` — чтение env (динамическое, без литерала имени) | без изменений (корректно) |
| `tools/mcp-orchestrator/index.mjs:12` | `const MCP_SERVER_NAME = "orchestrator";` — имя **MCP-сервера** (handshake), должно совпадать с ключом `mcp.orchestrator` в `opencode.json` | **НЕ тронуто** (не агент; `opencode.json` запрещён заданием) |
| `tools/mcp-orchestrator/index.mjs:294` | `args.push("--agent", agent)` — значение берётся из `agentFromEnv()` | без изменений (получает новый дефолт) |
| `.opencode/agents/architect.md`, `.opencode/agents/orchestrator.md` | идентификатор агента = имя файла | **ПЕРЕИМЕНОВАНЫ** в `nda-architect.md` / `nda-orchestrator.md` |
| `.opencode/agents/*.md` (внутри) | только имя инструмента `orchestrator_execute_task`, `docs/specs/architecture.md` | без изменений (не идентификаторы запуска) |
| корневые `*.cmd` (`run-site.cmd`) | `architect`/`orchestrator` не встречаются | без изменений |
| `opencode.json:21-23` | ключ `"orchestrator"` — это **имя MCP-сервера** (`mcp.orchestrator` → `tools/mcp-orchestrator/index.mjs`), не агент | не тронуто (запрещено заданием: правит t2-timeout) |
| `tools/mcp-orchestrator/logs/orchestrator.log` | исторические строки `spawn: … "--agent" "orchestrator"`, `ORCH_AGENT="orchestrator"` | не тронуто — это лог-артефакт прошлых прогонов, не код |
| `tools/mcp-orchestrator/verification/2026-10-06-t2-bridge.md` | исторические примеры `--agent "orchestrator"`, `ORCH_AGENT=""` | не тронуто — датированный отчёт о верификации моста |

Вне области grep, найдено и **оставлено как есть** (документация, не запуск):
- `docs/specs/agent-delegation.md:39,46,70,124-125` — команды запуска
  `opencode --agent architect`, `opencode run … --agent orchestrator`, описание
  `ORCH_AGENT` c дефолтом `orchestrator`;
- `docs/reports/STATUS.md:870` — строка запуска T1 `opencode --agent architect`.

Эти два документа в область обновления задания не входили (grep ограничен
`tools/`, `.opencode/`, `*.cmd`, `opencode.json`) — рекомендовано актуализировать
отдельным решением, чтобы инструкции не вели на агенты плагина.

## 2. Внесённые изменения

1. `.opencode/agents/architect.md` → `.opencode/agents/nda-architect.md`
   (git-индекс: staged, содержимое — только смена пути, `description` и
   `permission` сохранены).
2. `.opencode/agents/orchestrator.md` → `.opencode/agents/nda-orchestrator.md`
   (аналогично).
   - Поле `name:` во frontmatter **не добавлялось**: у существующего
     `.opencode/agents/e2e.md` поля `name` нет — в проекте идентификатор агента
     выводится из имени файла (проверено: до переименования `architect.md`
     резолвился как `architect`). Добавление `name:` противоречило бы формату
     остальных `.opencode/agents/*.md`.
   - `description` оставлен осмысленным (без упоминаний имени файла).
3. `tools/mcp-orchestrator/index.mjs` — `DEFAULT_AGENT = "nda-orchestrator"`.
4. Новый `nda-architect.cmd` в корне репозитория (стиль `run-site.cmd`:
   `@echo off`, `setlocal`, `cd /d "%~dp0"`, баннер, проверка `where opencode`,
   запуск `opencode --agent nda-architect %*`, возврат кода выхода; без
   комментариев).

Не трогалось (по запрету задания): `~/.config/opencode`, плагин argos,
`server/**`, ключи `mcp.postgres`/`mcp.playwright`, `opencode.json`.

## 3. Acceptance-проверки

### (1) `git status --porcelain -uall`

```
A  .opencode/agents/nda-architect.md
A  .opencode/agents/nda-orchestrator.md
 M docs/reports/STATUS.md
 M opencode.json
?? .artifacts/verification/two-terminal-delegation.md
?? docs/specs/agent-delegation.md
?? docs/superpowers/plans/2026-09-25-dictionaries-catalog.md
?? nda-architect.cmd
?? tools/mcp-orchestrator/.gitignore
?? tools/mcp-orchestrator/index.mjs
?? tools/mcp-orchestrator/package-lock.json
?? tools/mcp-orchestrator/package.json
?? tools/mcp-orchestrator/verification/2026-10-06-t2-bridge.md
?? tools/mcp-orchestrator/watch.ps1
?? "манIFEST..." (манифест.md)
```

Проверка существования файлов:
```
architect.md: False
orchestrator.md: False
nda-architect.md: True
nda-orchestrator.md: True
```

Оговорка: строка вида `R old -> new` в porcelain невозможна — `.md`-файлы
**не были в `HEAD`** (`git ls-tree -r HEAD -- .opencode/agents` даёт только
`e2e.md`), поэтому git не может показать их как rename. Суть пункта выполнена:
оба новых файла на месте (staged как `A`), старых `architect.md`/`orchestrator.md`
нет ни в дереве, ни в индексе. `index.mjs` показан как `??` (весь каталог
`tools/` ещё не в `HEAD`, `M` невозможен), `.cmd` — как `??`.

### (2) `node --check tools/mcp-orchestrator/index.mjs`

```
exit=0
```

### (3) Grep в `tools/` и `.opencode/` (без `logs/`, `verification/`, `node_modules/`)

```
=== ORCH_AGENT / --agent ===
tools\mcp-orchestrator\index.mjs:114: const raw = process.env.ORCH_AGENT;
tools\mcp-orchestrator\index.mjs:287: log(`=== Задача #${runId}: старт, таймаут ${timeout} мс, агент ${agent || "(без --agent)"}, корень ${PROJECT_ROOT} ===`);
tools\mcp-orchestrator\index.mjs:294: if (agent) args.push("--agent", agent);
tools\mcp-orchestrator\index.mjs:510: log(`mcp-orchestrator: opencode=…, ORCH_AGENT=${JSON.stringify(agentFromEnv())}, таймаут=${timeoutFromEnv()} мс`);

=== старые идентификаторы (--agent architect / --agent orchestrator,
    DEFAULT_AGENT = "orchestrator", ORCH_AGENT со старым orchestrator) ===
(совпадений нет)
```

Дефолт проверяется так: `index.mjs:14` → `const DEFAULT_AGENT = "nda-orchestrator";`,
окружение `ORCH_AGENT` нигде в репозитории не задаётся со старым значением.

### (4) `opencode agent list` (обычный режим, без `--pure`)

```
build (primary)
compaction (primary)
explore (subagent)
general (subagent)
plan (primary)
summary (primary)
title (primary)
architect (subagent)          <- агент плагина argos (не наш)
coder (subagent)
designer (subagent)
e2e (subagent)
explorer (subagent)
fixer (subagent)
librarian (subagent)
nda-architect (primary)       <- НАШ (mode: primary — как в frontmatter)
nda-orchestrator (subagent)   <- НАШ (mode: subagent — как в frontmatter)
oracle (subagent)
orchestrator (primary)        <- агент плагина argos (не наш)
refactorer (subagent)
reviewer (subagent)
tester (subagent)

nda-architect present: True
nda-orchestrator present: True
```

До переименования в списке были `architect (subagent)` и `orchestrator (primary)` —
режимы не совпадали с нашими файлами (`mode: primary` у архитектора, `mode:
subagent` у оркестратора), т.е. побеждали агенты плагина. После переименования
`nda-architect (primary)` и `nda-orchestrator (subagent)` — режимы совпадают с
frontmatter проектных файлов, значит грузятся именно проектные агенты.
Полную проверку режимов/permission делает t3-g3check.

## Вывод

Все 4 acceptance-пункта выполнены и подтверждены выводом команд; ограничение
по формату git-status (отсутствие `R`/`M` для файлов, которых нет в `HEAD`)
зафиксировано выше и не является отклонением от задания.
