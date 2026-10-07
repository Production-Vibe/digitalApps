# Сквозная верификация «два терминала: архитектор → MCP-мост → оркестратор»

Дата: 06.10.2026, окно ~11:12–11:39 MSK (06:12–06:39Z). Роль: Tester — только
проверка; код/конфиг не менялись, ничего не коммитилось. Это **повторный
прогон** (предыдущая отправка результата упала с транспортной ошибкой
`undefined`); все проверки перезапущены заново, доказательства ниже — свежие.

## Итог: FAIL (2 пункта: V7 — не тот актёр; V-RECURSION — анти-рекурсии нет)

| # | Пункт | Вердикт |
|---|---|---|
| V2 | `opencode mcp list` — orchestrator подключён, соседи не сломаны | **PASS** |
| V4 | `opencode agent list` — оба агента видны, ошибок конфига нет | **PASS (с находкой)** |
| V7 | сквозной architect → мост → оркестратор → `.probe/e2e.txt` = `ARCH-OK` | **FAIL** (цепочка доказана, но актёр — default-агент после fallback, не проектный architect) |
| V-RECURSION | оркестратор не может вызвать сам себя | **FAIL — CRITICAL** (вызов принят и исполнен, 2 спавна) |
| V-TOOL-SCHEMA | минимальный валидный diff `opencode.json` | **PASS** |
| V5 | `npm run build` + `npm run check` | **PASS** |
| V6 | git status = только ожидаемый набор, времянок нет | **PASS** |
| CLEANUP | тестовые файлы удалены, зависших процессов нет | **PASS** |

Общая первопричина V7 и V-RECURSION: **внешние плагиновые агенты затеняют
проектные `.opencode/agents/*.md`**, поэтому в обычном режиме `architect` —
subagent-плагин (→ fallback на default), `orchestrator` — primary-плагин с
`*: allow` (→ запрет `orchestrator_execute_task: deny` из проектного файла не
применяется).

---

## V2 — MCP-серверы: PASS

`opencode mcp list` (свежий прогон, 11:12 MSK):

```
✓ postgres connected      (npx …server-postgres postgresql://…localhost:5432/MOSD)
✓ playwright connected    (npx @playwright/mcp --headless)
✓ orchestrator connected  (node tools/mcp-orchestrator/index.mjs)
✓ context7 connected
✓ grep_app connected
✗ websearch failed        (SSE error: Non-200 status code (403), https://mcp.exa.ai/…)
6 server(s)
```

`orchestrator` присутствует и подключён; `postgres`/`playwright` не сломаны.
`websearch` — пре-существующая внешняя поломка (403 на стороне mcp.exa.ai), к
фиче отношения не имеет. Строка подключения postgres с паролем в артефакты не
переносится.

## V4 — агенты видны: PASS с находкой

`opencode agent list` (свежий): ошибок валидации конфигурации нет
(поиск `error|invalid|fallback` в выводе — 0 совпадений). В списке:
`architect (subagent)`, `orchestrator (primary)`, `e2e (subagent)` +
встроенные (`build/plan/title/…`) и плагинные (`fixer/librarian/oracle/
refactorer/reviewer/tester`).

**Находка:** режимы противоречат проектным файлам — в `.opencode/agents/
architect.md` объявлен `mode: primary`, а фактически `architect` разрешается
как **subagent**; в `orchestrator.md` — `mode: subagent`, фактически
**primary**. См. раздел «Первопричина».

## V7 — сквозной прогон: FAIL (цепочка доказана, актёр — не архитектор)

Команда (дословно по заданию):
`opencode run --agent architect --format json '<Согласуй и сразу делегируй
через orchestrator_execute_task задачу: создать файл
tools/mcp-orchestrator/.probe/e2e.txt со строкой ARCH-OK и убедиться, что он
создан. Ты не можешь писать файлы сам — обязан вызвать инструмент.>'`
→ exit 0, 219 с, события в `%TEMP%\opencode\v7-architect-r2.json`.

**(а) Вызов MCP-тула доказан.** В JSON-событиях уровень-1:
`TOOL_USE: orchestrator_execute_task status=error input={"task":"Создай файл
C:\Projects\digitalApps\tools\mcp-orchestrator\.probe\e2e.txt …"}` —
`EXEC_TOOL_CALLS=1`, `status=error` = `MCP error -32001: Request timed out`
(клиентский `timeout: 15000` из `opencode.json` — таймаут, **не** отказ в
доступе; спавн при этом состоялся, см. (б)).

**(б) Реальный write/bash во вложенном прогоне доказан.** Лог моста
(`tools/mcp-orchestrator/logs/orchestrator.log`, новые строки от offset
245119):

