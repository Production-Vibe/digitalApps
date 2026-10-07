# Checkpoint CQ1: переименование (t1-rename) + таймаут (t2-timeout) в обычном режиме opencode

Дата: 06.10.2026. Проверяющий: роль Tester (checkpoint CQ1).
Объект проверки: `.opencode/agents/nda-{architect,orchestrator}.md`, `tools/mcp-orchestrator/index.mjs`,
корневой `nda-architect.cmd` (t1-rename) + `opencode.json → mcp.orchestrator.timeout` (t2-timeout).
**Ничего не чинилось** — только чтение/прогоны; при FAIL задача останавливалась бы с деталями.

> **⚠ Актуальность (предупреждение, 07.10.2026):** ролевые факты ниже
> (`nda-architect: bash = deny`, `nda-orchestrator (subagent)`) описывают состояние
> **до g3-fix**. После фикса 07.10.2026 05:52 фактически: `bash: ask` у архитектора
> (иначе детерминированный 403 free-tier gateway), оба агента — `mode: primary`
> (иначе `run --agent` даёт fallback на default). **Не копировать эти факты как
> «пост-fix»** — канон ролей: `.opencode/agents/nda-*.md`,
> `docs/specs/agent-delegation.md`, `.artifacts/verification/two-terminal-delegation.md` (§ФИКС).

Режим: обычный `opencode` (с плагинами, **без `--pure`**). Все порождаемые процессы — с жёстким
внешним таймаутом (`Start-Process -PassThru → WaitForExit(ms) → Kill`): дефолт **60000**, handshake
моста **30000**. Бессрочных ожиданий не было. Пробник handshake лежал **вне репозитория**
(`%TEMP%\opencode\cq1-handshake.mjs`) — в рабочее дерево мусор не попал.

---

## Проверка 1: `opencode agent list` (обычный режим) — PASS

Команда (гарант-таймаут 60000; процесс завершился сам, Kill не понадобился):

```powershell
& "C:\Users\Пользователь\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" agent list
# и дубли через Start-Process … WaitForExit(60000)
```

Ключевой вывод (прогон с `EXITCODE=0`, `elapsed=1692ms`, `errBytes=0`; первый прогон —
`outBytes=104150, errBytes=0`, тоже без Kill):

```
EXITCODE=0 elapsed=1692ms outBytes=108914 errBytes=0
headers=21
nda-architect: True
nda-orchestrator: True
architect(plugin): True
orchestrator(plugin): True
```

Заголовки-блоки (все 21, порядок как в выводе; `*` — плагин argos/прочие, не наши):

```
build (primary) … plan (primary) summary (primary) title (primary)
architect (subagent)        <- плагин (присутствует)
coder/designer/e2e/explorer/fixer/librarian (subagent)
nda-architect (primary)     <- НАШ, mode совпадает с frontmatter
nda-orchestrator (subagent) <- НАШ, mode совпадает с frontmatter
oracle (subagent)
orchestrator (primary)      <- плагин (присутствует)
refactorer/reviewer/tester (subagent)
```

Блок **`nda-architect (primary)`** — дословный фрагмент (хвост разрешений):

```json
  { "permission": "edit",   "action": "deny",  "pattern": "*" },
  { "permission": "bash",   "action": "deny",  "pattern": "*" },
  { "permission": "task",   "action": "deny",  "pattern": "*" },
  { "permission": "orchestrator_execute_task", "action": "allow", "pattern": "*" }
```

Блок **`nda-orchestrator (subagent)`** — дословный фрагмент:

```json
  { "permission": "orchestrator_execute_task", "action": "deny", "pattern": "*" },
  { "permission": "task", "action": "deny", "pattern": "*" }
```

Проверки (повторены на **двух независимых прогонах** `agent list`, идентичный результат):

```
PASS | nda-architect: orchestrator_execute_task=allow | найдено
PASS | nda-architect: edit=deny    | найдено
PASS | nda-architect: bash=deny    | найдено
PASS | nda-architect: task=deny    | найдено
PASS | nda-orchestrator: orchestrator_execute_task=deny | найдено
PASS | nda-orchestrator: task=deny | найдено
PASS | plugin architect (subagent) present    | заголовок есть
PASS | plugin orchestrator (primary) present  | заголовок есть
```

Плагинные записи на месте → плагин не трогали и он по-прежнему грузится (21 блок вместо
«чистого» набора без плагина).

### Наблюдение (вне формулировки акцепта, не блокер)

Строгая **дополнительная** суб-проверка, придуманная самим верификатором («у плагинного
`architect` тоже должен быть `orchestrator_execute_task=allow`») дала FAIL — и это ожидаемо:
в плагинных блоках **вообще нет** записей `orchestrator_execute_task` (и `mcp*`-пермишенов нет ни
у кого). Списки уникальных пермишенов:

