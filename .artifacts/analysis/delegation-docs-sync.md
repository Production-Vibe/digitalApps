# Синхронизация документации цикла делегирования (только docs, без кода/конфигов/агентов)

Дата: 07.10.2026. Задача: обновить `docs/reports/STATUS.md` и
`docs/specs/agent-delegation.md` по результатам цикла верификации
двухтерминальной схемы. Изменённых файлов ровно 2 (оба — документация).

## Источники фактов (sourceMapping)

| Факт | Источник (файл: §) |
|---|---|
| Имена `nda-*` — причина: конфликт с плагином `@nest4869/argos` (блоки `architect (subagent)` / `orchestrator (primary)` в `agent list`, 21 блок) | `tools/mcp-orchestrator/verification/2026-10-06-rename-timeout.md` §1 (+ `.artifacts/verification/2026-10-06-nda-agents-rename.md` header); task facts |
| `mcp.orchestrator.timeout` 15000 → **900000**; `15000` в конфиге нет (`line 26: "timeout": 900000`, `15000 NOT FOUND`); прежние 15000 отсекали длинные вызовы ошибкой **`-32001`** | `2026-10-06-rename-timeout.md` §2 (4/4 PASS); `-32001`-причина — task facts, следствие подтверждено отсутствием `-32001` в V7/V-LONG |
| Причина зависания **g2** — отсутствие жёстких внешних таймаутов у вложенных процессов; исправлено: PowerShell `Start-Process -PassThru → WaitForExit(ms) → Kill` / `ProcessStartInfo → WaitForExit(ms) → taskkill /T /F` + `bash timeout` во всех длинных вызовах | task facts; реализация в протоколах: `rename-timeout.md` (шапка: дефолт 60000, handshake 30000), `verify-v7-recursion.md` (шапка: сессия 300000, V-LONG-клиент 240000, прочее 60000; §2: V-RECURSION 120000) |
| Анти-рекурсия подтверждена **на уровне permission** прогоном V-RECURSION: 2 форс-попытки `run --agent nda-orchestrator` → `TOOL_USE_ANY=0`, 0 строк `=== Задача`/`spawn:`, ответов моста 0 («конфиг запрещает», а не «мост занят»); слой 2 (guard `ORCH_NESTED`) — guard-пробник `isError:true` | `verify-v7-recursion.md` §2 (чек 2 PASS, итог 7/7); guard-пробник — `.artifacts/verification/two-terminal-delegation.md` §V-RECURSION PASS |
| V-LONG: `callMs=211281`, `durationMs=211276`, `success=true`, `exitCode=0`, `timeoutMs=600000`, без `-32001`; клиент 211583 мс < 240000 (Kill не понадобился), stderr 0 | `verify-v7-recursion.md` §3 (чек 3 PASS) |
| Итоги: CQ1 **4/4 PASS**, verify-v7-recursion **7/7 PASS** (V7 `V7-OK`/spawn `nda-orchestrator`/0 fallback/0 ×403/0 ×`-32001`; V2 лог 381725→406647, stderr 0; V4 роли g3-fix 5/5: архитектор primary `edit/task deny`,`bash ask`,`oet allow`; оркестратор primary `oet/task/question deny`; сборка server → 0; `git status` 18 строк = baseline) | `rename-timeout.md` сводная матрица; `verify-v7-recursion.md` §1–§7 + сводная матрица |
| submit/poll — не реализован, остаётся открытым | task facts + `agent-delegation.md` §Известные ограничения (до правки) |
| Т2-мост (handshake `required=[task]`, stderr 0, живой вызов ~46 с, мьютекс «Оркестратор занят…», tee-лог, git-дерево 6 файлов) | `2026-10-06-t2-bridge.md` §1–§6 (все чеки PASS) |

**Корректировка при сверке:** утверждение «4 отказа мьютекса» (было в базовом
тексте обоих docs) протокол `t2-bridge.md` не подтверждает — в нём задокументирован
**один** параллельный отказ (§4, матрица `[mutex]`); текст заменён на
протокольную формулировку («параллельный вызов во время занятости отклонён,
первая задача дорабатывает»). Прочие цифры сверены построчно — расхождений нет.

## Что изменено

### `docs/reports/STATUS.md`

1. **«Открытые баги / TODO»:**
   - пункт «длинные задачи и submit-poll не проверены» разделён:
     `[x]` V-LONG проверен (цифры выше) + `[ ]` submit/poll остаётся открытым;
   - новый `[x]` «Зависание g2 устранено — жёсткие внешние таймауты
     вложенных процессов» (причина, PowerShell `WaitForExit`+`Kill`, `bash
     timeout`, лимиты 30000/60000/120000/240000/300000 мс);
   - `[x]` анти-рекурсия дополнен подтверждением прогоном V-RECURSION
     (permission-отказ, 2 форс-попытки, 0 `tool_use`, 0 спавнов).