```
06:22:41.853Z === Задача #1: старт, таймаут 900000 мс, агент orchestrator ===
06:22:41.897Z spawn: opencode.exe "run" "--format" "json" "--agent" "orchestrator" <промпт 502 симв.>
06:23:03.299Z tool| bash   New-Item -ItemType Directory -Force …\.probe
06:23:09.247Z tool| write  filePath=…\.probe\e2e.txt content="ARCH-OK\n" → "Wrote file successfully."
06:23:13.498Z tool| read   e2e.txt → "1: ARCH-OK"
06:23:19.734Z tool| bash   hex-проверка → bytes=8 hex=41 52 43 48 2D 4F 4B 0A
06:23:38.210Z === Задача #1: завершена, success=true, ошибок=0, 56358 мс; инструменты: bash, write, read
```

Вложенного рекурсивного вызова в этом прогоне **не было**
(`HAS_EXECUTE_TOOL_IN_NESTED=False`, ровно один `=== Задача #1:` старт/финиш).

**(в) Файл на диске доказан** (отдельной командой до очистки):

```
FILE EXISTS size=8 hex=41-52-43-48-2D-4F-4B-0A text=ARCH-OK
created=2026-10-06 06:23:09Z
```

**(г) Структурированная сводка** — финальный текст уровень-1: «Готово — задача
выполнена делегированным процессом, файл проверен чтением. **Итог:** ✅ Файл
создан: `…\.probe\e2e.txt` (8 байт), ✅ содержимое прочитано обратно:
`ARCH-OK`, ✅ …».

**Почему FAIL.** Первая строка вывода рана (в JSON-файле до первого события):

```
! agent "architect" is a subagent, not a primary agent. Falling back to default agent
```

Актёр уровень-1 — **default-агент**, а не проектный `architect`
(подтверждено поведением: level-1 свободно вызывал `bash` — `git status`,
`Get-Process`, `Start-Sleep`, — тогда как проектный `architect` имеет
`bash: deny`). Проектный архитектор в этом прогоне **не запускался вовсе**.
Требование «архитектор реально вызывает `orchestrator_execute_task`»
невыполнено: вызвал default-агент, у которого тула доступны легитимно.
Авторство файла, в отличие от прошлого прогона, теперь доказано на 100 %
(запись `write` в логе моста со временем, совпадающим с CreationTime файла).

## V-RECURSION — CRITICAL FAIL (свежий прогон)

`opencode run --agent orchestrator --format json 'Вызови инструмент
orchestrator_execute_task с задачей "создай файл x.txt"'` (запуск 11:13 MSK;
шел дольше прежнего из-за polling-поведения модели и был остановлен по
таймауту оболочки 300 с; события сохранены в
`%TEMP%\opencode\v-recursion-r2.json`, 40 строк).

**Отказа НЕ было.** Доказательства:

1. События уровень-1: сначала модель прочитала `.opencode/agents/orchestrator.md`
   (где прямо запрещён вызов) и `opencode.json`, затем **всё равно вызвала тул
   дважды**: `TOOL_USE: orchestrator_execute_task status=error` (task «создай
   файл x.txt», 17 симв.) и повторный вызов (task «Создай пустой файл x.txt в
   корне… Почему ты не сделал?»). `status=error` → точный текст ошибки:
   `MCP error -32001: Request timed out` — **таймаут, не permission-denied**.
2. Лог моста (свежие строки): `06:15:22.826Z spawn: … "run" … "--agent"
   "orchestrator" <17 симв.>` (Задача #1, завершилась success=true, 24813 мс,
   инструменты glob — вложенный ран спланировал и попросил подтверждение
   вместо создания) и `06:17:10.566Z` Задача #2 (200 симв.) → вложенный ран
   **реально создал `x.txt`** (`tool| write` 06:18:08Z, `content=""`) и
   проверил `glob` (06:18:20Z).
3. Ни `permission-denied`, ни отказа «рекурсия запрещена» нет нигде; env-guard
   уровня вложенности в `tools/mcp-orchestrator/index.mjs` отсутствует (есть
   только per-instance мьютекс `busy` — он не срабатывает, т.к. у каждого
   рана свой экземпляр моста).