```
architect (subagent), 21 unique: *, bash, context7_*, doom_loop, edit, external_directory,
  get_failure_classification_guide, glob, grep, grep_app_*, list, plan_enter, plan_exit,
  question, read, skill, submit_task_result, webfetch, websearch, websearch_*, write
orchestrator (primary), 19 unique: *, bash, context7_*, discard_remaining_groups, dispatch_tasks,
  doom_loop, execute_next_group, external_directory, get_failure_classification_guide,
  grep_app_*, plan_enter, plan_exit, question, read, register_task_group, skill,
  submit_task_result, task, websearch_*
```

Это подтверждает, а не опровергает акцепт: пермишен `orchestrator_execute_task` существует только
в проектных агентах, плагинные блоки выглядят «как есть» (в `orchestrator (primary)` —
`task:* deny` + `task:oracle allow`, `dispatch_tasks` и т.п.). Акцепт формулировался как
«плагинные записи **присутствуют**» — он выполнен.

## Проверка 2: `opencode.json → mcp.orchestrator.timeout = 900000` — PASS

```powershell
Select-String -Path opencode.json -Pattern '"timeout"'
Select-String -Path opencode.json -Pattern '15000'
```

Ключевой вывод:

```
line 26: "timeout": 900000
15000 NOT FOUND
```

Фрагмент конфига (строки 21–27):

```json
    "orchestrator": {
      "type": "local",
      "command": ["node", "tools/mcp-orchestrator/index.mjs"],
      "cwd": ".",
      "enabled": true,
      "timeout": 900000
    }
```

`git diff HEAD -- opencode.json` — единственное изменение относительно HEAD в этом ключе
(блок `mcp.orchestrator` целиком новый против HEAD, внутри него ровно `"timeout": 900000`);
ключи `postgres`/`playwright` не тронуты. Совпадает с дефолтом моста
(`index.mjs:120` — `ORCH_TIMEOUT_MS`, `index.mjs:439` — «по умолчанию env ORCH_TIMEOUT_MS, иначе 900000»).

## Проверка 3: handshake stdio-моста — PASS

Способ: пробник `%TEMP%\opencode\cq1-handshake.mjs` поднимает
`node tools/mcp-orchestrator/index.mjs` (`cwd` = корень проекта), гоняет raw JSON-RPC и **сам убивает**
мост после ответов; внешний гарант — `Start-Process node → WaitForExit(30000) → Kill`.

Транскрипт (реальные строки, `-->` ушло / `<--` пришло):

```
spawn pid=22560 t=0ms
 --> {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cq1-verifier","version":"1.0"}}}
 <-- {"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"orchestrator","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
init done at +181ms
 --> {"jsonrpc":"2.0","method":"notifications/initialized"}
 --> {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
 <-- {"result":{"tools":[{"name":"execute_task",…,"inputSchema":{…,"required":["task"],…}}]},"jsonrpc":"2.0","id":2}
tools/list done at +188ms
```

Итог пробника:

```
SUMMARY {"serverName":"orchestrator","proto":"2025-06-18","tools":["execute_task"],
         "required":["task"],"taskType":"string","ok":true,"stderrBytes":0,
         "elapsedMs":196,"childExit":null,"childSignal":null}
SCHEMA {"type":"object","properties":{"task":{"type":"string",…},"context":{"type":"string",…},
        "timeoutMs":{"type":"number",…}},"required":["task"],"additionalProperties":false,…}
```

Проверки:

```
PASS | initialize → serverInfo.name=orchestrator | {"name":"orchestrator","version":"0.1.0"}
PASS | tools/list → execute_task                 | tools=["execute_task"]
PASS | task — обязательное свойство              | required=["task"], task.type=string
PASS | stderr моста за сеанс = 0 байт            | stderrBytes=0 (плюс stderr самого пробника=0)
PASS | внешний таймаут 30000 отработан штатно    | процесс вышел сам за 260мс (лимит 30000), Kill не понадобился;
                                                  после ответов мост добровольно убит пробником
PASS | нет node-сирот после прогона              | Get-CimInstance (Name=node.exe + мост/пробник) → 0 строк
```

`childExit/childSignal: null` в SUMMARY — снимок сразу после `kill()` (гонка), поэтому живучесть
проверена отдельно строгим запросом по `node.exe` (сирот нет).

## Проверка 4: `git status --porcelain -uall` — PASS

Фактический вывод (до записи этого протокола):