2. **«Следующий шаг», п.0:** (1) явно назван плагин argos; (4) указана причина
   15000 → 900000 (`-32001`); V-RECURSION-фраза приведена к «оба слоя
   проверены»; добавлен блок «Финальная верификация цикла» с вердиктами
   CQ1 4/4 и 7/7, фактами V7/V-RECURSION/V-LONG/V2/V4, причиной g2 и
   внешними лимитами; отмечен остаток — submit/poll; «4 отказа мьютекса»
   заменены протокольной формулировкой.

### `docs/specs/agent-delegation.md`

1. Подзаголовок **«Почему агенты названы `nda-*` (конфликт с плагином argos)»**
   (ранее — абзац без заголовка; дополнен ссылкой на CQ1).
2. Новый раздел **«Жёсткие внешние таймауты — обязательное правило»**: причина
   (g2), PowerShell/bash-шаблоны, таблица лимитов протоколов
   (30000/60000/120000/240000/300000), связка с `mcp.orchestrator.timeout
   = 900000` (`-32001`) и `ORCH_TIMEOUT_MS`, требование ко всем длинным вызовам.
3. Ограничение №1: V-LONG вставлен как проверенный факт, submit/poll помечен
   «остаётся открытым».
4. «Проверка»: все три протокола с вердиктами (t2-bridge — все чеки PASS,
   CQ1 4/4, verify-v7-recursion 7/7 с разбивкой V7/V-RECURSION/V-LONG/V2/V4);
   residual сокращён до submit/poll (+ не воспроизводился kill собственного
   таймаута моста — V-LONG шёл 211 с при лимите 600000).
5. «См. также»: добавлены CQ1 и verify-v7-recursion.

## Acceptance Checks (прогоны)

| # | Чек | Результат | Доказательство |
|---|---|---|---|
| 1 | STATUS: выполнение + внешние таймауты; баги уточнены (анти-рекурсия = прогон, V-LONG = проверен, submit-poll = открыт) | **PASS** | `STATUS.md` L808–842 (V-LONG `[x]`, submit/poll `[ ]`, g2/внешние таймауты `[x]`, V-RECURSION `[x]`), L927–948 (итоги цикла) |
| 2 | agent-delegation: `nda-*`, `ORCH_AGENT`, timeout 900000, раздел о внешних таймаутах | **PASS** | `ORCH_AGENT` L127, `900000` L111/129/140/166/245…, раздел L219–257, argos-раздел L202–217 |
| 3 | grep обоих — нет устаревших `--agent architect` / `--agent orchestrator` | **PASS** | `Select-String -Pattern '--agent architect\b\|--agent orchestrator\b'` по обоим файлам → 0 совпадений; корректных `nda-*`-вызовов 9 |
| 4 | git diff — только 2 docs-файла | **PASS** | Дельта моей задачи: SHA256 изменились только у `docs/reports/STATUS.md` и `docs/specs/agent-delegation.md`; `.opencode/agents/nda-*.md`, `opencode.json`, `tools/mcp-orchestrator/index.mjs` — **побайтово идентичны** снапшоту до задачи; набор файлов в `git diff` (4 файла: 2 агента + STATUS + opencode.json — baseline цикла, существовал до моей задачи) и `git status -uall` (18 строк) не изменились. Т.е. из 4 строк tracked-diff моим правкам подвергся только `docs/reports/STATUS.md`, второй docs-файл (`docs/specs/agent-delegation.md`) — untracked и изменён мной |
| 5 | Цифры/вердикты сверены с протоколами | **PASS** | См. таблицу sourceMapping выше; единственный расхождение («4 отказа мьютекса») устранено в пользу протокольной формулировки |

## git diff (суть правок)

```
docs/reports/STATUS.md        | +102 строки (открытые баги, итоги цикла)
docs/specs/agent-delegation.md| untracked, правки: argos-раздел, «Внешние
                               таймауты», ограничение №1, «Проверка», «См. также»
```

Остальные 4 файла tracked-diff (`nda-architect.md`, `nda-orchestrator.md`,
`opencode.json`, baseline STATUS-вставки) — работа предыдущих задач цикла,
мной не менялись (побайтовая сверка SHA256 до/после).

## Побочные наблюдения (не мои изменения)

- `git status -uall`: 18 строк (до задачи) → 20 строк (после): `?? .artifacts/
  analysis/delegation-docs-sync.md` (мой evidence-файл) и `?? .probe/v7.txt`
  (создан **07.10.2026 10:06:09** параллельным процессом цикла — в мою задачу
  он попал уже после старта; мои записи — только 3 docs-файла с метками
  10:01–10:07; файл **не удалялся и не менялся** мной — это возможный
  незавершённый артефакт чужой верификации).
- Tracked `git diff` (набор из 4 файлов baseline) и `git status` записей
  агентов/конфига — без изменений относительно старта задачи.