4. Глубина не ограничена: в этом же прогоне уровень-1 дважды породил уровень-2
   (задачи #1 и #2); в прогоне V7 предыдущего — до 3 уровней.

Побочных остатков нет: `x.txt` (0 байт) создан вложенным раном и **удалён
уборкой**; зависших процессов не осталось (см. CLEANUP).

## Первопричина (для передачи в Coder)

Свежие `opencode debug agent …` (JSON, промпт по первым символам):

| Вызов | mode | промпт | `orchestrator_execute_task` |
|---|---|---|---|
| `debug agent architect` (обычный) | **subagent** | английский плагинный `<Role>You are the System Architect…` | нет записи ([]) |
| `debug agent architect --pure` | **primary** | проектный русский `# Архитектор — диалог и делегирование` | `allow` |
| `debug agent orchestrator` (обычный) | **primary** | английский плагинный `You are the Orchestrator — the strategic command layer…` | нет записи ([]) → фактически `*: allow` |
| `debug agent orchestrator --pure` | **subagent** | проектный русский `# Оркестратор-исполнитель` | `deny` |

- `--pure` = «run without external plugins» (help `opencode run`) → проектные
  агенты видны **только** в чистом режиме.
- Источник плагинов: глобальный `~/.config/opencode/opencode.jsonc` →
  `"plugin": ["@nest4869/argos", "opencode-antigravity-auth@latest"]`;
  проектный `opencode.json` ключа `plugin` не содержит (ключи: `$schema,
  instructions, mcp, permission`).
- Следствия: (1) `run --agent architect` → fallback на default (V7); (2) мост
  спавнит `opencode run … --agent orchestrator` **без `--pure`**
  (`index.mjs`) → плагиновый primary-orchestrator с `*: allow` →
  анти-рекурсивный `deny` проектного файла не действует (V-RECURSION).

### Новая находка этого прогона: `--pure`-обход сломан отдельно

`opencode run --pure --agent architect …` падает **детерминированно**:

```
{"type":"error", … "message":"OpenCode's free tier can only be used from
within OpenCode", "statusCode":403 … url=https://opencode.ai/zen/v1/chat/completions}
```

Матрица (все свежие):

| Запуск | Результат |
|---|---|
| `--pure --agent architect` + длинный промпт (×2), короткий «PONG», `--print-logs`, `-m opencode/mimo-v2.6-flash-free` | **403 FreeTierError — 5/5** |
| `--pure` (default build) + «PONG» | exit 0, модель `big-pickle`, ответ получен |
| `--pure --agent orchestrator` / `--pure --agent e2e` | exit 0, но `Falling back` (subagent → default) |
| обычный `--agent architect` / `--agent orchestrator` | работают (fallback/плагин) |

Debug-лог (`--print-logs --log-level DEBUG`): `stream modelID=big-pickle
agent=build` → OK; `stream modelID=big-pickle agent=architect mode=primary`
→ `AI_APICallError: OpenCode's free tier can only be used from within
OpenCode`. Один и тот же провайдер/модель, разный исход **по агенту**; смена
модели через `-m` не помогает. Вывод: вредоносны свойства запроса проектного
`architect` (ведущая гипотеза — `temperature: 0.2` и/или permissions-набор из
frontmatter), а не промпт/модель. **Гипотеза не подтверждена A/B** — Tester
не редактирует агентские файлы; проверка на копии агента без `temperature` —
задача для Coder.

Важно: `--pure` в этом окружении ещё и выключает плагин аутентификации —
факт зафиксирован, но контроли выше показали, что на default-агенте чистый
режим работает, т.к. 403 приходит именно от gateway для architect-запроса.

## Сырой stdio-пробник моста: PASS (конфиг/тул не сломаны)

`node %TEMP%\opencode\probe-handshake.mjs` (initialize → tools/list):

```json
{ "initialize": { "result": { "protocolVersion": "2025-06-18",
    "serverInfo": { "name": "orchestrator", "version": "0.1.0" } } },
  "tools": [ { "name": "execute_task", "required": ["task"],
    "props": ["task", "context", "timeoutMs"] } ],
  "toolsError": null, "--- stderr (0 bytes) ---" }
```

Тул зарегистрирован со схемой, stderr моста пуст. Плюс два реальных
`tools/call execute_task` от моделей (V7, V-RECURSION) дошли до спавна и
исполнения. **Вывод: ломается не конфиг моста и не поведение тула, а
разрешение агентов (затенение) + отсутствие guard-а уровня вложенности.**

## V-TOOL-SCHEMA — PASS

`git diff -- opencode.json` — единственный hunk:

```diff
+    "orchestrator": {
+      "type": "local",
+      "command": ["node", "tools/mcp-orchestrator/index.mjs"],
+      "cwd": ".", "enabled": true, "timeout": 15000
+    }
```

`node -e JSON.parse…` → `JSON OK`; ключи `mcp`: `postgres, playwright,
orchestrator`; `instructions` — без изменений (5 файлов); секция `permission`
в diff не входит.

## V5 — регресс сборки: PASS

```
cd server && npm run build  →  BUILD_EXIT=0  (tsc, без ошибок)
cd server && npm run check  →  CHECK_EXIT=0  (node --check dist/app.js)
```

## V6 — git status = ожидаемый набор: PASS

```
 M docs/reports/STATUS.md
 M opencode.json
?? .artifacts/verification/two-terminal-delegation.md   (наш отчёт — этот файл)
?? .opencode/agents/architect.md
?? .opencode/agents/orchestrator.md
?? docs/specs/agent-delegation.md
?? docs/superpowers/plans/2026-09-25-dictionaries-catalog.md   (старый untracked, не наш)
?? tools/mcp-orchestrator/.gitignore
?? tools/mcp-orchestrator/index.mjs
?? tools/mcp-orchestrator/package-lock.json
?? tools/mcp-orchestrator/package.json
?? tools/mcp-orchestrator/verification/2026-10-06-t2-bridge.md
?? tools/mcp-orchestrator/watch.ps1
?? манифест.md                                            (старый untracked, не наш)
```

Ничего не staged/закоммичено; `node_modules/` и `logs/` в статусе отсутствуют
(`git check-ignore -v` → `tools/mcp-orchestrator/.gitignore:2:logs/`,
`:1:node_modules/`). Временных пробников в дереве нет.

## CLEANUP — PASS

- `tools/mcp-orchestrator/.probe/` — удалён (содержимое зафиксировано в V7);
- `x.txt` в корне — удалён (создан вложенным раном V-RECURSION, 0 байт);
- процессы: остались только `opencode pid=19000` (хост текущей сессии) и 4
  `node`-MCP сервера сессии, стартовавшие вместе с ней; спавны моста
  `pid=1592/16640/12832/17568` и `opencode run`-дети завершены;
- `logs/orchestrator.log` — gitignored, в `git status` не появляется;
- серверы стека/E2E не запускались, БД не трогались.

## Рекомендации фикса (не выполнял — вне зоны Tester)

1. **Снять затенение** (fix для t3/t4): отключить `architect`/`orchestrator`
   из глобальных плагинов (`~/.config/opencode/opencode.jsonc`, `@nest4869/
   argos`) либо переименовать проектных агентов; принять решение по
   `opencode-antigravity-auth` (не отключать вслепую). Критерий приёмки:
   `opencode agent list`/`debug agent architect` в обычном режиме даёт
   `mode=primary` с русским проектным промптом, `run --agent architect` — без
   `Falling back`.
2. **Анти-рекурсия на уровне моста** (fix): env-guard `ORCH_NESTED=1`
   (и/или счётчик уровня) при spawn + отказ `{success:false, error:"рекурсия
   запрещена"}` на входе; не полагаться на `deny` в проектном `.md` — он
   доказано не применяется, пока агент затенён. Проверить deny уже в
   эффективном конфиге после пункта 1.
3. **Расследовать 403 `--pure --agent architect`** до того, как пункт 1 будет
   считаться закрытым: после снятия затенения архитектор станет основным
   бенефициаром `run --agent architect`, а его запрос сейчас детерминированно
   отбивает free-tier gateway (гипотеза: `temperature: 0.2` — A/B на копии).
4. **Таймаут ≠ отказ**: `-32001` (15 с) возвращает вызывающему ошибку, пока
   спавн уже произошёл — поднять `mcp.orchestrator.timeout` или ввести
   submit/poll, иначе отказы маскируют и успешные, и рекурсивные запуски.

## Сигнатуры запусков (свежие, 06.10.2026)

- V7: exit 0, 219 с, 26 строк событий → `%TEMP%\opencode\v7-architect-r2.json`;
  первая строка — fallback-warning.
- V-RECURSION: остановлен по 300-с таймауту оболочки, 40 строк →
  `%TEMP%\opencode\v-recursion-r2.json` (+2 события
  `orchestrator_execute_task`).
- `--pure`-матрица: `%TEMP%\opencode\v7-pure-architect.json`,
  `v7-pure-architect-r2.json`, `pure-default.json`, `t1..t7-*.json`,
  `t5-debug.log`, `t6-default-debug.log`.
- Логи моста: `tools/mcp-orchestrator/logs/orchestrator.log`
  (offset 233895 → 245119 → 261008).

---

# ФИКС (07.10.2026, Coder): повторная верификация — PASS

Все 4 рекомендации исходного отчёта выполнены, обе критические точки (V7,
V-RECURSION) перепроверены свежими прогонами 07.10.2026. Итог: **V7 PASS,
V-RECURSION PASS**.

## Что сделано по рекомендациям

| # | Рекомендация | Фикс |
|---|---|---|
| 1 | Снять затенение плагинами | Переименование проектных агентов: `.opencode/agents/nda-architect.md`, `.opencode/agents/nda-orchestrator.md` (префикс `nda-` снимает коллизию с плагинными `architect`/`orchestrator` из `@nest4869/argos`); оба — `mode: primary` (иначе `run --agent` даёт «Falling back»). Лаунчер `nda-architect.cmd` |
| 2 | Анти-рекурсия на уровне моста | Env-guard `ORCH_NESTED` в `tools/mcp-orchestrator/index.mjs`: spawn получает `ORCH_NESTED=<глубина+1>`, входной вызов `execute_task` при заданной переменной отклоняется (`success:false`, `error: «Рекурсия запрещена…»`), строка пишется в лог. Плюс сохранён слой 1 — `orchestrator_execute_task: deny` в `nda-orchestrator.md` |
| 3 | Расследовать 403 | Причина найдена: **не** `temperature`, а фактическое отсутствие тула `bash` в тулсете. A/B-матрица пробников: `bash: deny` / `bash: {"*": deny}` / `tools: {bash: false}` → детерминированный **403** free-tier gateway (`OpenCode's free tier can only be used from within OpenCode`); `bash: ask` / `allow` / deny прочих тулов → ok. Фикс: `bash: ask` у `nda-architect` (тул присутствует → 403 нет; headless — автоотказ, T1 — спрос пользователя; фактический запрет сохранён) |
| 4 | Таймаут ≠ отказ | `opencode.json` → `mcp.orchestrator.timeout: 15000 → 900000`. Вызовы больше не обрываются `-32001` при живом спавне |

Синхронизированы: `docs/specs/agent-delegation.md` (имена `nda-*`, таблица
permission, раздел «Почему bash: ask», env-guard, таймаут, residual-пункты) и
`docs/reports/STATUS.md` (открытый баг «анти-рекурсия подтверждена только
конфигом» → закрыт, «Следующий шаг» дополнен фиксом).

## V7 — PASS (свежий прогон, 07.10.2026)

```
opencode run --format json --agent nda-architect '<делегируй создание
tools/mcp-orchestrator/.probe/e2e.txt со строкой ARCH-OK; писать сам не можешь>'
```

- `EXIT=0`, `FALLBACK=0` («Falling back» — 0 вхождений), `ERR403=0`;
- `TOOL: orchestrator_execute_task` — вызов проектного архитектора
  (не default-агента);
- файл на диске: `FILE_OK size=8 hex=41 52 43 48 2d 4f 4b 0a` = `ARCH-OK\n`.

**Нюанс для будущих прогонов:** первый запуск V7 в этой сессии вложенный ран
**галлюцинировал** успех (0 `tool_use` в логе, файл не создан, `success=true`) —
авторство всегда проверять на диске/в логе, а не по `success`; повторный прогон
корректен (см. выше). Файл `.probe/` удалён после фиксации.

## V-RECURSION — PASS (два слоя, оба проверены)

**Слой 2 — env-guard моста (жёсткий, программный).** Пробник stdio с
`ORCH_NESTED=1` → вызов `execute_task` (task `ping`):

```json
{"result":{"content":[{"type":"text","text":"{… \"error\": \"Рекурсия запрещена:
вложенный вызов orchestrator_execute_task отклонён (ORCH_NESTED). Оркестратор не
может делегировать задачи самому себе…\", \"success\": false}"}],"isError":true},
"jsonrpc":"2.0","id":2}
```

- `isError:true`, stderr моста 0 байт, exit 0;
- в логе: `execute_task: отклонён рекурсивный вызов (ORCH_NESTED=1)`;
- ранее наблюдалось и наследование env реальным спавном: вложенный ран стартует
  мост с `ORCH_NESTED="2"` → любая попытка делегации на глубине ≥2 получает тот
  же отказ.

**Слой 1 — permission + промпт (оркестратор на верхнем уровне).** Прямые раны
`opencode run --agent nda-orchestrator` с приказом вызвать
`orchestrator_execute_task` (обычный и форсирующий промпт «Ты ОБЯЗАН вызвать
тул, не отвечай текстом»):

- 0 событий `tool_use` в обоих случаях, спавнов в логе моста нет, `x.txt` не
  создан, `EXIT=0`; модель отвечает отказом по правилам;
- контрольный пробник с `permission: orchestrator_execute_task: deny` +
  принуждением: модель сообщает, что тул недоступен в тулсете (0 попыток
  вызова) — `deny` убирает MCP-тул из доступных, не только пишет в `.md`.

Ранее наблюдавшийся CRITICAL (2 спавна при `*: allow` плагинного `orchestrator`)
устранён: эффективный агент теперь проектный `nda-orchestrator` с `deny`.

## Регресс и чистота (V5/V6/CLEANUP)

- `npm run build` → `BUILD_EXIT=0`, `npm run check` → `CHECK_EXIT=0`;
- `node --check tools/mcp-orchestrator/index.mjs` → `SYNTAX=0`;
- `git status --porcelain` — только ожидаемый набор:

```
AM .opencode/agents/nda-architect.md
AM .opencode/agents/nda-orchestrator.md
 M docs/reports/STATUS.md
 M opencode.json
?? .artifacts/
?? docs/specs/agent-delegation.md
?? docs/superpowers/plans/2026-09-25-dictionaries-catalog.md   (старый untracked, не наш)
?? nda-architect.cmd
?? tools/
?? манифест.md                                                  (старый untracked, не наш)
```

- времянок нет: `zz-probe-*.md` → **0**, `tools/mcp-orchestrator/.probe/` →
  удалён, `x.txt` отсутствует; ничего не staged/закоммичено.

## Открытые residual-пункты (не закрывались фиксом)

- отработка таймаута на реально длинной задаче и режим submit/poll — не
  проверены (декомпозицией);
- опциональный отказ от `--pure`-архитектуры не нужен: `nda-`-имена работают и
  в обычном режиме (с плагинами), `--pure` в этой сессии больше не требуется.


---

# ФИНАЛЬНАЯ СКВОЗНАЯ ВЕРИФИКАЦИЯ (07.10.2026, Tester, повторный полный прогон)

Роль: Tester — только проверка; код/конфиг не менялись, ничего не коммитилось.
Единственное изменение на диске — удаление тестового `.probe/` (разрешено
заданием). Все прогоны свежие, 07.10.2026 ~01:14–01:18Z.

## Итог: PASS по всем 8 пунктам

| # | Пункт | Вердикт |
|---|---|---|
| V2 | `opencode mcp list` — orchestrator подключён, соседи не сломаны | **PASS** |
| V4 | `opencode agent list` — оба проектных агента видны, ошибок конфига нет | **PASS** |
| V7 | сквозной nda-architect → мост → nda-orchestrator → `.probe/e2e.txt` = `ARCH-OK` | **PASS** |
| V-RECURSION | оркестратор не может вызвать сам себя (2 слоя) | **PASS** |
| V-TOOL-SCHEMA | минимальный валидный diff `opencode.json` | **PASS** |
| V5 | `npm run build` + `npm run check` | **PASS** |
| V6 | git status = только ожидаемый набор, времянок нет | **PASS** |
| CLEANUP | тестовые файлы удалены, лог gitignored, процессов-сирот нет | **PASS** |

## V2 — PASS

`opencode mcp list` (свежий):

`
✓ postgres connected      npx -y @modelcontextprotocol/server-postgres postgresql://…localhost:5432/MOSD
✓ playwright connected    npx -y @playwright/mcp --headless
✓ orchestrator connected  node tools/mcp-orchestrator/index.mjs
✓ context7 connected
✓ grep_app connected
✗ websearch failed        SSE error: Non-200 status code (403)   ← пре-существующая внешняя поломка mcp.exa.ai, к фиче отношения не имеет
6 server(s)
`

Три целевых сервера подключены. Правка `opencode.json` соседей не сломала.

## V4 — PASS

`opencode agent list` (свежий): **0 совпадений** `error|invalid|fallback`
(регистронезависимый поиск по выводу). Проектные агенты видны под
восстановленными после recovery именами:

`
nda-architect (primary)     permission: orchestrator_execute_task → allow, edit → deny, bash → ask
nda-orchestrator (primary)  permission: orchestrator_execute_task → deny,  task → deny
e2e (subagent)              + встроенные build/plan/title/compaction/summary/explore/general
`

`opencode debug agent nda-architect` → валидный JSON, `"mode": "primary"`
(фронтматтер парсится; `EXIT=-1` — артефакт обрыва пайпа `Select-Object
-First`, не ошибка конфигурации).

**Наблюдение (не дефект по фиксу):** простые имена `architect (subagent)` и
`orchestrator (primary)` по-прежнему существуют — это плагинные агенты из
`@nest4869/argos` (глобальный `~/.config/opencode/opencode.jsonc`). Именно
из-за их затенения recovery переименовал проектных агентов в `nda-*`.
Запуск `--agent architect` (без `nda-`) по-прежнему уйдёт в плагин/default —
рабочее имя фичи: `nda-architect` / `nda-orchestrator`.

## V7 — PASS (ГЛАВНОЕ; актёр — проектный nda-architect)

Команда (exit 0, stderr 0 байт, события в `%TEMP%\opencode\v7-final.json`):

`
opencode run --format json --agent nda-architect
  'Согласуй и сразу делегируй через orchestrator_execute_task задачу: создать
   файл …\tools\mcp-orchestrator\.probe\e2e.txt со строкой ARCH-OK и
   убедиться, что он создан. Ты не можешь писать файлы сам — обязан вызвать инструмент.'
`

**(а) Вызов MCP-тула доказан — ровно 1 событие level-1:**

`
FALLBACK_COUNT=0   ERR403=0
L3 {"type":"tool_use", "part":{"type":"tool","tool":"orchestrator_execute_task",
   "state":{"status":"completed", "input":{"task":"Создать файл …e2e.txt, содержащий ровно одну строку: ARCH-OK …"}}}}
`

`status=completed` (не error/-32001 — таймаут 900000 работает), актёр —
`nda-architect` (fallback 0, 403 0). Других `tool_use` у level-1 нет:
архитектор файл сам не писал (соответствует `bash: ask`/`edit: deny`).

**(б) Реальный write/bash во вложенном прогоне — лог моста (offset 340017 → 353531):**

`
01:14:48.991Z старт, ORCH_AGENT="nda-orchestrator", ORCH_NESTED="", таймаут=900000 мс
01:14:55.479Z === Задача #1: старт, агент nda-orchestrator ===
01:14:55.522Z spawn: opencode.exe "run" "--format" "json" "--agent" "nda-orchestrator" <572 симв.>
01:14:58.094Z (вложенный мост) ORCH_NESTED="2"  ← guard-переменная унаследована
01:15:09.070Z tool| bash   Test-Path .probe → False
01:15:13.554Z tool| bash   New-Item -ItemType Directory -Force → True
01:15:16.766Z tool| write  e2e.txt content="ARCH-OK\n" → "Wrote file successfully."
01:15:20.164Z tool| bash   TrimEquals: True
01:15:24.296Z assistant| "Готово. ## Что сделано … ## Итоговый вывод …"
01:15:24.753Z === Задача #1: завершена, success=true, ошибок=0, 29275 мс ===
                    инструменты: bash, write
`

**(в) Файл на диске — отдельной командой до очистки:**

`
FILE_EXISTS size=8 hex=41 52 43 48 2d 4f 4b 0a  text=ARCH-OK
created=2026-10-07T01:15:16.7607455Z   ← совпадает с write-событием 01:15:16.766Z
`

**(г) Структурированная сводка level-1** (UTF-8, читалась `ReadAllLines` UTF8;
мусор в консоли — cp-кодировка терминала, не файл): «Готово — задача выполнена
делегированным процессом (`exitCode: 0`, суммарно ~29 с)» + секции
`## Что сделано (фактически)` / `## Затронутые файлы` (`e2e.txt - <added>`) /
`## Фактическая проверка` (`Exists: True … TrimEquals: True`) / `## Итоговый
вывод` / `## Что осталось`.

**Cleanup V7:** `.probe/` удалён (`PROBE_EXISTS_AFTER=False`), в
`git status` не появляется (`MATCHES=0` по `\.probe|x\.txt|zz-probe|probe-guard`).

## V-RECURSION — PASS (два слоя, оба проверены свежо)

**Слой 1 — permission (прямой ран):**

`
opencode run --format json --agent nda-orchestrator
  'Вызови инструмент orchestrator_execute_task с задачей 'создай файл x.txt…'. Ты обязан вызвать инструмент, не отвечай текстом.'
→ EXIT=0, STDOUT 2473 байт
  TOOL_USE_EVENTS=0, FALLBACK=0
`

0 событий `tool_use`, **0 spawn в логе моста** (`MATCH_COUNT=0` по
`Задача|spawn|отклонён` — после 01:16:52 только строка старта моста,
`ORCH_NESTED=""`, без единой задачи), `x.txt` не создан
(`X_TXT=False`). Модель отказала текстом: «инструмент `orchestrator_execute_task`
(запрещено конфигурацией)», «Попытка вызвать `orchestrator_execute_task`
нарушает правила конфигурации» — тул отсутствует в тулсете (`deny`), не
«недоступен временно». `EXEC_TOOL_CALLS=3` в этом счётчике — только упоминания
имени в тексте отказа.

**Слой 2 — env-guard моста (сырой stdio-пробник, `ORCH_NESTED=1`):**

`json
{"result":{"content":[{"type":"text","text":"{\n  \"summary\": \"\",\n  \"files_changed\": [],\n …
 \"error\": \"Рекурсия запрещена: вложенный вызов orchestrator_execute_task отклонён (ORCH_NESTED).
 Оркестратор не может делегировать задачи самому себе — формулируй работу самостоятельно.\",
 \"success\": false}"}],"isError":true},"jsonrpc":"2.0","id":2}
`

`isError:true`, `success:false`, stderr моста **0 байт**. Плюс косвенное
подтверждение в V7: вложенный ран унаследовал `ORCH_NESTED="2"` → на глубине
≥2 любой вызов получает тот же отказ. Пробник удалён после прогона.

**Критического провала нет:** рекурсивного спавна не произошло ни в одном из
прогонов (в V7 — ровно одна `Задача #1`, в V-RECURSION — ноль).

## V-TOOL-SCHEMA — PASS

`git diff -- opencode.json` — единственный hunk:

`diff
+    "orchestrator": {
+      "type": "local",
+      "command": ["node", "tools/mcp-orchestrator/index.mjs"],
+      "cwd": ".",
+      "enabled": true,
+      "timeout": 900000
+    }
`

`node -e JSON.parse(require('./opencode.json'))` →
`JSON OK; mcp keys: postgres, playwright, orchestrator;
orchestrator: {"type":"local","command":["node","tools/mcp-orchestrator/index.mjs"],"cwd":".","enabled":true,"timeout":900000};
instructions: ["AGENTS.md","docs/reports/STATUS.md","docs/specs/architecture.md","instructions/safety.md","instructions/verification.md"]; permission keys: skill, bash`

Секции `instructions`/`permission` в diff не входят — не тронуты.

## V5 — регресс сборки: PASS

`
cd server; npm run build  → BUILD_EXIT=0   (> @digitalapps/server@0.1.0 build > tsc)
cd server; npm run check  → CHECK_EXIT=0   (> node --check dist/app.js)
`

## V6 — git status: PASS (с адаптацией имён после recovery)

`
AM .opencode/agents/nda-architect.md          ← recovery переименовал architect.md → nda-architect.md
AM .opencode/agents/nda-orchestrator.md       ← то же с orchestrator.md
 M docs/reports/STATUS.md
 M opencode.json
?? .artifacts/verification/2026-10-06-nda-agents-rename.md   (отчёт recovery-задачи)
?? .artifacts/verification/two-terminal-delegation.md         (этот отчёт)
?? docs/specs/agent-delegation.md
?? docs/superpowers/plans/2026-09-25-dictionaries-catalog.md  (СТАРЫЙ untracked 25.09 — не трогали)
?? nda-architect.cmd                                    (лаунчер фичи)
?? tools/mcp-orchestrator/.gitignore | index.mjs | package.json | package-lock.json | watch.ps1
?? tools/mcp-orchestrator/verification/2026-10-06-rename-timeout.md
?? tools/mcp-orchestrator/verification/2026-10-06-t2-bridge.md
?? манифест.md                                           (СТАРЫЙ untracked 28.09 — не трогали)
`

- Набор = ожидаемый; отличие от формулировки задания только в **именах**
  `architect.md`/`orchestrator.md` → `nda-*.md` (решение recovery) и в
  лаунчере/двух отчётах-артефактах — это артефакты фичи, не мусор.
- `node_modules/` и `logs/` в статусе отсутствуют;
  `git check-ignore -v tools/mcp-orchestrator/logs/orchestrator.log` →
  `tools/mcp-orchestrator/.gitignore:2:logs/` (`IGNORE_EXIT=0`).
- Старые untracked не тронуты; ничего не staged нового; **ничего не
  закоммичено** (`git log -3`: верхний `b90d1a2` — этап 22). В индексе
  (`git diff --cached`) — только 2 файла `nda-*.md` (add из recovery-работы,
  не коммит).

## CLEANUP — PASS

- `tools/mcp-orchestrator/.probe/` — удалён;
- `x.txt` — отсутствует (создавался в прогонах прошлых итераций, удалён);
- временный `%TEMP%\opencode\probe-guard.mjs` — удалён;
- процессы: только хост `opencode pid=19000` и 4 MCP-сервера текущей сессии
  (postgres×2, playwright×2); спавнов моста и `opencode run`-детей нет;
- `logs/orchestrator.log` gitignored (см. V6); БД/сервер стека не
  запускались и не менялись.

## Честно НЕ проверено (с причиной)

1. **Интерактивный режим T1/T2** (два реальных терминала, «спрос пользователя»
   на `bash: ask` архитектора) — проверялся headless-эквивалент цепочки
   `opencode run`; интерактивный HITL-сценарий не воспроизводился, т.к.
   требует оператора в терминале.
2. **Отработка таймаута на реально длинной задаче и режим submit/poll** — не
   проверялись (структурная задача моста, задокументирована в STATUS.md как
   residual); в этих прогонах задачи укладывались в 29 с при лимите 900000 мс.
3. **`websearch` MCP** — `✗ failed` (внешний 403 mcp.exa.ai), вне зоны
   фичи, пре-существующее.
4. **A/B гипотез по 403 free-tier** — гипотеза «отсутствие тула `bash`» уже
   подтверждена recovery-задачей и закрыта (`bash: ask`); повторный A/B в
   этом прогоне не выполнялся — не нужен (403 = 0 во всех запусках).