```
A  .opencode/agents/nda-architect.md
A  .opencode/agents/nda-orchestrator.md
 M docs/reports/STATUS.md
 M opencode.json
?? .artifacts/verification/2026-10-06-nda-agents-rename.md
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

После записи протокола добавляется ровно одна ожидаемая строка этого checkpoint:
`?? tools/mcp-orchestrator/verification/2026-10-06-rename-timeout.md`.

Классификация:

| Группа | Строки | Источник |
|---|---|---|
| **t1-rename** | `A .opencode/agents/nda-architect.md`, `A .opencode/agents/nda-orchestrator.md`, `?? nda-architect.cmd`, `?? .artifacts/verification/2026-10-06-nda-agents-rename.md`, `?? tools/mcp-orchestrator/index.mjs` (внутри него правка `DEFAULT_AGENT`; каталог `tools/` не в HEAD, поэтому `??`, а не `M`) | изменения этапа t1 |
| **t2-timeout** | ` M opencode.json` | изменения этапа t2 |
| **до t1/t2 (baseline)** | ` M docs/reports/STATUS.md`, `?? .artifacts/verification/two-terminal-delegation.md`, `?? docs/specs/agent-delegation.md`, `?? docs/superpowers/plans/2026-09-25-…`, `?? tools/mcp-orchestrator/{.gitignore,package.json,package-lock.json,watch.ps1,verification/2026-10-06-t2-bridge.md}`, `?? манифест.md` | присутствовали уже в собственном снапшоте `git status` из отчёта t1 (`.artifacts/verification/2026-10-06-nda-agents-rename.md`, §3(1)) |
| **протокол CQ1** | `?? tools/mcp-orchestrator/verification/2026-10-06-rename-timeout.md` | этот файл |

Дополнительно:

```
=== server/ untouched? ===
(server/ — пусто, не тронут)          # git status --porcelain -uall -- server/ → 0 строк
=== старые файлы агентов ===
architect.md: False   orchestrator.md: False
nda-architect.md: True  nda-orchestrator.md: True
=== мусор ===
нет: .probe/, cq1-*.mjs в репозитории (пробник в %TEMP%), удалённых/незапланированных строк нет
=== сироты процессов ===
node-процессов моста/пробника: 0
```

Удалений (` D`) в выводе нет; `server/` не затронут; мусора в рабочем дереве нет.

---

## Сводная матрица акцептов

| # | Чек | Вердикт | Ключевое доказательство |
|---|---|---|---|
| 1 | `agent list`: `nda-architect` — `orchestrator_execute_task=allow` + `edit/bash/task=deny`; `nda-orchestrator` — `orchestrator_execute_task=deny` + `task=deny`; плагинные `architect (subagent)`/`orchestrator (primary)` на месте | **PASS** | 8/8 суб-проверок PASS на двух прогонах; `EXITCODE=0`, `errBytes=0`, 21 блок заголовков |
| 2 | `opencode.json`: `mcp.orchestrator.timeout = 900000` | **PASS** | `line 26: "timeout": 900000`; `15000 NOT FOUND` |
| 3 | Handshake моста: `serverInfo.name=orchestrator`, `execute_task` c `required:["task"]`, stderr 0, внешний таймаут 30000 штатен | **PASS** | `SUMMARY … "serverName":"orchestrator","required":["task"],"stderrBytes":0`; выход сам за 260 мс (лимит 30000), мост убит после ответов, сирот 0 |
| 4 | `git status -uall` — только ожидаемые изменения t1/t2 (+ baseline и протокол), мусора нет, `server/` не тронут | **PASS** | 16 строк классифицированы (t1=5, t2=1, baseline=9, протокол=1); `server/` → 0 строк |

**Итог CQ1: 4/4 PASS.**

## Что не проверено (граница checkpoint)

- Живой вызов `tools/call execute_task` с реальным вложенным `opencode run --agent nda-orchestrator`
  (в CQ1 входит только handshake/схема; живой прогон — отдельная контрольная точка).
- Интеграция моста с хостом opencode через `mcp.orchestrator` в реальной сессии (проверялось
  одноразовое чтение конфига, не поднятие хоста).
- Работа `nda-architect.cmd` двойным кликом (запуск шелла и редиректы на Windows) — в акцептах нет.

## Как воспроизвести

```powershell
# 1) агенты (обычный режим, с плагинами)
& "C:\Users\Пользователь\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe" agent list
#    искать блоки nda-architect (primary) / nda-orchestrator (subagent)

# 2) таймаут
Select-String -Path opencode.json -Pattern '"timeout"'

# 3) handshake (пробник лежит вне репозитория)
node "$env:TEMP\opencode\cq1-handshake.mjs"

# 4) чистота дерева
git status --porcelain -uall
git status --porcelain -uall -- server/
```
