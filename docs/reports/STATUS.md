# STATUS.md — живое состояние проекта «ЦифровойНаряд»

> Единая всегда-актуальная сводка для быстрого входа в контекст нового диалога.
> Читать при старте каждого диалога (см. AGENTS.md → приоритет чтения).
> Обновлять по завершении каждого этапа (см. AGENTS.md → Definition of Done).

## Стек и ветки

- **`main`** — новый стек: Node/Express (TypeScript) + EJS + Prisma + PostgreSQL,
  JWT + bcrypt. Монолит без UI-фреймворков. Деплой — **Docker Desktop** (Windows,
  контекст `desktop-linux`, engine 29.7.2) + PM2 (в доводке).
  **Два контура БД (важно):** стендовый/комpose-контур — Docker-PG на
  host-порту **`5434:5432`** (в контейнере БД `digital_narad`, юзер `user`;
  внешние SQL-клиенты: `localhost:5434`); дев-контур (`npm run dev`,
  `server/.env`) — **локальный Windows-PostgreSQL** на `localhost:5432`/БД `MOSD`,
  `production_user` (на момент 14.09.2026 локальный PG
  фактически снова запущен; STATUS от 14.09 ранее утверждал «остановлен» — уже не
  так). Данные контуров различаются; E2E идёт против стендовой `digital_narad`.
- **`google-apps`** — легаси Google Apps Script (модули, GAS-скиллы, GAS-доки,
  E2E против `/exec`, манифест деплоя). В `main` не переносить без явного решения.
- Код-модули: `server/src/**`; схема БД (канон) — `server/prisma/schema.prisma`
  (13 моделей, 6 enum).

## Последний завершённый этап

- **21.10.2026 — Этап 35: compaction-агент настроен под handoff-бриф.**
  В `opencode.json` добавлен ключ `agents.compaction.system` — промпт встроенному
  скрытому агенту штатного компакшена: backbone — свежий бриф из
  `.opencode/handoff/` (перенос frontmatter `loop`/`iteration`/`approved_plan`/
  `session_config`/`next_action`), структура summary (in-flight и почему,
  `next_action`, ссылки путями без копий, блокеры, решения, скиллы), русский
  язык, редакция секретов, запрет деплоя и правок дерева. Программного
  компакшена в плагине по-прежнему нет (Этап 34) — промпт делает handoff-aware
  только штатный/ручной компакшен; приоритет по ADR-012 у handoff → restart.
  Правка лежала в рабочем дереве с 19.10.2026 без документации. **Проверки:**
  `opencode.json` парсится; `opencode debug config` резолвит текст в
  `agent.compaction.prompt`; `opencode agent list` — `compaction` есть,
  `read`/`bash` разрешены; `agents` — актуальный ключ схемы (`agent`
  deprecated), `system` входит в `Config.AgentEncoded`. Раздел «Штатный
  компакшен» синхронизирован в `docs/specs/agent-loop.md`. `server/**` не
  менялся — `npm run build`/`check` не требовались. **Коммит:** см. git log
  (тег не ставился).

- **21.10.2026 — Этап 34: handoff-threshold без программного компакшена.**
  Причина — ошибка `ConnectionRefused` от **устаревшего экземпляра плагина** в
  процессе сессии: файл `.opencode/plugin/handoff-threshold.ts` изменён
  10:20:57, процесс сессии 1 запущен 10:16:05, строки стека 320/336
  соответствуют версии плагина **без** гейта (старый код пытался программно
  дёрнуть `session.compact()` → HTTP-вызов к собственному opencode-серверу →
  `ConnectionRefused` и free-tier-срабатывание). **Правки (t1)** — только
  `.opencode/plugin/handoff-threshold.ts`: удалены `compactSession`,
  `decideCompact`, лимит попыток, поле `attempts`, v2-импорт и env-флаг
  авто-компакшена; остаются ровно два хука (transform + event), фазы
  armed/pending/spent, порог **0.48** и императивное напоминание; idle-ветка
  закрывает цикл (`spent`) **только при свежем брифе** (mtime > первой
  инъекции), без брифа напоминания продолжаются. Раздел «Плагин» в
  `docs/specs/agent-loop.md` синхронизирован (программного компакшена в спеке
  больше нет). **Проверки (t2):** `tsc --noEmit` (strict) **exit 0**; probe —
  **119 passed / 0 failed**
  (`.artifacts/verification/handoff-threshold-no-compact-final.md`).
  `server/**` не менялся. **Коммит/тег:** см. git log; тег
  `v0.34-handoff-no-compact`.

- **21.10.2026 — Этап 33: ужесточение resume-промпта против дефекта D1.**
  Дефект D1 (наблюдение живого smoke Этапа 32): модель в resume-режиме
  якорилась на файл `approved_plan`-брифа вместо поля `next_action` свежего
  брифа. Устранён формулировкой промптов драйвера
  (`.opencode/loop/ralph-loop.ps1`, `Build-ResumePrompt`/`Build-ColdPrompt`):
  `approved_plan` — только границы scope, единственный источник «что делать» —
  `next_action` самого свежего брифа, при противоречии порядок действий задаёт
  `next_action` (scope не расширяется). Раздел «Источник действия»
  синхронизирован в `docs/specs/agent-loop.md`. Код драйвера F1–F3 закоммичен
  ранее (`55863ad`, тег `v0.32-loop-driver-fixes`), спека — `56b2a95`.
  `server/**` не менялся. **Коммит/тег:** `4cb4a10` «fix: ужесточить
  resume-промпт против D1 — источник действия next_action (Этап 33)», тег
  **`v0.33-d1-resume-prompt`**
  (`.artifacts/verification/commit-d1-resume-prompt-verify.md`).

- **19.10.2026 — Этап 32: правки драйвера session-loop после живого smoke-теста
  handoff (F1+F2+F3) — вердикт PASS.** Живой smoke-тест механики handoff 19.10
  выявил дефекты: (а) Glob-тул opencode **не видит dot-папки** — свежая сессия
  по ложной посылке «handoff пуст» уходила в полный cold-опрос, а `question`
  недоступен в `--auto` → ход кончался без работы и без брифа; (б) после
  итерации без брифа драйвер читал «последний файл» каталога — старый чужой
  бриф → вместо stop exit 1 уходил на следующую итерацию и затирал
  `state.json` чужим планом; (в) логи итераций `iter-N.*` перезаписывались
  между прогонами. **Правки (t1) в одном файле `.opencode/loop/ralph-loop.ps1`
  (diff +18/−7):** F1 — `Build-ColdPrompt`/`Build-ResumePrompt` требуют
  проверять `.opencode/**` через Read/Bash (`Test-Path`/`Get-Content`/
  `Get-ChildItem`), а не Glob (строки 116, 130); F2 — имя последнего брифа
  запоминается до запуска, после принимается только новый/более поздний файл,
  иначе stop exit 1 **без** `Save-LoopState` (строки 247–251, 277–286);
  F3 — все лог-файлы итерации (`out`/`err`/`prompt`) со stamp-ом прогона
  (строки 141, 142, 243). Семантика кодов выхода, cold/resume, `-Dry` не
  менялись. **Верификация (t2):** общий **PASS** — парс `Parser::ParseFile`
  0 ошибок; статика F1/F2/F3 подтверждена цитатами строк + поведенчески
  (F1-текст в dry-промптах, stamp в именах созданных файлов); dry-прогон
  `-Dry -MaxIterations 3` → **exit 0** (continue→done), SHA256 `state.json`
  и список брифов до/после идентичны; гигиена — dry-песочница и dry-логи
  прогона удалены, `git status` — только 3 ожидаемых файла.
  Артефакт: `.artifacts/verification/ralph-loop-fixes-verify.md`.
  **`server/**` не менялся; коммит/тег — по согласию** (permissions commit=false;
  правки `ralph-loop.ps1` и два in-flight файла `handoff-threshold.ts`/
  `opencode.json` в рабочем дереве). **Остаток этапа закрыт тем же днём —
  живой smoke PASS 7/7** (`.artifacts/verification/ralph-loop-live-smoke.md`):
  реальный прогон драйвера `-MaxIterations 1` → ветка **RESUME, итерация 5**,
  exit **3** (лимит при continue, 421 с), свежая сессия `--auto` увидела
  `.opencode/handoff/` через Bash-листинг/Read (Glob первым вернул 0 —
  F1-фолбэк отработал), создала `marker.txt` (`smoke-ok`), записала новый
  бриф `iteration: 5` (15→16 прирост +1), `state.json` обновлён веткой
  принятия брифа; гигиена: тестовые брифы удалены, `state.json` восстановлен
  (SHA `4B5F05B8…`), логи прогона удалены, `git status` — ровно 4 файла.
  **Первый прогон smoke провалился (exit 4)** — дефекты входных данных D1–D3
  (сессия якорилась на `approved_plan`-бриф вместо свежего `next_action`,
  не листила handoff, упала в `dispatch_tasks {"todos":…}` и зависла до
  kill-on-hang) — закрыты правкой **только входов** прогона (приоритетный
  блок в бриф-фикстуре, пошаговый `-Task`, таймаут 15 мин); **код драйвера
  не менялся** (diff +18/−7 прежний). Наблюдение (не блокер): модель по
  привычке первым действием зовёт Glob на dot-путь — F1-инструкция в промпте
  каждый раз спасает Bash-листингом.

- **19.10.2026 — Этап 31: диагностика плагина session-bootstrap завершена —
  вердикт НЕ ДЕФЕКТ.** Симптом: в сессии 16.10 живое напоминание первого хода
  «не наблюдалось». Причина наблюдения: мутация transform-хука живёт только в
  снапшоте текущего шага и в БД/транскрипцию **не персистится** — суждение
  «вставки не было» по внешнему виду транскрипции невалидно; для
  драйвер-итерации 3 отсутствие блока преднастроек — ожидаемое поведение
  промпта Этапа 30 («пропустить шаг подтверждения, не задавать вопрос»).
  **Доказательства:** JSONL-лог 19.10 (`.artifacts/plugin-debug.log`) —
  `stage:module-load` → `plugin-init` → `enter(hasAssistant:false)` →
  `done(branch:with-config, injected:true)` → последующие
  `skip:skip-not-first-turn`; цитата модели iter-3 («инъецированное
  напоминание…», `.opencode/handoff/handoff-261016-120450.md`); гипотезы
  H2–H5 опровергнуты, H1/H6 — штатные объяснения
  (`.artifacts/plugin-debug-root-cause.md`). **Откат** debug-инструментации
  `[DEBUG-sbp]` из `.opencode/plugin/session-bootstrap.ts` (задача t1).
  `server/**` не менялся. **Коммит/тег:** см. git log (тег `v0.31-*`).

- **16.10.2026 — Этап 30: снятие блокера живого прогона цикла (неинтерактивное подтверждение session-bootstrap).** В `instructions/session-bootstrap.md` добавлено правило «неинтерактивное исполнение (драйвер) → шаг подтверждения пропускается, работа идёт сразу с `next_action`»; resume-/cold-промпт драйвера (`.opencode/loop/ralph-loop.ps1`) явно требует пропустить шаг подтверждения session-bootstrap и не задавать вопрос; синхронизированы `docs/specs/session-bootstrap.md` и `docs/specs/agent-loop.md`. **Проверки:** статика PASS 6/6 (`.artifacts/verification/driver-blocker-fix-static-check.md`); **реальный прогон драйвера — exit 0** (итерация 3 RESUME, свежая сессия записала бриф `loop: done`; маркер `.artifacts/loop-smoke/ok.txt`; лог `.opencode/loop/logs/iter-3.out.log`). Заодно закрыты два остатка Этапов 28–29: **первый реальный (не dry) прогон цикла** и **живое срабатывание порога плагина `handoff-threshold`** (напоминание «~64%» на первом ходе). `server/**` не менялся. **Коммит/тег:** `v0.30-driver-blocker`.

- **16.10.2026 — Закрытие остатка Этапа 27: инъекция `instructions/hygiene.md` в субагента доказана.**
  Утверждённая цель сессии — прямое доказательство, что субагент получает проектные инструкции. Машина — цикл session-loop (mode: driver), но живой прогон вскрыл блокер (см. ниже), поэтому проверка закрыта fallback-путём: две независимые пробы субагентов (tag general) перечислили свой системный контекст — по 8 файлов инструкций, включая `instructions/hygiene.md`; третья задача-верификация дала PASS. Артефакты: `.artifacts/verification/{subagent-instrlist-a.txt,subagent-instrlist-b.txt,hygiene-subagent-injection-verify.md}`. `server/**` не менялся.

- **16.10.2026 — Этап 29: преднастройки сессии (session-bootstrap) —
  контракт, плагин первого хода, спека.**
  Первый ответ сессии оркестратора теперь — настройки, а не импровизация:
  один `question`-запрос (схема **A+B+C**: режим/разрешения/контекст)
  фиксируется в `.opencode/session/config.json` (gitignored) до начала работы;
  resume-цикл наследует конфиг вместо повторного опроса (документация этапа;
  `server/**` не менялся). **Контракт:** новый
  `instructions/session-bootstrap.md` — обязательное правило первого хода
  (до ответов работа не стартует), канон JSON-схемы (дефолты: `mode:
  interactive`, `driver` 0.58/10/30, `autonomy: approve-once`, все
  `permissions: false`, `context.language: ru`, `agent: orchestrator`),
  запись конфига до работы (критерий — парсится как JSON), resume-ветка
  (конфиг есть + свежий handoff валиден → вопрос «подтвердить/изменить»),
  только orchestrator; подключён в `opencode.json → instructions`.
  **Wiring:** `.gitignore` — блок `.opencode/session/`; frontmatter брифа
  получил поле `session_config` (`instructions/session-loop.md`,
  `.opencode/commands/handoff.md` — пять ключей) + resume-бюллетень
  «преднастройки наследуются». **Плагин:**
  `.opencode/plugin/session-bootstrap.ts` — один хук
  `experimental.chat.messages.transform` (автодискавери), гейт orchestrator,
  детект первого хода (нет assistant-ответов), `stat` конфига на каждый вызов
  → ветка напоминания («покажи унаследованный конфиг…» / «выдай преднастройки
  через question tool»), идемпотентность по маркеру, аддитивность, ошибки
  гасятся, экспорт только default + чистые функции в `plugin.pure`.
  **Документация (этап):** спека `docs/specs/session-bootstrap.md` (правило
  первого ответа, таблица ключей A+B+C, запись/резюме-ветка, связь с циклом,
  плагин, границы контура, доказательства); `AGENTS.md` — пункт 0 ритуала
  старта читает `session_config`-путь брифа и `.opencode/session/config.json`,
  преднастройки в Control plane. **Проверки:** плагин — `tsc --noEmit`
  (strict) exit 0, probe **48/48**
  (`.artifacts/probe-session-bootstrap.log`), импорт opencode-движком доказан
  (`opencode debug info` — плагин в `plugins:`, 0 ERROR/WARN; top-level
  маркер), `opencode serve` 10 с без ошибок —
  `.artifacts/verification/session-bootstrap-verification.md`. **Остаток:**
  живое напоминание плагина на первом реальном ходе оркестратора.
  **Коммит/тег:** коммит Этапов 28+29 — после сдачи документации (на момент
  записи строки изменения ещё uncommitted).

- **16.10.2026 — Этап 28: цикл session-loop «исполнение → handoff → restart»
  (контракт, плагин, драйвер, спека + ADR-012).**
  Длинная работа переведена с lossy-компакшена одной сессии на цикл свежих
  сессий, нить — брифом на диске (документация этапа; `server/**` не менялся).
  **Контракт:** новый `instructions/session-loop.md` (триггер handoff;
  YAML-frontmatter `loop: continue|done|blocked`, `iteration`,
  `approved_plan`, `next_action`; resume-режим без повторного pre-approval;
  семантика остановки; контракт драйвера) подключён в
  `opencode.json → instructions`. **Плагин:**
  `.opencode/plugin/handoff-threshold.ts` — один хук
  `experimental.chat.messages.transform` (автодискавери opencode), только
  orchestrator: при доле контекста ≥ `ND_HANDOFF_THRESHOLD` (дефолт **0.58**)
  идемпотентное напоминание «Сделай handoff… и заверши ход» в конец последнего
  user-сообщения; источник — usage токенов модели (`limit.context` из
  `provider.list`), документированный фолбэк по объёму (÷4 символа/токен,
  знаменатель 200 000); чистые функции — в свойстве `plugin.pure` (иначе
  opencode трактовал бы именованные экспорты как отдельные плагины);
  аддитивно к argos, ошибки гасятся. **Драйвер:**
  `.opencode/loop/ralph-loop.ps1` (PowerShell 5.1, UTF-8 с BOM) + лаунчер
  `run-agent-loop.cmd` (ASCII): свежая сессия
  `opencode run --agent orchestrator --auto "<промпт>"` на итерацию (без
  `--continue`; `-p` в текущем CLI — это `--password`, промпт позиционный),
  жёсткий таймаут + kill-on-hang, чтение frontmatter свежего брифа +
  `.opencode/loop/state.json` (resume при согласованности, иначе cold),
  стоп по `done`/`blocked`/лимиту/таймауту/итерации без брифа, коды выхода
  0/1/2/3/4; `-Dry` — симуляция в песочнице `.opencode/loop/dry-run/`;
  runtime (`logs/`, `state.json`, `dry-run/`) в `.gitignore`, сам скрипт
  трекается. **Документация (этап):** спека `docs/specs/agent-loop.md`
  (триггер, frontmatter, resume, драйвер, плагин, guardrails, ручной
  end-to-end шаг), `docs/specs/adr/ADR-012-handoff-restart-over-lossy-compaction.md`
  (решение + альтернативы: компакшен, `--continue`, prose-заметки без
  контракта, только ручной перенос, диспатч argos — разведён), `AGENTS.md`
  (пункт 0 ритуала старта читает frontmatter брифа + `state.json`; цикл и
  `session-loop.md` в control plane). **Проверки:**
  плагин — `tsc --noEmit` (strict) exit 0, probe **58/58**, импорт модуля
  opencode-движком доказан (`opencode debug info` + top-level маркер),
  `opencode serve` 10 с без ошибок
  (`.artifacts/verification/handoff-threshold-verification.md`);
  драйвер — парс PowerShell 0 ошибок, dry continue→done **exit 0**, лимит
  exit 3 (через лаунчер тоже), `git check-ignore` 3/3, скан секретов 0,
  кириллица UTF-8 байтово
  (`.artifacts/verification/ralph-loop-dry-run.md`); более полный внешний
  прогон 16.10 (argv-стаб: форма запуска без `--continue`, промпт позиционным
  `message`; ветка таймаута/kill-on-hang → exit 4) —
  `.artifacts/verification/session-loop-driver-dry-run.md`. **Остаток:** первый
  реальный (не dry) прогон цикла и живое срабатывание порога плагина на
  настоящем usage — только по явному согласию пользователя. **Коммит/тег:**
  коммит этапа — после сдачи документации (на момент записи этой строки
  изменения ещё uncommitted).

- **15.10.2026 — Этап 27: гигиена рабочего дерева для argos-агентов + авто-чтение handoff.**
  Инструкции проекта доведены до всех argos-агентов, а ритуал старта дополнен
  подхватом «живой нити» сессии. **Файлы:** новый `instructions/hygiene.md` —
  6 правил чистоты рабочего дерева; **`opencode.json`** — `instructions/hygiene.md`
  добавлен в массив `instructions`, заодно убрана «висячая» запятая после блока
  `mcp`; **`AGENTS.md`** — указатель на `hygiene.md` (Do + Control plane) и
  пункт 0 в ритуал старта (авто-чтение свежего handoff из `.opencode/handoff/`
  со сверкой со `STATUS.md`/`git log`). **Почему так:** argos-промпты —
  встроенные в кэш плагина (`@nest4869/argos` v0.1.1), править нельзя;
  `argos.json` не поддерживает поля инструкций агентам; проектные
  `instructions` — единственная точка, покрывающая и orchestrator, и всех
  специалистов. **Проверки:** статика PASS
  (`.artifacts/verification/hygiene-instructions-static-check.md`); инъекция в
  свежем процессе PASS (`opencode run` вернул 6 файлов инструкций, включая
  `hygiene.md`); поведенческий тест PASS; правило handoff PASS 4/4
  (`.artifacts/verification/handoff-rule-check.md`). **Остаток закрыт
  16.10.2026:** инъекция `instructions/hygiene.md` в субагента доказана
  напрямую — две независимые read-only пробы субагентов увидели все 8 файлов
  инструкций, включая `hygiene.md` (артефакты
  `.artifacts/verification/{subagent-instrlist-a.txt,subagent-instrlist-b.txt,hygiene-subagent-injection-verify.md}`).
  **`server/**` не менялся.**
  **Коммит/тег:** `v0.28-argos-hygiene` (коммит — задача t2).

- **14.10.2026 — Этап 26: актуализация документации под argos.**
  После решения (14.10.2026) перейти на argos-оркестратор и удалить контур
  делегирования (`.opencode/agents/nda-planner.md`, `nda-executor.md`,
  `.opencode/queue.jsonl`, `tools/mcp-orchestrator/` — удалены из рабочего
  дерева; в `opencode.json` упоминаний не было) документация приводится в
  соответствие с кодом и новой оркестрацией (ADR-011). Батч параллельных задач:
  **t1** README (фактический состав: 15 моделей Prisma / 6 enum, роль admin,
  полные списки routes/lib/views/public/data/specs, уведомления/push/словари/КД,
  актуальный блок про `.opencode`), **t2** GLOSSARY (ПА, ОТК, станок,
  уведомления, push, Queue, сотрудник, домен оркестрации), **t3**
  `docs/specs/architecture.md` — визуальная схема (mermaid: потоки ролей + ER
  15 моделей), **t4** аудит «возможных дыр» →
  `docs/reports/2026-10-14-gap-audit.md`, **t5** — чистка документации от
  контура: `AGENTS.md` (убраны абзац «Двухконтурное делегирование» и bullet
  `nda-*`, добавлена строка про argos-оркестратор), deprecated-шапка в
  `docs/specs/agent-delegation.md` (файл сохранён как исторический контракт),
  Superseded-шапка в ADR-010, новый
  `docs/specs/adr/ADR-011-transition-to-argos-orchestrator.md`, пометки в этом
  STATUS (Этап 25 → superseded; «Следующий шаг» → argos), `.gitignore`
  (убрано упоминание `queue.jsonl`). **`server/**` не менялся** — только
  документация и `.opencode`. **Коммит:** см. `git log`.

- **13.10.2026 — Этап 25: durable-память T1 + контракт приёмки брифа (ADR-010).**
  **Пометка (14.10.2026): Superseded** — контур `nda-planner`/`nda-executor`,
  `.opencode/queue.jsonl` и `tools/mcp-orchestrator/` удалены из репозитория;
  ADR-010 помечен Superseded, контракт `agent-delegation.md` — deprecated;
  актуальная оркестрация — argos (ADR-011). История этапа сохранена ниже как
  есть.
  Усилен существующий контур делегирования (`nda-planner` T1 → файловая очередь
  → `nda-executor` T2): архитектура больше не живёт только в длинном чате T1, а
  бриф стал проверяемым. **Новый ADR-010**
  (`docs/specs/adr/ADR-010-delegation-writer-separation.md`) — инвариант «T1 не
  правит проект» (`edit` только `.opencode/**`; запись в проект — только T2),
  живой дизайн-документ `.opencode/design/<slug>.md` (слои: застыло → specs/ADR;
  в работе; открытые вопросы), промоушен через делегированную задачу.
  **`docs/specs/agent-delegation.md`** — статус `rejected` в очереди
  (`pending→claimed→in_progress→done|failed|rejected`), чеклист брифа (одна цель,
  ≥1 acceptance-команда, ≤1 модуль, оценка размера, проверяемый критерий),
  разведение `failed` (чинит T2) и `rejected` (чинит T1), повтор того же `taskId`,
  раздел «Дизайн-документ T1 и ре-сид» (чекпоинт по детерминированному прокси),
  разграничение с `/handoff` (транспорт наружу, в T1→T2 не используется).
  **`nda-planner.md`** — метод (`grilling`/`domain-modeling`/`codebase-design`),
  ведение design-дока, чекпоинт, статус-взгляд, промоушен; **`nda-executor.md`**
  — пред-проверка чеклиста → `rejected` без правок проекта, различение
  `failed`/`rejected`. **`AGENTS.md`** — двухконтурный контур в control plane;
  **корневой `.gitignore`** — добавлены `.opencode/design/`, `.opencode/tasks/`,
  `.opencode/logs/`, `.opencode/handoff/` (runtime; `queue.jsonl` остаётся
  трекаемым; `.opencode/.gitignore` — машинно-локальный, git его не трекает, поэтому
  ignore вынесен в корень). **Проверки:** `opencode agent list` — оба
  агента `nda-*` primary, права как задумано (планировщик: `edit` только
  `.opencode/**`, `*` deny, `bash` ask; исполнитель: `edit` allow, `task`/
  `question`/оркестрационные тулзы deny); `npm run build` + `npm run check` PASS
  (правок в `server/**` нет). **Осталось (опц.):** живой двухоконный смоук
  (создание design-дока, `rejected` плохого брифа → правка → `done`, промоушен) —
  агенты суть промпты, проверяется прогоном T1/T2 вручную. **Коммит:** по согласию.

- **09.10.2026 — Этап 24: команда `/handoff` (порт upstream-скилла).**
  Легаси-требование «переносимый бриф сессии» закрыто как ручная команда — в
  OpenCode нет user-invoked-only скиллов, поэтому точка входа в
  `.opencode/commands/`. **`/handoff`** пишет бриф в
  `.opencode/handoff/handoff-<yyMMdd-HHmmss>.md` (в репо, gitignore), переносит
  «живую нить» + секцию «Рекомендуемые скиллы», ссылается на спеки/ADR/
  `STATUS.md`/коммиты по пути (не копирует), вырезает секреты, аргумент —
  `$ARGUMENTS` («для чего следующая сессия»). **Файлы:** новый
  `.opencode/commands/handoff.md`; `.opencode/.gitignore` (+`handoff/`);
  `docs/specs/skills-layout.md` (`handoff` убран из «Не перенесено», добавлен в
  таблицу команд, «Навигатор», diff-log — статус `divergent`: скилл → команда,
  `%TEMP%` → repo); `docs/specs/agent-delegation.md` (разграничение файлового
  handoff T1→T2 и команды `/handoff`); `AGENTS.md` (строка в таблице фаз + список
  команд). **Проверки:** `opencode debug config` — команда `handoff` видна;
  acceptance-прогон — бриф `.opencode/handoff/handoff-261009-165212.md` создан,
  `git check-ignore` подтверждает `handoff/` в `.opencode/.gitignore`;
  `npm run build` + `npm run check` PASS. **Коммит:** по согласию.

- **09.10.2026 — Этап 23: re-sync 6 mattpocock-скиллов + политика синхронизации + навигатор.**
  Read-only сверка с upstream показала, что набор уже был почти в синхроне; правок
  потребовалось две. **`.opencode/skills/grilling/SKILL.md`** — вернули строку
  upstream «Word each question so "yes" accepts your recommended answer.»
  **`.opencode/skills/diagnosing-bugs/SKILL.md`** — Phase 5 шаг 2: вернули «…`diff`
  against a pristine copy to prove the mutation landed…». Upstream зафиксирован:
  `github.com/mattpocock/skills` @ `b0618bc436ad893b3c5e84e55fba86586d34a404`
  (`main`, линия CHANGELOG `1.3.x`). **`docs/specs/skills-layout.md`** дополнена
  двумя разделами: «Навигатор: как выбирать» (карта поверх **наших 11** скиллов;
  upstream `ask-matt` не портирован — маршрутизирует по ~20 отсутствующим скиллам;
  его роль выполняют навигатор + таблица фаз в `AGENTS.md` + команды) и
  «Синхронизация с upstream» (источник/SHA, diff-log 6 навыков × файл со статусами
  identical/adapted/divergent, playbook). Запись про `ask-matt` в «Что не
  перенесено» уточнена (убрана из issue-tracker-списка, вынесена отдельным
  пунктом). **Проверки:** построчный `git diff --no-index` по 6 навыкам — целевые
  дельты закрыты, остались только проектные адаптации; `codebase-design/DEEPENING.md`
  и `DESIGN-IT-TWICE.md` — байт-в-байт identical; `opencode debug skill` — 11
  проектных скиллов (старых нет); `opencode debug config` — команды
  `grill-with-docs`/`code-review`, MCP `postgres`/`playwright` `enabled`;
  grep `docs/adr/`, `CLAUDE.md`, `pnpm`, `.template.sh` — чисто (`CONTEXT.md`-хиты
  ложные: это `.opencode/tasks/<id>/context.md`); `npm run build` + `npm run check`
  PASS; `git diff --stat` = 3 файла (+83 / −2). **Коммит:** `6577a50`
  `docs: re-sync скиллов mattpocock + политика синхронизации (Этап 23)`,
  тег `v0.23-skills-resync`.

- **08.10.2026 — Фикс отображения роли admin в администрировании сотрудников.**
  В таблице сотрудников `/admin` учётная запись `admin` показывала роль
  «Оператор»: `roleOptions()` в `server/src/views/admin.ejs` строила опции
  select только из `['operator','shift','otk','master']` без `admin` → для
  строки админа ни одна опция не получала `selected` → браузер показывал
  первую. Это display-only баг: в БД/API роль `admin` корректна (проверено SQL
  по `Employees`), select у админа `disabled` и в `applyChanges` не читается.
  **Фикс:** если текущая роль отсутствует в базовом списке, она добавляется в
  опции с лейблом из `ROLE_LABELS` и помечается `selected`; DOM-структура не
  менялась (`data-role-select` сохранён). **Деплой:** пересборка
  `docker compose up -d --build app`, `/health` 200 ok. **Проверки:**
  `npm run build` + `npm run check` PASS; E2E `test_admin.py` 5/5 PASS;
  UI-проба (вход admin → все `[data-role-select]`): admin → «Администратор»
  (disabled), остальные 4 роли + `def` — без изменений, консоль 0 ошибок.
  Коммит: `fix: …`.

- **05.10.2026 — Этап 22: набор скиллов opencode перестроен под проект.**
  Скиллы перестали быть складом мета-мусора и стали рабочим инструментом под
  этот репозиторий. **Удалены** `brainstorming` (требовал запуска собственного
  веб-сервера через `.sh`), `writing-plans` и `systematic-debugging` (в нём были
  мета-тесты `test-academic.md`, `test-pressure-1..3.md` — артефакты чужой
  разработки, а не инструкции) — 23 файла. **Добавлены и адаптированы под
  OpenCode** (`diagnosing-bugs`, `domain-modeling`, `codebase-design`,
  `writing-for-agents`, `code-review`, `grilling`) — 13 файлов. Итог: **11
  скиллов** в `.opencode/skills/`. Ключевые адаптации: OpenCode не знает
  `disable-model-invocation` (ручные точки входа вынесены в
  `.opencode/commands/`), ADR лежат в `docs/specs/adr/` (не `docs/adr/`),
  проект — npm (не pnpm), Windows/PowerShell 5.1 (вместо bash) — добавлен
  `scripts/hitl-loop.template.ps1`, все примеры переведены на русский домен.
  Issue-tracker-зависимые навыки **не переносились** осознанно: трекера в
  проекте нет, состояние живёт в этом файле. **`codebase-design`** прямо
  сообщает, что unit-раннера нет (`server/package.json` = `build` + `check`),
  поэтому seam проверяется через E2E/API — выдумывать несуществующую
  тест-инфраструктуру нечего. **Новые артефакты:** `GLOSSARY.md` (домен:
  наряд, запуск, техпереход, смена, ОТК, ПА, КД — источники
  `naryad-status.ts` и `schema.prisma`), `docs/specs/skills-layout.md`
  (состав набора + обоснование исключений). Синхронизированы `AGENTS.md`
  (таблица «Скиллы — обязательный триггер по фазе») и
  `instructions/verification.md`. **Проверки:** `opencode debug skill` — 11
  проектных скиллов, старых нет (3 глобальных `agent-browser`,
  `customize-opencode`, `simplify` — не наши); `opencode debug config` —
  обе команды (`grill-with-docs`, `code-review`) резолвятся с
  `agent: build`, оба MCP (`postgres`, `playwright`) `enabled: true`; grep по
  мёртвым ссылкам (`superpowers`, `docs/adr/`, `CLAUDE.md`, `Skill tool`,
  `.scratch/`, `pnpm`) — чисто; `npm run build` + `npm run check` в
  `server/` — PASS. Коммит `7dee273`.

- **02.10.2026 — Этап 21: удобное удаление группы номенклатуры + каскад КД.**
  Удаление «последней группы» больше не залипает: группа удаляется одним
  действием целиком. Причина бага: одиночное `DELETE /:code` сносило только
  строку-контейнер, дети оставались → группа превращалась в **виртуальную** и
  визуально «не удалялась»; а группы с документами блокировались 409 из-за
  `ProductDocLink` (у группы `22` — 162 связи), отвязки в UI не было.
  **Сервер** (`catalog.routes.ts`): новый `DELETE /prefix/:prefix` — bulk-удаление
  группы по префиксу кода (`code === prefix` ИЛИ `startsWith(prefix + '/')` ИЛИ
  `prefix + '.'`), 400 без префикса, 204 при пустом, 409 (`Группа используется` +
  `refs` + `count`) по боевым ссылкам
  `Launches/WorkOrders/PrintQueue/Queue`; `DELETE /:code` — `P2025 → 204`
  (идемпотентность) и информативный 409 (`Код используется (запуски: N, …)`).
  Оба удаления **каскадно снимают `ProductDocLink`** в одной транзакции (связи
  документов — не боевые данные); `ProductDoc` (файлы) не удаляются.
  **Клиент** (`catalog-manager.js`): у контейнера (в дереве и в плоском поиске)
  кнопка «Удалить всю группу» (`data-action="delete-group"` → `removeGroup`),
  у виртуальных узлов правка скрыта, кнопка «Удалить» — только лист; убрано
  оптимистичное DOM-удаление (полная перерисовка через `onChanged`/`refresh` +
  `loadDocCounts`), 404/204 трактуются как идемпотентный успех, поиск определяет
  контейнеры через `findNode`. **Тест**
  (`tests/e2e/test_catalog_crud.py`): ассерт 409 переведён на `startswith("Код
  используется")` + `refs.launches >= 1`. **Деплой:** пересборка
  (`docker compose up -d --build app`, дважды — JS отдаётся из `dist/public`),
  `/health` ok. **Проверки:** `npm run build` + `npm run check` PASS;
  `test_catalog_crud.py` **15/15**, `test_dict_catalog.py` **34/34**,
  `test_master.py` **12/12**, `test_admin.py` **5/5**; UI-репро в браузере
  (`master/121212`, путь **дерева**): создан временный `ZZTST` + `ZZTST/1` с
  doc-link → кнопка «Удалить всю группу» → confirm → тост `Группа удалена (2)` →
  узел исчез из дерева, `JS-ошибок 0`; SQL после: `Catalog/links ZZTST = 0`,
  `ProductDocLink = 1293` (не изменился), группа `22` во время репро не тронута.
  **Дополнительно (по решению пользователя): группа `22` удалена полностью**
  через новый `DELETE /prefix/22` — **142** позиции и **162** связи-КД (боевых
  ссылок не было); стенд: `Catalog` 2203 → **2061**, `ProductDocLink` 1293 →
  **1131**, `ProductDoc` 895 (файлы не удалялись), топ-уровней стало **21**.
  **Тест** `test_dict_catalog.py` приведён в устойчивый к состоянию вид: тест 1
  проверяет `next-code корня = max(top)+1` (вместо жёсткого `> 22`), cleanup
  всегда удаляет созданный корень (убран пропуск `!= "22"` — именно он и порождал
  пустую строку `22`); тесты материализации (8.2–8.4) корректно пропускаются без
  top-22. Повторный регресс: `dict_catalog` **34/34**, `catalog_crud` **15/15**.

- **01.10.2026 — Этап 20: единый демо-пароль `121212` на обоих контурах, E2E разблокирован.**
  Пароли приведены к одному демо-значению по решению пользователя (режим — демо,
  всё тестовое), снят блокер E2E. **Скрипт** `server/scripts/set-passwords.ts`
  (`npm run passwords -- <пароль>`): минимум длины **8 → 6** (раньше скрипт был
  строже приложения — `/api/register` и `/api/admin/employees` требуют ≥6, и
  `121212` из 6 символов просто не проходил бы), хардкод-список из 5 логинов
  заменён на обход **всех** строк `Employees` (`findMany` + `orderBy login`) —
  теперь покрываются и зарегистрированные через UI операторы, и любые будущие
  учётки; в вывод добавлен эффективный контур `host:port/db` без пароля
  (страховка от прогона не по тому контуру) и счётчик обновлённых аккаунтов;
  пустой результат `findMany` → ошибка без изменения паролей. **Прогон:** MOSD
  (**localhost:5432**) — 5/5 (`admin`, `master`, `operator`, `otk`, `shift`);
  стенд `digital_narad` (**localhost:5434**) — **6/6**, включая несидового
  оператора **`def` (Ефимов Д. В.)**, созданного саморегистрацией; решено
  оставить его как обычного демо-оператора. **Синхронизация исходников**
  (чтобы при следующем деплое/сиде не разъехалось): `prisma/data/
  employees.json` 5× `"123"` → `"121212"` (сид всё равно задаёт пароль только
  при create — на существующих не влияет), `tests/e2e/.secrets/e2e-env.ps1`
  5× `ND_PASSWORD_*` → `121212`, `tests/e2e/config.py` 5× fallback `"123"` →
  `"121212"`. **Тест-сентинел:** `test_auth_flow.py` проверял отказ именно на
  «старом пароле `123`» — после смены это просто неверный пароль, поэтому
  проверка переписана на `wrong-pass-000` с формулировкой «неверный пароль →
  401» (смысл сохранён, докстринг обновлён). **Документация:** `server/docs/
  onboarding.md`, `docs/testing/e2e-runbook.md` (блок про fallback `_cred`),
  `instructions/safety.md`, ADR-008 (заодно снята устаревшая формулировка
  «seed сбрасывает seed-пароли при каждом старте» — это исправлено в Этапе 15);
  **исторические датированные отчёты `docs/reports/2026-09-*.md` не трогали** —
  они описывают прошлые прогоны как есть. **Рестарт контейнера**
  (`docker compose restart app`, ребилд не нужен — менялись только скрипты и
  документы) — снял in-memory блокировки входа, набитые неудачными пробами
  пароля (`login-throttle.ts`: 5 неудач → блок 15 мин, состояние в памяти).
  **Проверки:** HTTP-логин **6/6** на стенде — `121212` → 200 + токен, `123` →
  401; независимая bcrypt-сверка хешей в БД — **стенд 6/6** и **MOSD 5/5**
  (`compare('121212')=true`, `compare('123')=false`) через временный tsx-пробник,
  удалён после прогона; `npm run build` + `npm run check` PASS; `git diff
  --check` чист. **E2E разблокирован — полный набор 9 файлов PASS:**
  ролевые **31** (operator 6, otk 4, admin 5, shift 4, master 12),
  `test_catalog_crud.py` **15/15**, `test_dict_catalog.py` **34/34**,
  `test_auth_flow.py` **33/33**, `test_bizcycle.py` **51/51** — итого **164
  PASS, 0 FAIL**. Стенд после прогонов чист: Catalog **2208** (живые данные не
  тронуты), ProductDoc **895**, ProductDocLink **1293**, DictionaryValue 167,
  Equipment 8, Employees **6** (тестовые операторы удалены харнессом), Launches
  **1** (`ЗП-260918-051641`, живой), WorkOrders **1** (`Н-260918-053525`,
  `in_progress`, живой), Shifts **4** (все `closed`), Transitions/ClosedOrders
  0, PrintQueue 1; сиротских `docLinks` **0**, тестовых `TST`/`ZZ-TST`
  остатков **0**.

- **01.10.2026 — Этап 19: справочник документов изделия (КД) в БД и UI.**
  Документы из `манифест.md` (708 изделий / 1157 документов) залиты в БД и
  показываются в дереве номенклатуры: счётчик «КД: N» на узле + кнопка 📄,
  панель документов по типам. **Решения пользователя:** импорт **только
  скриптом** (массой, единичные случаи — потом вручную через UI); пути
  `P:\Элемент\…` и `\\FS1\Production\…` — **сетевые**, хранятся как метаданные
  (наличие файлов не проверяется); 48 позиций, отсутствующих в каталоге, **не
  дописываются** (в игнор). **БД (14-я и 15-я модели):** `ProductDoc`
  (`type/file/path/status`, уникален по `(type, file, path)`) + `ProductDocLink`
  (`docId`+`partCode`, составной PK) — связь many-to-many, т.к. `Catalog.
  designation` **не уникален**: миграция `20261001061410_add_product_docs`
  (FK `ON DELETE RESTRICT`), в `Catalog` добавлена обратная связь `docLinks`.
  **Импорт** — `server/scripts/import-product-docs.ts` (`npm run docs:import`,
  флаг `--dry`, `--file=<путь>`); парсер INI-подобного манифеста, строгое
  совпадение `Обозначение` (без нормализации), отчёт по типам/пропускам.
  Идемпотентен: `upsert` по `(type, file, path)` + `createMany skipDuplicates`.
  **Сверка с манифестом (708/1157):** 606 позиций / 969 документов к импорту
  (970 − 1 документ без `Тип` у `МТ 03.01.013.00.003`); 101 позиция не найдена
  (53 «нормализованных» `УБРСП 80 …` + 48 отсутствующих); 1 без обозначения.
  Из них 91 позиция — деталь в нескольких сборках. **Факт в БД стенда:**
  `ProductDoc`=**895** (74 файла дедуплицированы — общий КД у нескольких
  изделий; типы 591 чертеж / 115 МК / 101 КН / 88 эскиз),
  `ProductDocLink`=**1293**, позиций с документами **785**. Повторный прогон:
  0 новых документов, 0 новых связей. **Важно про два архива:** один и тот же
  чертёж лежит и в `P:\Элемент\КД\…`, и в `\\FS1\Production\Элемент\КД\…` —
  это **разные** строки (путь часть уникальности), привязки разные
  (напр. `Патрубок НКТН - МТ 04.01(1).jpg`: P:\ → 42 позиции, FS1 → 16).
  **Сервер:** `routes/product-docs.routes.ts` — `GET /?partCode=` (документы
  позиции, сгруппированы по типу в порядке Чертёж КД → МК → КН → Эскиз, для
  каждого документа — **все** его позиции) и `GET /counts` (счётчики по кодам
  для дерева); `requireAuth('master','shift')`, admin — superuser; подключён в
  `app.ts` (`/api/product-docs`). **Каскады в `catalog.routes.ts`:** смена кода
  (admin) переносит `docLinks` (`moved.docLinks`), удаление позиции с
  документами → 409 `refs.docLinks` (иначе был бы 400 по FK).
  **Клиент:** `catalog-manager.js` — счётчик `КД: N` (`.tree-docs`) на узлах
  дерева и в новой колонке «КД» плоского поиска, кнопка 📄 в `.tree-actions`,
  модалка `#cmDocsModal` (файл + полный путь + «Также у: …» для общих
  документов); стили `.tree-docs`/`.cm-doc-*` в `styles.css`. Счётчики
  грузятся лениво (`/counts`) и не блокируют отрисовку дерева.
  **Деплой** `docker compose up -d --build`, `/health` ok, миграция на стенде
  применена. **Проверки:** `npm run build` + `npm run check` PASS;
  API-проба **12/12 PASS** (удаление позиции с документами 409 + `docLinks>0`,
  смена кода admin 200 + `moved.docLinks` + связь переехала, удаление без связей
  200 и позиция исчезла, `counts` без токена 401, для shift 200, без `partCode`
  400); UI-проба браузером на `/master` (вход через refresh-куку): 2208 кнопок
  КД, **785** счётчиков (совпадает с БД), панель по `15.2/1` — 3 группы
  (Чертёж КД/МК/Эскиз) точно как в манифесте, по `4.11.5/1` — 4 чертежа с
  «Также у: …» (42 позиции), поиск `МТ 04.01.001-52` → 16 строк с «КД: 4»,
  **JS-ошибок 0, упавших запросов 0**. Стенд чист: Catalog **2208** (живые
  данные не тронуты), сиротских связей 0, тестовых остатков 0.

- **28.09.2026 — Этап 18c: «Не задано» для всех пустых/нулевых полей модалки каталога.**
  Пустое значение больше не выглядит как «ничего»: любое пустое или равное 0
  поле (text/number, кроме «Код») в модалке создания/правки позиции показывает
  серую заглушку «Не задано». **`catalog-manager.js`:** `fieldHtml` — всем
  text/number input'ам (кроме `code`: у admin обязательный ручной ввод, у master
  скрыт/автогенерируется) добавлен `placeholder="Не задано"`; `openEdit` —
  number-поле со значением `0`/пустым устанавливается в `''`, чтобы вместо
  светящегося «0» показывался placeholder (при сохранении `collectForm` читает
  `parseFloat('') || 0` → данные не теряются). **`styles.css`:** `.modal
  .form-group input::placeholder { color: var(--muted); opacity: 1 }` — серый
  placeholder (для Firefox). **Деплой** `docker compose up -d --build`,
  `/health` ok. **Проверки:** `npm run build` + `npm run check` PASS; E2E
  `test_dict_catalog.py` **34/34**, `test_catalog_crud.py` **15/15**; UI-probe
  (master): создание — все пустые text/number поля серые «Не задано», dict-
  select'ы тоже; правка `1.1.1` — заполненные поля тёмные, пустые (wallThickness,
  blankWeight) «Не задано»; **правка `13.14.6` (`parentQty=0`)** — ноль НЕ
  светится, показывается «Не задано», сохранение без изменений → в БД снова `0`;
  JS-ошибок 0. Стенд чист: Catalog 2208, DictionaryValue 167, TST=0.

- **28.09.2026 — Этап 18b: серая заглушка «Не задано» для пустых словарей каталога.**
  Пустое значение в 5 dict-select'ах модалки каталога больше не выглядит как
  «—» (символ в списках). **`catalog-manager.js`:** первая опция select —
  `<option value="">Не задано</option>` (остаётся выбираемой пустой строкой, в
  `DictionaryValue` не добавляется); к select'у добавлен класс `cm-dict-select`
  и `required` (только ради `:invalid` — модалка не в `<form>`, поле остаётся
  опциональным). **`styles.css`:** `.cm-dict-select:invalid { color: var(--muted)
  }` — закрытое поле с пустым значением серое «Не задано»; `option[value=""]` —
  серое в раскрытом списке; реальные значения — `--text`. **Деплой**
  `docker compose up -d --build`, `/health` ok. **Проверки:** `npm run build` +
  `npm run check` PASS; E2E `test_dict_catalog.py` **34/34**, `test_catalog_crud.py`
  **15/15**; UI-probe (master): создание — все 5 полей серые «Не задано», выбор
  «высокий» → `--text` + `valid`, правка `1.1.1` — заполненные
  Круг/Сталь/40Х/90 тёмные, пустой priority серый «Не задано», JS-ошибок 0.
  Стенд чист: Catalog 2208, DictionaryValue 167, TST=0.

- **28.09.2026 — Этап 18: пикер родителя в модалке каталога (дерево + поиск).**
  Назначать местонахождение новой позиции стало удобно: плоский `<select>`
  (~2208 опций) в модалке `catalog-manager.js` заменён компактным
  сворачиваемым деревом. **`catalog-manager.js`:** структура «Родитель» теперь
  строка значения (`#cmParentValue`), кнопка «Выбрать» (`#cmParentPick`) и
  скрытый `#cmParent`; пикер `#cmParentPicker` — поиск (`#cmParentSearch`,
  от 2 символов, по коду/наименованию/обозначению) + дерево `#cmParentTree`
  (рекурсивные `<details>`, строки `data-code`); клик по папке (summary) —
  раскрыть **и** выбрать родителя, не закрывая пикер (`selectParent(code,
  true)`), клик по листу/корню — выбрать и закрыть; «— Корень —» сбрасывает
  родителя; путь к выбранному родителю авто-раскрывается
  (`parentPathCodes` → `pathSet`); выбор родителя пересчитывает автокод для
  не-admin (`loadNextCode`) и не меняет код в режиме правки; `openEdit`/
  `setTree` перерисованы через `populateParentSelect`, `collectForm` читает
  скрытый `#cmParent` без изменений. **`styles.css`:** `.cm-parent-value`,
  `.cm-parent-picker` (рамка/максимальная высота/скролл), `.cm-parent-search`,
  `.cm-parent-tree`, `.selected` (подсветка акцентом), `.tree-parent-root`.
  **Деплой** `docker compose up -d --build`, `/health` ok. **Проверки:**
  `npm run build` + `npm run check` PASS; E2E регресс `test_catalog_crud.py`
  **15/15**, `test_dict_catalog.py` **34/34** (пикер не ломает
  автокод-контракт, селекторы `#cmAdd` не менялись), `test_admin.py` **5/5**;
  UI-probe против стенда (admin+master): пикер открывается, дерево
  компактное (22 раздела), папка → раскрытие+выбор без закрытия, лист →
  выбор+закрытие, поиск «Гидробак» → выбор, «— Корень —» сбрасывает, у
  master выбор родителя `21.1/9`/`21.1` пересчитывает код
  (`23`→`21.1/9/20`), режим правки — родитель подсвечен и путь раскрыт
  (`21.1 — Полуприцеп`, `selected` + `details[open]`), JS-ошибок 0. Стенд
  чист: Catalog 2208, DictionaryValue 167, TST=0.

- **25.09.2026 — Этап 17: справочники каталога + автогенерация кода (ADR-009).**
  Запись номенклатуры стала управляемой: 5 полей каталога
  (`blankType/material/materialGrade/blankSize/priority`) переведены в словари с
  серверной валидацией, код новой позиции формирует система.
  **БД (13-я модель):** `DictionaryValue` (`type/value/synonyms/isActive/sort`,
  `@@unique([type,value])`), миграция `20260925094825_add_dictionary_values`,
  сид `dictionaries.json` (priority: высокий/средний/низкий);
  `lib/dict.ts` — `DICT_TYPES/DICT_LABELS`, `normalizeDictValue`,
  `toCanonical` (→ канон/400), `resolveOrCreate` (импорт:синонимы →
  канон, новое → create).
  **`dict:migrate`** (`scripts/normalize-catalog-dicts.ts`, `--dry`): мусор
  `#N/A/0/—/числа` → '', синонимы → канон; `Catalog.code` **не изменяется**.
  **Автокод** (`lib/codes.ts`): `computeNext` (max прямых детей+1), `topLevelNext`
  (22→23), `missingPathRows` (материализация контейнеров), `isPrefix`;
  `POST /api/catalog/next-code` → `{code, wouldMaterialize}`; `POST /` для
  не-admin: code обязан = `next-code` (иначе 400), материализация контейнеров
  (`materialized` в ответе); `PUT` — смена кода только admin; **корневое
  создание master по `topLevelNext`** (фикс `dc1176e`). **Словари-API** —
  `routes/dictionaries.routes.ts`: `GET /:type` (master, admin `?all=1`),
  `POST quick-add` (дубль 409, реактивация 201), `PUT`/`deactivate` (admin).
  **UI:** модалка `catalog-manager.js` — родитель (комбобокс), строка
  «Код: <next-code> (сгенерирован)», ручной ввод только admin, 5 dict-селектов +
  «+» quick-add, подсветка 400 `{field}`; новый таб `/admin` «Справочники»
  (`dict-manager.js`: список значений/синонимы chips/сортировка/деактивация).
  **Импорт** VBA/Excel — `resolveOrCreate` (лояльно), `dictAdded`. Деплой
  `docker compose up -d --build`, `/health` ok; `dict:migrate` LIVE на оба
  контура (стенд `digital_narad` + локальный `MOSD`). **Проверки:** `npm run
  build` + `npm run check` PASS; E2E `test_dict_catalog.py` **34/34 PASS**
  (next-code top/родителя 23 и `/1`→`/2`, POST корня по next-code 201, без/чужой
  code 400, валидные словари 201, `#N/A` → 400 `field`, quick-add 201/409/GET,
  PUT синонимов+sort, deactivate → скрыт + каталог 400 + реактивация 201,
  **материализация** — `86/TST` 400, глубокий код → виртуальный родитель →
  `next-code` `wouldMaterialize` → POST `materialized:['22/TST-…']`, UI `/admin`
  таб «Справочники», cleanup 0); регресс `test_catalog_crud.py` **15/15**
  (создание/смена кода переведены на admin — автокод-контракт master),
  `test_admin.py` **5/5**, `test_master.py` **12/12**. Стенд чист: Catalog
  **2208** (TST=0), `DictionaryValue`=167 (blankSize 93, materialGrade 60,
  blankType 7, material 4, priority 3), `#N/A` в materialGrade 0 (было 105),
  Launches 3, WorkOrders 1 — живые данные не тронуты.

- **23.09.2026 — Этап 16: справочник номенклатуры в UI (CRUD каталога).**
  Каталог (2208 позиций) стал редактируемым из приложения — master и admin
  создают/правят/удаляют позиции без Excel-импорта. **Бэкенд**
  (`catalog.routes.ts`, `requireAuth('master')`): `POST /` (400 пустой код, 409
  дубль, `roundSmart`/`toBool`), `PUT /:code` — при **смене кода** одна
  `$transaction`: create новую + `updateMany` ссылок
  `Launches/WorkOrders/PrintQueue/Queue` + delete старую, ответ
  `{codeChanged, moved:{…}}`; `DELETE /:code` — занятый код 409 с `refs`.
  **Клиент** — общий компонент `public/catalog-manager.js`
  (`CatalogManager.mount/setTree`): тулбар + поиск от 2 символов (плоская
  таблица) + дерево, CRUD-модалка (13 полей + 9 флагов), confirm при смене кода
  с числом обновлённых ссылок, тост на 409. **`/master`** — вкладка
  «Номенклатура» стала редактором (mount один раз, после CRUD
  `onChanged: loadDashboard` — метрики пересчитываются серверно); **`/admin`** —
  новый таб «Номенклатура» (навигация «Сотрудники | Номенклатура») на том же
  компоненте. Стили `.catalog-toolbar`/`.tree-actions`/`.cm-flags` в
  `styles.css`. Деплой `docker compose up -d --build`, `/health` ok.
  **Проверки:** `npm run build` + `npm run check` PASS; E2E
  `test_catalog_crud.py` **15/15 PASS** (201/409/400, shift 403, PUT без смены
  кода, **смена кода с каскадом** — `moved.launches:1` на тестовом запуске,
  delete занятого 409, delete 200, нет в списке, GET 404, UI `/admin` и
  `/master` с `#cmAdd`); регресс `test_admin.py` **5/5** + `test_master.py`
  **12/12**. Стенд чист и живой: Catalog **2208** (TST=0), Launches 3,
  WorkOrders 1, Shifts 2, PrintQueue 1, Employees 6, PushSubscription 3,
  Notification 5 (тестовые `launch_created` удалены SQL-ом). **Нюанс:** пароль
  `admin` на стенде отличался от боевого (bcrypt 4/5 совпадают) — вход для
  теста дан пользователем, БД не менялась; `server/.env` восстановлен из env
  контейнера (дев-строка — placeholder `CHANGE_ME`).

- **22.09.2026 — Этап 15: смена боевых паролей + защита seed от их сброса при деплое.**
  Один боевой пароль (≥8, известен пользователю, в git/отчёты не пишется) задан
  всем **5** сидовым аккаунтам (`admin/master/shift/operator/otk`) на **обоих
  контурах** (локальный `MOSD` и стендовый `digital_narad` на `:5434`). **Сервер:**
  `scripts/set-passwords.ts` — добавлен `import 'dotenv/config'` (скрипт сам грузит
  `server/.env`) и логин `admin` в список (раньше только 4 роли);
  `prisma/seed.ts` (`seedEmployees`) — upsert переведён на `update: {}`: **пароль
  задаётся только при создании аккаунта**, существующие логины seed не трогает
  вовсе (пароль/роль/ФИО) → деплой (`migrate deploy && db seed` при старте
  контейнера) больше не сбрасывает боевые пароли к `123`. На `MOSD` логин `admin`
  отсутствовал (сид после Этапа 14 там не гонялся) — создан с боевым паролем
  временным скриптом (удалён). **Деплой:** образ пересобран
  (`docker compose up -d --build`), применяет фикс seed, `/health` ok.
  **Проверки:** `npm run build` + `npm run check` PASS; bcrypt-сверки
  **5/5 × оба контура** (`new: true`, `123: false`); HTTP-login новым паролем →
  **200**, старым `123` → **401**; **после `docker compose restart app`** (seed
  прогонян повторно) логин новым паролем → **200** — фикс работает; ролевой E2E
  **31/31 PASS** (admin 5, operator 6, otk 4, master 12, shift 4 — с боевыми
  кредами через `tests/e2e/.secrets/e2e-env.ps1`); bizcycle **51/51 PASS**. Стенд
  чист: из теста не осталось ничего (`260922` нет), **живые данные пользователя
  не тронуты** — Launches 3× `ЗП-260918-*`, WorkOrders 1× `Н-260918-053525`
  (`in_progress`), Shifts 1× `СМ-260917-081201` (`closed`), PrintQueue 1,
  PushSubscription 3, Notification 5, Catalog 2208. **Доп. прогон авторизации/
  регистрации:** новый `tests/e2e/test_auth_flow.py` (API через Playwright
  `APIRequestContext` + UI-таб «Регистрация») — **33/33 PASS**: вход 5 боевых
  ролей новым паролем 200+токен/кука `nd_refresh`, `123` → 401,
  refresh/session/logout (401 после), `/me`; регистрация — role в теле
  игнорируется (→ operator), авто-вход, дубль 409, валидации 400 (5 шт.),
  UI → `/operator` → «Выйти» → `/login`; защита входа — 5×401 на тестовом логине
  `nobody-probe`, 6-я попытка → 429; деактивация — вход 403, session/refresh 401,
  скрыт из `/api/employees`, реактивация 200, сам-отключение admin → 400;
  cleanup: тестовые операторы удалены SQL-ом, Employees=5, бизнес-таблицы не
  тронуты. E2E-ньюанс, зафиксированный
  заодно: `config.py._cred()` срабатывает только при паре login+password
  (`ND_LOGIN_*` + `ND_PASSWORD_*`) — задание только пароля молча уходит в
  fallback `123` («Неверный логин или пароль»).

- **21.09.2026 — Этап 14: регистрация операторов + роль Admin + администрирование сотрудников (ADR-008).**
  Карта аккаунтов: **оператор** регистрируется сам на `/login` (таб «Регистрация»; роль
  `operator` проставляет сервер, выбор роли в форме отсутствует; авто-вход через общий
  `startSession`, rate-limit, дубль логина → 409 «Логин уже занят», пароль ≥6 + поле
  «повторите пароль»); **master/shift/otk** — создаёт админ в новом UI `/admin`;
  **admin** (superuser) — только сидом, через UI второго админа завести нельзя.
  **Сервер:** `auth.routes.ts` — вынесен helper `startSession` (login/register/refresh/
  session/me), `POST /register` (валидация, роль фиксируется=operator, P2002→409);
  `requireAuth` — роль `admin` проходит любой ролевой фильтр (**superuser**);
  новый `routes/admin.routes.ts` — `/api/admin/employees` (`GET` список,
  `POST` создать: роль ∈ master/shift/operator/otk **без admin**, `PUT /:login`
  смена роли/сброс пароля, `PATCH /:login` деактивация/активация, **сам-деактивация
  запрещена**); `/login`, `/refresh`, `/session` отклоняют `isActive=false` (403);
  `employees GET /api/employees` — только активные. **Клиент:** `login.ejs` — табы
  «Вход | Регистрация», общий `redirectByRole` (admin → `/admin`); новое `admin.ejs`
  (+`GET /admin` в `page.routes.ts`) — таблица сотрудников (ФИО/логин/роль/статус),
  «Добавить сотрудника», смена роли/пароля, переключатель «активен»; guards 4 роль-
  страниц принимают `admin`. **БД:** `EmployeeRole` += `admin`
  (`schema.prisma` + `EMPLOYEE_ROLE`/`EMPLOYEE_ROLE_LABELS` в `naryad-status.ts`),
  `Employees.isActive boolean @default(true)`, миграция
  `20260921092811_add_admin_role_and_is_active`; сид добавил аккаунт `admin` (пароль
  `123`, меняется `npm run passwords`). **Деплой:** образ пересобран
  (`docker compose up -d --build`), миграция применена, `/health` ok. **Проверки:**
  `npm run build` + `npm run check` PASS; API-smoke **24/24 PASS** (регистрация:
  200+авто-вход/409/400-ы/роль-в-теле игнорируется; admin-CRUD: создание/дубль 409/
  роль-admin 400/смена роли+пароль→вход новым/деактивация→403/реактивация/сам-отключение
  400; operator на /admin 403; admin проходит master-роут; deactivated скрыт из списка);
  UI-probe **15/15 PASS** (табы, регистрация→`/operator`, /admin→создание→вход,
  admin проходит /operator, operator на /admin→`/login`, /admin без сессии→`/login`);
  ролевой E2E **31/31 PASS** (operator 6, otk 4, master 12, shift 4, **admin 5/5** —
  добавлен `test_admin.py`, `config.py` admin CREDS/LANDING); bizcycle **51/51 PASS**.
  Стенд: probe-данные зачищены, **живые данные пользователя не тронуты** (запуски
  ЗП-260918-051641/053835/053904, выданный наряд, push-подписки; Catalog=2208).

- **18.09.2026 — Этап 13: безопасность перед публикацией (ADR-007).**
  Токены из `localStorage` перенесены в «access в памяти JS + refresh в
  httpOnly-куке», вход защищён rate-limit'ом и блокировкой по логину, включён
  helmet, в production принудительные реальные секреты. **Сервер:** `config.ts`
  (nodeEnv/`cookieSecure`/`trustProxy`, валидация секретов в prod), `app.ts`
  (trust proxy, `x-powered-by` off, helmet без CSP, cookie-parser),
  `lib/login-throttle.ts` (5 неудач → блок 15 мин),
  `auth.routes.ts` — `POST /login` → `{ accessToken, user }` + кука `nd_refresh`
  (refresh 7д, claim `persist`, `httpOnly`, `SameSite=Strict`, `Secure` при
  `COOKIE_SECURE`; maxAge 7д при «Запомнить меня», иначе session-кука);
  `POST /refresh` (только кука, ротация), `GET /session`, `POST /logout`
  (чистит куку). **Клиент:** `public/api.js` — `accessToken` в памяти,
  `initSession()`/`api()` (тихий refresh на 401)/`logout()`; 4 вью ролей стартуют
  через `await initSession()` (guard роли, `initNotifications`/`initPush`/loaders
  внутри bootstrap); `login.ejs` — чекбокс «Запомнить меня» → `setSession`.
  **Инфра:** `docker-compose.yml` — `NODE_ENV=production`, `COOKIE_SECURE=true`,
  `TRUST_PROXY=true`; `scripts/set-passwords.ts` (`npm run passwords`);
  секреты JWT/VBA уже были реальными в `server/.env`. **По ходу найден и
  устранён реальный баг throttle:** `isLoginBlocked` удалял запись попыток на
  каждой не-заблокированной проверке → блок никогда не срабатывал; после фикса
  побеждено 6-я неудачная попытка отдаёт 429 (подтверждено на живом
  контейнере). **Тест:** bizcycle «вход»-проверки переведены на
  `wait_text` (асинхронный рендер после `initSession` — раньше был race, давал
  false-fail). **Деплой:** образ пересобран, `/health` ok.
  **Проверки:** `npm run build` + `npm run check` PASS (на каждом шаге);
  auth-probe **17/17 PASS** (логин 200 + токен, refresh нет в теле, кука
  HttpOnly+Secure, `document.cookie` пуст, session/refresh/logout/401 без куки,
  блок 429 после 5 неудач, helmet-заголовки, x-powered-by скрыт); ролевой E2E
  **26/26 PASS** (operator 6, otk 4, master 12, shift 4); push-probe
  **13/13** (1 SKIP: реальная подписка headless недоступна); bizcycle
  **51/51 PASS**. Стенд: тестовые артефакты чистые; **живые данные пользователя
  за сегодня сохранены** (запуски `ЗП-260918-051641/053835/053904` на ПА 001/002,
  выданный наряд, 2 push-подписки shift/master). **Иконки PWA:** placeholder-
  генератор `scripts/make-icons.ts` удалён, иконки 192/512/180 заменены реальным
  логотипом (`server/src/public/icons/`).
  PWA + Service Worker + `web-push`: уведомления приходят на телефон при
  закрытой вкладке. **БД:** модель `PushSubscription` (12-я; `login`,
  `endpoint @unique`, `p256dh`, `auth`), миграция `20260918043050_add_push_subscriptions`.
  **Сервер:** `web-push` + `@types/web-push` (named exports!),
  `lib/push.ts` (`initWebPush`/`isPushConfigured`/`dispatchPush`, TTL 86400,
  404/410 → удаление подписки), `lib/notify.ts` — рассылка push адресату после
  записи `Notification`; `routes/push.routes.ts` `/api/push` (`GET /vapid-key`,
  `POST /subscribe` upsert, `POST /unsubscribe`; `requireAuth` 4 ролей);
  VAPID из `server/.env` (`npm run push:keys`). **Клиент:** `public/sw.js` +
  `public/push-init.js` (`initPush` на 4 ролях; авто-подписка при granted;
  кнопка «Разрешить уведомления» в dropdown колокольчика при default —
  `notifPushHeader`/`askPushPermission`, путь iOS 16.4+ через «на главный
  экран»); `manifest.webmanifest` + author-иконки (`scripts/make-icons.ts`,
  placeholder), подключены во всех вью. **Деплой:** `docker compose up -d
  --build`, `/health` ok, миграция применена в контейнере. **Проверки:**
  `npm run build` + `npm run check` PASS; push-probe **13/13 PASS**
  (auth-gate 401, SW-регистрация, subscribe=upsert/400/удаление в БД;
  реальная подписка headless-Chrome недоступна — `AbortError`, SKIP to phone);
  ролевой E2E **26/26 PASS**; bizcycle **51/51 PASS**; стенд чист
  (PushSubscription=0, бизнес-таблицы=0, Catalog 2208; живая связка
  ЗП-260917-081251/смена Т1-2 не тронуты).
- **18.09.2026 — Этап 11: E2E-харнесс дополнен (probe-кейсы вынесены в bizcycle).**
  Ранее проверявшиеся вручную probe-кейсы вынесены в `tests/e2e/test_bizcycle.py`:
  (1) **уведомления оператора** — колокольчик, бейдж непрочитанных ≥1, непустой
  dropdown, текст «Новый наряд», клик → `mark-read` (бейдж уменьшается);
  (2) **тост уведомления** — сессия оператора остаётся открытой как listener;
  ОТК отправляет наряд №2 на доработку → на 15-сек поллинге всплывает тост
  «Возврат на доработку» (фильтр по ключевым словам отсекает тост собственного
  действия оператора «Переход записан»); (3) **история смен** — оператор закрывает
  init-смену: форма открытия снова видна, select станка доступен, в истории
  появляется строка «Закрыта»; (4) **аналитика мастера** — плюс к графикам
  проверены непустые таблица выполнения за период и «Отчёты по станкам».
  **Правки только в тесте** (сервер не менялся). **Грабли теста:** панель
  уведомлений рендерит пусто → заполняется асинхронно (ждать `.notif__item`);
  заголовок — «Новый наряд», не «Наряд выдан»; строки с суффиксом `-2` матчить
  точно по первой ячейке (`row_by_first_cell`). **Проверки:** `test_bizcycle.py`
  **51/51 PASS ×3** прогона; ролевой регресс **26/26** (operator 6, otk 4,
  master 12, shift 4); стенд чист (WorkOrders/Transitions/ClosedOrders/
  PrintQueue/Launches теста = 0, Catalog 2208; живые данные пользователя —
  запуск `ЗП-260917-081251` на ПА 001, закрытая смена `Т1-2`, уведомление —
  не тронуты).
- **17.09.2026 — Этап 10: полный E2E бизнес-цикла + фикс коллизии ID.**
  Автоматизирован сквозной производственный поток через UI всех 4 ролей:
  `tests/e2e/test_bizcycle.py` — master создаёт 2 запуска (Гидробак, qty 10/20,
  ПА E2E-71/E2E-72) → operator открывает смену Т1-1 → shift выдаёт 2 наряда
  (Т1-1/Т1-2) → operator happy (оба в работу + переход) → ОТК (№1 закрыть, №2 на
  доработку) → operator rework → ОТК (закрыть №2, очередь пуста) → master
  аналитика (Сводка/Номенклатура/Отчёты) → SQL-cleanup в FK-порядке
  (`clean_test_data`, каталог/живые смены не трогает). **По ходу прогона найден и
  устранён реальный серверный баг:** `generateNaryadId` даёт секундную метку, и
  два `/issue` в одну секунду падали `500` (Prisma P2002, «Повторная запись уже
  существует»). Фикс `server/src/lib/id.ts`: общий `stamp(prefix)` при повторе
  секунды добавляет суффикс `-N` (`Н-260917-072540`, `Н-260917-072540-2`), обычный
  формат не меняется — применён к наряду/запуску/смене. **Тест:** suffix-safe
  `naryad_row()` (точное совпадение первой ячейки, иначе `has_text` матчил и
  `-2`-строку), `wait_selector(state=…)` (для `<option>` ждать сам `<select>`),
  `operator_run` с «Обновить»-ретраями, OTK rework-фаза с 2 переходами.
  **Проверки:** `npm run build` + `npm run check` PASS; repro P2002 (3 быстрых
  `/issue` через JWT shift): до фикса 201/500/500, после — 201/201/201
  (`-2`/`-3`); locator-probe на синтетической `-2`-таблице PASS;
  `test_bizcycle.py` **37/37 PASS ×5 прогонов**; штатные ролевые E2E **26/26
  PASS**; деплой `docker compose up -d --build`, `/health` ok; стенд чист
  (Launches/Orders/Transitions/Closed/PrintQueue/Shifts=0, Catalog=2208).
- **17.09.2026 — Этап 9: полная номенклатура из Excel + правильное дерево.**
  Каталог заменён полным Excel-файлом («Номенклатура продукции.xlsm», лист
  «Продукция», 2208 позиций, данные с row 8): скрипт
  `server/scripts/import-excel.ts` (`npm run import:excel -- <путь>`) читает
  xlsx-архив без внешних зависимостей (zip + sharedStrings), маппит 14 колонок
  (код, наименование, обозначение, обозначение(пред.), КОЛИЧЕСТВО, Т/О,
  Покрытие, Длина, Тип, Материал, Марка, ф/S, Стенка, Массы),
  `dropOrphanRefs()` удаляет orphan-ссылки (запуски/наряды на коды, которых
  нет в новом каталоге — удалены историческая связка ЗП-260914-062420/
  Н-260914-062458 `partCode=1.1/1/1`), затем атомарно: `deleteMany` каталога +
  `createMany` пачками по 500. **Дерево номенклатуры читает смешанные
  разделители:** `catalog-tree.ts` переписан — `splitCode()` режет по
  `/[./]/`, узлы строятся по нормализованному ключу (все сегменты через `/`),
  исходный код позиции сохраняется через `byNorm`; `accumulateTotals()`
  аккумулирует метрики (в запуске/в работе/закрыто) по поддереву в `totals`.
  **UI:** вкладка «Номенклатура» мастера — рекурсивное сворачиваемое дерево
  (`master-app.ejs` renderTree, `<details class="tree-node">`; стили `.tree-*` в
  `styles.css`). **Сервер:** `/api/catalog` больше не режет вывод (`take:500`
  только при поиске/приоритете — отдаёт все 2208), `/tree/units` возвращает
  вложенное дерево с метриками; `analytics.ts` nomenclature — `units` вложенное
  дерево (`CatalogTreeUnit<CatalogMetricNode>`). `seed.ts`: сид каталога — только
  при пустой таблице (не затирает импортированный каталог). XLSM в git не
  трекается (`.gitignore`, путь — аргументом). **Деплой:** образ пересобран
  (`docker compose up -d --build`), `/health` ok. **Проверки:** `npm run build` +
  `npm run check` PASS (после `npx prisma generate` — npm ci не запускает
  postinstall); API-smoke против стенда: `GET /api/catalog`=2208, дерево 22
  топ-уровня (1–22), макс. глубина 7 (`21.1/1/2/1/1/7`), `21.1/9`=«Гидробак»
  с обозначением «МТ 03.01.010.00.000 СБ», агрегаты `totals`=0 на чистом
  стенде; браузерный probe **9/9 PASS** (разворачивание 21→21.1→Гидробак→лист
  «Штуцер G1», поиск «Гидробак» по каталогу с обозначением, без ошибок
  консоли); штатный E2E **26/26 PASS** (operator 6, otk 4, master 12, shift 4;
  селекторы вкладок не менялись). Стенд: Catalog=2208, Launches/WorkOrders=0
  (связка удалена), открытые смены Т1-2/Т1-1 сохранены.
- **17.09.2026 — Этап 8: уведомления ролей (внутри приложения) + скрипты запуска.**
  Внутренние уведомления нового события → получателю: колокольчик «Уведомления»
  в шапке всех 4 ролей (`initNotifications()` в `ui.js`, поллинг `GET
  /api/notifications/my` каждые 15 с), бейдж непрочитанных на токене `--error`,
  тост при появлении, dropdown со списком (клик → `read` + переход по `link`).
  **БД:** модель `Notification` (11-я; `targetLogin`/`targetRole`, type, title,
  message, link, isRead; индексы по `[targetLogin, isRead]`/`[targetRole,
  isRead]`), миграция `20260917034617_add_notifications`. **Сервер:**
  `lib/notify.ts` (`notifyOperator(fullName,…)` по ФИО → `Employees.login`,
  `notifyRole(role,…)`), `notifications.routes.ts` (`/my`, `/:id/read`,
  `/read-all`, все под `requireAuth`). **Хуки:** `workorders/issue` → оператор
  (`naryad_issued`), `transition-logic.updateNaryadStatus` → ОТК при переходе в
  `waiting_otk` (только при смене статуса — без дублей), `otk/rework` → оператор
  (`rework`), `launches POST` → shift (`launch_created`), `otk/close` →
  оператор+master+shift (`naryad_closed`). Описано в `docs/specs/notifications.md`.
  **Деплой:** образ пересобран (`docker compose up -d --build`), миграция
  применена в контейнере (`migrate deploy` + seed), `/health` ok; открытые смены
  оператора (Т1-2, Т1-1) не тронуты. **Проверки:** `npm run build` +
  `npm run check` PASS; E2E **26/26 PASS** (в тексте оператора появилась кнопка
  «Уведомления», селекторы не менялись); API-smoke **14/14 PASS** полного цикла
  (запуск→shift, выдача→оператор, переход→ОТК, rework→оператор, закрытие→
  мастер+shift+оператор, mark-read, read-all); браузерный probe: бейдж=1,
  dropdown с текстом, клик → переход по `link`, бейдж скрывается. Тест-данные
  удалены — стенд чист. **Также:** запущены в git скрипты старта
  (`run-site.cmd` + bat-обёртки локально/глобально), волатильный Funnel-URL
  остаётся настройкой пользователя (обёртки в репозитории).
- **16.09.2026 — Этап 7: смены оператора — «вторая смена» и сворачиваемая история.**
  `renderShifts()` в `operator.ejs` переработан: (1) открытые смены всегда видны сверху
  панели «Смены» (ID, станок, дата, кнопка «Закрыть»); (2) форма «Открыть смену»
  видна, пока открытых смен **меньше 2** — подписи «Откройте смену на станке» (0)
  и «Можно открыть ещё одну смену» (1); при 2 открытых форма скрыта и показывается
  «Максимум 2 открытые смены» (лимит сервера, `shifts.routes.ts`, == 2); (3) история
  сворачивается в `<details><summary>История смен (N)</summary>` (закрыта по
  умолчанию; внутри — закрытые/авто-закрытые смены, без «Закрыть»). Сервер не
  менялся — только вью. **Деплой:** образ пересобран (`docker compose up -d --build`),
  `/health` ok. **Проверки:** `npm run build` + `npm run check` PASS; E2E **26/26 PASS**;
  браузерный probe против станда: история свёрнута → клик по summary раскрывает/
  скрывает; закрытие одной смены → форма «ещё одну» возвращается; открытие второй →
  форма скрыта, «Максимум 2»; зачищено — смены стенда приведены к исходному виду
  (открыты Т1-2 + Т1-1).
- **15.09.2026 — Этап 6: правило округления чисел «максимум 2 знака, мелкие — до первой значащей цифры».**
  Единое «умное» округление во всех числовых данных: `|x| ≥ 0.01` → максимум 2 знака
  (`2.567 → 2.57`), `0 < |x| < 0.01` → до 1 значащей цифры (`0.0005643 → 0.0006`),
  `0 → 0`, хвостовые нули в отображении убираются (`2.50 → «2.5»`). Одна функция
  `roundSmart(n)` в **`server/src/lib/round.ts`** применяется и при сохранении в БД,
  и в агрегатах, и в UI (JS-зеркало в `server/src/public/ui.js` — `roundSmart` +
  `fmtNum`). **Сервер:** округление на записи в `launches` (POST/PUT qty),
  `workorders/issue` (qty в WorkOrders+PrintQueue), `transitions` (POST time/qty,
  `/check` accepted/defect), `otk/close` (суммы accepted/defect), `vba/ingest`
  (time/qty переходов); агрегаты `analytics.ts` — `paLoad`, `daily`, `exec`,
  `toGroupRow` (qty/accepted/defect/time) отдают уже округлённые значения.
  **UI:** все интерполяции чисел в master-app («ПА», итоги/разрезы, «Запуски», дерево
  «Номенклатуры»), shift-app (таблицы + модалка выдачи, `issueQty`), operator-app
  (наряд/модалка перехода, `trTime`/`trQty`), otk-app (очередь, переходы
  time/qty/accepted/defect, prompt ОТК) переведены на `fmtNum`/`roundSmart`;
  underline: `accepted`/`defect` = 0 показывает «0», null — пусто; подписи осей
  графиков (`y1` — precision 2). **Деплой:** Docker-образ пересобран
  (`docker compose up -d --build`), применён на live-стенде :3000; `/health`
  `{status:'ok', db:'connected'}`. **Проверки:** `npm run build` + `npm run check`
  PASS; unit-probe `roundSmart` (0, 2, 2.567→2.57, 2.55, 2.5, 0.0005643→0.0006,
  0.009, 0.005, 0.05, 1234.5678→1234.57, 0.01) и клиентское зеркало `fmtNum`
  совпадают; API-smoke `/api/launches` POST/DELETE: `0.0005643 → сохранено 0.0006`,
  `2.567 → 2.57`, `2.55 → 2.55` (HTTP 201/200, из контейнера; тест-запуски удалены,
  стенд чист — осталась только связка ЗП-260914-062420); штатный E2E **26/26 PASS**
  (operator 6, otk 4, master 12, shift 4; селекторы не менялись). Правило округления
  зафиксировано в `docs/specs/architecture.md` (технические конвенции).
- **14.09.2026 — Этап 5: идентификация деталей «Обозначение — Наименование» + доступ к стендовой БД на порту 5434.**
  Устранены «косяки» отображения: позиции узлов (`Catalog.code`: «1.1/1/10») больше
  не выдаются за коды деталей; везде, где деталь идентифицируется, показывается
  «Обозначение — Наименование» (напр. «МТ 03.01.010.00.000 СБ — Гидробак»).
  **Сервер:** `Launches` не имел `designation` → `GET /api/launches[/:id]` теперь
  отдаёт `include: { catalog }` (`server/src/routes/launches.routes.ts`); при
  выдаче наряда пустые `name`/`designation` заполняются из `Catalog` по `partCode`
  в `WorkOrders` и `PrintQueue` (`server/src/routes/workorders.routes.ts`, `/issue`).
  **Дерево номенклатуры:** группировка в `server/src/lib/catalog-tree.ts` переведена
  с `designation.split('-')[0]` (почти каждая деталь — своя группа) на реальные
  узлы: узел = `code` без последнего сегмента, подпись узла — его наименование.
  **UI:** таблицы запусков/нарядов и модалки master/shift/operator/otk показывают
  колонку «Обозначение» (fallback `designation` из каталога/наряда) вместо
  «Деталь»-позиции; поиск по запускам shift дополнительно ищет по обозначению.
  **Доступ к БД:** стендовый контур перевешан на host-порт **5434** (конфликт с
  локальным Windows-PG на 5432; `docker port server-db-1` → `5432/tcp ->
  0.0.0.0:5434`). Внешние SQL-клиенты: `localhost:5434`, БД `digital_narad`,
  юзер `user`. Спека: `docs/specs/analytics-master.md` (правило группировки),
  `docs/specs/data-model.md` (подстановка designation при выдаче).
  **Деплой:** Docker-образ пересобран (`docker compose up -d --build`), применён на
  live-стенде :3000. **Проверки:** `npm run build` + `npm run check` PASS; штатный
  E2E **26/26 PASS** (селекторы не менялись); API-smoke — `POST /issue` с пустыми
  `name`/`designation` и реальным `launchId` → наряд создан с `designation`
  «УБРСП 80», `name` «Полуприцеп» (HTTP 201, изнутри контейнера; P2003 в
  PowerShell-smoke — артефакт кодировки PS-скрипта, не серверный баг). Стендовая БД
  приведена в чистый вид (удалены тестовые наряды/запуски/PrintQueue; осталась
  только связка из probe этапа 3 — ЗП-260914-062420/Н-260914-062458, не трогалась).
- **14.09.2026 — Этап 4: наладка интерфейса «Пульт цеха» + графики (ADR-006).**
  Остаёмся на EJS+Vanilla (React-переплатформа отложена). Дизайн-система на
  CSS-токенах в `server/src/public/styles.css`: тёмная шапка-планка (sticky),
  светлые панели, «светофор цеха» (`.badge--info/ok/warn/error`), табулярные
  цифры/моно-коды, `.empty-block`, `:focus-visible`, `prefers-reduced-motion`,
  mobile-first (Funnel с телефона). Общий JS-слой `server/src/public/ui.js`
  (`badge`, `emptyBlock`, `statCards`, `drawChart`). **Графики Chart.js v4
  вендором** (`public/vendor/chart.umd.min.js`, без CDN): Сводка — bar «Наряды по
  статусам» + bar «Загруженность ПА»; Отчёты — «Динамика закрытия нарядов»
  (bar+line, две оси) на новых данных **`reports.daily`** в
  `server/src/lib/analytics.ts` (единственная серверная правка). Выравнены
  пустые состояния на operator/otk/shift. **Деплой:** Docker-образ пересобран
  (`docker compose up -d --build`), применение на live-стенде :3000.
  **Проверки:** `npm run build` + `npm run check` PASS; штатный E2E **26/26 PASS**
  (селекторы не менялись); probe-прогон **12/12 PASS** на стенде — пустые
  состояния при пустой БД, canvas НЕ рисуется без данных, после пробного запуска
  (ЗП-260914-060800) canvas `paChart` отрисован с подписью «999», timeline —
  пустое состояние, консоль без error, mobile `/login` (390×800) ок; пробный
  запуск удалён, стенд чист (Orders/Closed/Transitions/Launches=0, Shifts=4).
- **14.09.2026 — Этап 3: аналитика мастера (сводка + номенклатура + отчёты).**
  Роль `master` получила «полную картину» из **единого серверного источника**
  метрик — `GET /api/analytics/dashboard` (`server/src/routes/analytics.routes.ts`,
  `requireAuth('master')`, `?from=&to=` для отчётов). Все агрегации — один раз в
  `server/src/lib/analytics.ts` (ground truth — факты `WorkOrders`/`Transitions`/
  `Shifts`/`ClosedOrders`, не хрупкий `Launches.status`). Ответ:
  `summary` (launches/orders по статусам, вкл. `rework`; **«Загруженность ПА»** —
  активные запуски по `paNumber`; **«Занятые станки»** — открытые смены +
  `machinesIdle`), `nomenclature` (дерево узлов + метрики позиции: активные
  запуски / в работе `created|in_progress|rework` / закрыто), `reports`
  (выполнение за период: закрыто/объём/принято/брак %/нормо-часы + разрезы по
  операторам и станкам, join `ClosedOrders→WorkOrders→Transitions`).
  UI `/master` — вкладки «Сводка / Планирование / Номенклатура / Отчёты»
  (`master-app.ejs`), «Планирование» — без изменений, дефолт — «Сводка».
  Группировка номенклатуры вынесена в `server/src/lib/catalog-tree.ts`
  (используют `/api/catalog/tree/units` и аналитика). Спека —
  `docs/specs/analytics-master.md`. **Деплой:** Docker-образ пересобран
  (`docker compose up -d --build`), применён на live-стенде :3000.
  **Проверки:** `npm run build` + `npm run check` PASS; API-smoke (shape,
  `?from/to`, агрегация на реальном заказе: qty=10, брак 1→10%, время 0.5,
  `paLoad` create→delete); штатный E2E **26/26 PASS** (operator 6, otk 4,
  shift 4, master **12** — добавлены проверки вкладок); браузерный
  probe на стенде с созданным запуском — Сводка/Номенклатура/Отчёты **ALL PASS**
  (пробный запуск удалён, стендовая БД в чистом виде: Orders/Closed/Transitions/
  Launches=0, Shifts=3 — тестовые смены пользователя сохранены).
- **14.09.2026 — Красная зона устранена: оператор снова открывает смены; добавлено «Запомнить меня».**
  Аудит живого UI всех ролей (Playwright против Docker-стенда) выявил блокер:
  в `server/src/views/operator.ejs` форма «Открыть смену» рисовалась **только при
  пустой истории смен** (`shifts.length === 0`), поэтому при наличии любой
  закрытой смены оператор не мог открыть новую → роль operator «умирала» и поток
  (выдача → оператор → ОТК) не стартовал. Триггером был smoke-хвост
  `СМ-260911-093821`. Фикс: форма «Открыть смену» показывается, когда **нет
  открытой** смены (закрытые в истории не мешают), таблица истории рендерится
  всегда. **Авторизация:** добавлен чекбокс «Запомнить меня» (`login.ejs`, по
  умолчанию включён) + `tokenStore()` в `server/src/public/api.js` — галка →
  токены/`user` в `localStorage` (переживают закрытие браузера), снята →
  `sessionStorage` (вход при каждом открытии вкладки); общий `logout()` чистит оба
  хранилища, кнопки «Выйти» всех ролей переведены на него. Проф-эволюция
  (refresh-токен в `httpOnly`-cookie) отложена в этап безопасности.
  **Деплой:** Docker-образ пересобран (`docker compose up -d --build` в `server/`),
  изменения применены на live-стенде (localhost:3000 + Funnel); БД приведена в
  чистый вид (Shifts/Launches/WorkOrders/Transitions/ClosedOrders/PrintQueue = 0,
  Catalog 29, Equipment 8, Employees 4). **Проверки:** `npm run build` +
  `npm run check` PASS; штатный E2E **18/18 PASS** (operator 6, otk 4, master 4,
  shift 4); целевой probe **14/14 PASS** (открытие смены при пустой истории →
  закрытие → форма снова видна при закрытой в истории; remember ON → localStorage,
  OFF → sessionStorage; «Выйти» чистит оба хранилища).
- **11.09.2026 — Стек переведён на Docker Desktop: глобальная ссылка перестала отваливаться.**
  Причина нестабильности `https://el-konstr04.tail13402b.ts.net` найдена: контейнеры
  крутил docker.io внутри Ubuntu-WSL, а сама Ubuntu-WSL **выключается по idle-таймауту
  (~60 с)** — контейнеры умирали вместе с виртуалкой, Funnel получал пустой
  `127.0.0.1:3000` → 502 → телефон «не может обработать запрос». Решение: Docker
  контекст выставлен в `desktop-linux` (Docker Desktop 4.90.0, engine 29.7.2), проект
  запущен через Docker Desktop (`docker compose up -d --build` в `server/`): образ
  `server-app` собран, миграции применены, сид залит, `server-db-1` healthy.
  docker.io в Ubuntu-WSL отключён (`systemctl disable --now docker docker.socket`) —
  два движка не конфликтуют за порты 3000/5432. Автозапуск Docker Desktop: Run-ключ
  HKCU присутствует (запуск при входе в Windows); флаг `AutoStart` в
  `settings-store.json` Docker Desktop сбросил на `false` при перезаписи настроек —
  проверить чекбокс «Start Docker Desktop when you sign in» в Settings→General.
  **Проверка живучести:
  ссылка отвечает 200 непрерывно 5+ минут бездействия** (раньше падала за ~1 мин);
  контейнеры `Up 6 minutes` без рестарта, WSL-фон `docker-desktop` — `Running`,
  Ubuntu — `Stopped`. Проверено: `/health` 200 локально и через Funnel, `/login`
  рендерится, вход `operator/123` → `/api/login` выдаёт токен (роль operator).
- **11.09.2026 — Docker-стек поднят вживую на WSL + глобальный доступ через Tailscale Funnel.**
  Первый реальный `docker compose up --build` (`server/`), образ `server-app`
  собран, миграции применены, сид залит, `/health` → `{status:'ok', db:'connected'}`.
  В `docker-compose.yml` добавлен `restart: unless-stopped` обоим сервисам.
  (Исторический этап: позже заменён Docker Desktop см. выше.)
- **11.09.2026 — Глобальный error-handler: asyncHandler + Prisma JSON-ответы.**
  Создан `server/src/lib/async-wrap.ts` (`asyncHandler` + `wrapRouter`), который
  автоматически оборачивает все async-хендлеры в роутерах и перенаправляет
  неперехваченные исключения в Express `next()`. Финальный error-middleware
  (`server/src/app.ts`) возвращает JSON-ответ с понятным сообщением вместо
  ConnectionReset: P2003 → 400 «Ссылка на несуществующую запись», P2025 → 404,
  прочее → 500. Проверено: невалидный `partCode` в `/issue` теперь отдаёт 400,
  сервер не падает (health проверялся сразу после). E2E 18/18 PASS (без изменений
  в харнессе). Коммит: `5f161a7`.
- **11.09.2026 — Rework-цикл оператора восстановлен.**
  `GET /api/work-orders/my/list` (`server/src/routes/workorders.routes.ts:78`)
  теперь включает `rework` в фильтре статусов.
  Проверено end-to-end через API: rework → оператор видит → переход → waiting_otk →
  ОТК закрывает. Коммит: `4d304a1`.
- **11.09.2026 — E2E на `localhost:3000` адаптирован (JWT-стек), 18/18 PASS.**
  Харнесс `tests/e2e/` переписан под новый стек: `config.py` (APP_URL
  `http://localhost:3000`, CREDS из сида, LANDING → `/master|/shift|/operator|/otk`),
  `helpers.py`/`runner.py` (full-page селекторы, JWT-логин через `/login`, без
  Google-сессии/фреймов), `test_{operator,otk,master,shift}.py` — проверка
  входа, отрисовки страницы роли и F5-редиректа. GAS-харнесс
  (`session_setup.py`, `flows.py`, `seed_*.py`, `test_bizcycle.py`,
  `test_otk_full.py`) удалён из `main` (копия — ветка `google-apps`).
  Прогоны: operator 6/6, otk 4/4, master 4/4, shift 4/4 — итого **18/18 PASS**.
  `docs/testing/e2e-runbook.md` актуализирован.
- **11.09.2026 — Документация и Docker-контур под new-стек (docs+Docker).**
  Переписаны под Node/Express+Prisma+PostgreSQL: `AGENTS.md`, `README.md`,
  `docs/specs/`, `docs/testing/e2e-runbook.md`, `instructions/{safety,verification}.md`,
  `.opencode/agents/e2e.md`, `server/docs/vba-integration.md`, STATUS.md.
  Docker: исправлен `docker-compose.yml` (context/`dockerfile`/`env_file` через
  `server/`, `DATABASE_URL` сервиса `app` → host `db`, `prisma db seed`),
  добавлены `docker-compose.dev.yml`, `.dockerignore`, обновлён `Dockerfile`
  (build-tools bcrypt, `prisma/` целиком), `server/docs/onboarding.md`,
  `.env.example`. Проверки: `npm run build` + `npm run check` PASS, `/health` OK.
  Docker-CLI нет — `docker compose up --build` не прогонялся.
- **10.09.2026 — Адаптация репозитория под новый стек.** Создана ветка
  `google-apps`, `main` fast-forward на `future` + удалены Google-артефакты
  (modules/, digitalapps-deploy-скилл, GAS-доки, `Мастер-промпт.md`).
- **09.09.2026 — Проверка локального стека (пробы A–E, все PASS).** MCP-postgres
  против локального `MOSD` (PG 18.1, `production_user`): миграция
  `20260910105412_init` применена; 6 enum соответствуют `schema.prisma`; сид —
  каталог 29 позиций, 4 роли (bcrypt), станки Т1-1..Т1-8;
  бизнес-таблицы пусты (Shifts: 1 хвост smoke). Playwright: `localhost:3000`
  рендерит `/login`. Версия рабочего стека без деплоя (локальный dev).

## Открытые баги / TODO

- [x] **Живое напоминание плагина первого хода — закрыто 19.10.2026
  (Этап 31, вердикт НЕ ДЕФЕКТ).** Доказательство: JSONL-лог
  `.artifacts/plugin-debug.log` — `hasAssistant:false` →
  `branch:"with-config"`, `injected:true` на первом ходу +
  `skip-not-first-turn` далее, и цитата модели iter-3 «инъецированное
  напоминание…» (`.opencode/handoff/handoff-261016-120450.md`); root cause —
  `.artifacts/plugin-debug-root-cause.md`.
- [x] **Живой прогон цикла session-loop упирается в шаг подтверждения session-bootstrap.** Драйвер `.opencode/loop/ralph-loop.ps1` запускает неинтерактивную сессию `opencode run --agent orchestrator --auto`; в ней нет инструмента `question`, а resume-ветка `instructions/session-bootstrap.md` требует «показать конфиг и спросить подтвердить/изменить» → ход завершается без брифа. Прогон 16.10: итерация 2 (RESUME) и итерация 1 (COLD) — обе без брифа, exit 3. Логи: `.opencode/loop/logs/{iter-1,iter-2}.{out,err}.log`. Нужно решение: снять шаг подтверждения в неинтерактивном драйвере (resume-промпт «конфиг подтверждён — шаг пропусти» либо авто-подтверждение в session-bootstrap). **Снято 16.10.2026 (Этап 30):** шаг подтверждения пропускается в неинтерактивной сессии; реальный прогон exit 0.
- [x] **E2E-прогоны разблокированы (Этап 20)** — демо-пароль `121212` задан на
  обоих контурах, файл секретов и fallback синхронизированы. Блокер «пароли не
  совпадают» снят, полный набор **164 PASS** прогнан.
- [x] **Живой двухоконный смоук контура делегирования — отменён удалением
  контура** (14.10.2026, ADR-011): `nda-planner`/`nda-executor` и
  `.opencode/queue.jsonl` удалены из репозитория, смок T1/T2 не выполняется и
  не требуется. Исторический контракт — `docs/specs/agent-delegation.md`
  (deprecated).
- [ ] **Демо-пароль `121212` заменить на реальный перед публикацией** (сейчас
  режим — демо/тест, по решению пользователя). Затрагивает `employees.json`,
  `.secrets/e2e-env.ps1`, `config.py`, документацию; делается одним
  `npm run passwords -- <новый>` на обоих контурах. Требование зафиксировано в
  `instructions/safety.md` и ADR-008.
- [x] **Дрейф каталога на стенде `digital_narad` — решён удалением группы `22`**
  (решение пользователя). Группа `22` снесена полностью (`DELETE /prefix/22`:
  142 позиции + 162 связи-КД), `Catalog` = **2061**, `ProductDocLink` = **1131**,
  топ-уровней 21. `test_dict_catalog` больше не порождает пустую строку `22`
  (cleanup всегда удаляет тестовый корень; тест next-code сверяется с
  `max(top)+1`). Остаётся 2 пустых имени в глубине (`13.11.6/3`, `21.1/3/1/1`) —
  это материализованные контейнеры, не влияют на работу.
- [x] **E2E покрывает вход+рендер+refresh+вкладки** (**31/31 PASS**: operator 6,
  otk 4, master 12, shift 4, admin 5) и **полный бизнес-цикл** (`test_bizcycle.py`,
  **51/51 PASS**). В харнесс вынесены и ранее probe-кейсы: «закрытая смена в
  истории → форма открытия видна», «уведомления» (бейдж/dropdown/mark-read/тост на
  повторном поллинге) и содержимое вкладок аналитики мастера. Авторизация/
  регистрация/защита входа/деактивация — `test_auth_flow.py` **33/33 PASS**.
- [ ] (опц.) Экран очереди печати отсутствует (`PrintQueue` пишется при выдаче,
  read-эндпоинта нет); объёмно выведен из «полной картины» мастера.
- [ ] (опц.) `auto_closed` есть в `SHIFT_STATUS` (`naryad-status.ts`), но нигде не
  выставляется; подпись «Авто-закрыта» в UI недостижима — решить судьбу статуса.
- [ ] (опц.) `POST /api/work-orders/issue` не сверяет оператора с активной сменой
  и станок с занятостью — наряд может уйти на «мёртвые» комбинации.
- [ ] (опц.) Выделить сервисный слой инвариантов (закрытие, accepted+defect≤qty,
  занятость станка) — пока rules живут в хендлерах.
- [ ] (опц.) Модель `Queue` в схеме, но не питается ни одним route: использовать
  или удалить.
- [ ] (опц.) `ClosedOrders` — запись-дубликат итогов; рассмотреть пересчёт
  проекцией из переходов.
- [x] **Смена сидовых паролей ролей** (`123` → реальные): сделана в **Этапе 15** —
  один боевой пароль на оба контура, seed больше не сбрасывает пароли
  (`scripts/set-passwords.ts` включает `admin` и грузит `.env`; `seed.ts` —
  пароль только при create).
- [ ] **Локальная утечка секретов в git-объектном хранилище** (`refs/stash`, не
  опубликовано): `git log --all --full-history -- "tests/e2e/.secrets/*"` находит
  `4b6a289` (`index on google-apps`) с файлами `.secrets/pgpass` и
  `.secrets/e2e-env.ps1` (в последнем — боевые пароли ролей приложения). Проверено:
  в `origin/main`/`origin/future` этих блобов **нет** (`rev-list … --objects` пуст,
  `branch -a --contains` пуст) — публичной утечки нет. Очистка требует
  `git stash drop` (необратимо) — решение за пользователем.
- [ ] HTTPS-терминирование: внешний контур — Tailscale Funnel (уже https), но
  локальный `http://localhost:3000` остаётся http; экранирующий reverse-proxy
  для прода решить отдельно.
- [ ] (решено, но отложено) Локальный производственный контур: сервер в цехе,
  рабочие по Wi-Fi, ответственные через VPN (+ https/PWA/push, бэкап, автозапуск)
  — оформляется отдельным планом-контекстом.
- [x] **(исторически) Мост делегирования: длинная задача проверена (V-LONG).**
  Контур и мост `tools/mcp-orchestrator/` удалены (14.10.2026, ADR-011);
  протоколы больше не в репозитории. Задача с тремя
  отдельными `Start-Sleep -Seconds 20` прошла через stdio JSON-RPC за
  `callMs=211281` мс (`durationMs=211276`, `success=true`, `exitCode=0`) **без
  ошибки `-32001`** при `timeoutMs=600000`; клиентский лимит 240000 мс не
  достигнут (211583 мс, Kill не понадобился), stderr моста 0 байт.
- [x] **Асинхронный режим submit/poll — стал неактуален** (14.10.2026,
  ADR-011): задача снимается вместе с удалением моста и контура. В argos
  диспатч и приёмка результала встроены в тулсет
  (`register_task_groups` / `dispatch_tasks` / `submit_task_result`).
- [x] **(исторически) Зависание g2 устранено — жёсткие внешние таймауты
  вложенных процессов** (контур и мост удалены 14.10.2026, ADR-011; запись
  сохранена для истории).
  Причина зависания — отсутствие жёстких внешних таймаутов у вложенных
  процессов (бессрочное ожидание). Исправлено: все длинные вызовы обёрнуты
  внешним лимитом — PowerShell `Start-Process -PassThru → WaitForExit(ms) →
  Kill` (в протоколе V7 — `ProcessStartInfo → WaitForExit(ms) → taskkill /T /F`)
  и `bash timeout`; в протоколах применены лимиты 30000 (handshake),
  60000 (обычные команды/сборка), 120000 (V-RECURSION), 240000 (клиент V-LONG),
  300000 (V7-сессия) — бессрочных ожиданий нет (CQ1 + V7-протоколы).
- [x] **(исторически) Анти-рекурсия для исполнителя закрыта двумя слоями**
  (контур и мост удалены 14.10.2026, ADR-011; запись сохранена для истории;
  фикс после отчёта FAIL `.artifacts/verification/two-terminal-delegation.md`): permission
  `orchestrator_execute_task: deny` в `.opencode/agents/nda-executor.md`
  (тул не попадает в тулсет) **+** env-guard `ORCH_NESTED` в мосту
  (`tools/mcp-orchestrator/index.mjs`): вложенные `opencode run` получают
  `ORCH_NESTED=<глубина+1>`, мост с заданной переменной отклоняет `execute_task`
  на входе («Рекурсия запрещена…»). Проверено: пробник с `ORCH_NESTED=1` →
  `isError:true`; прямой ран `--agent nda-executor` с принуждением к вызову
  → 0 `tool_use`, файла нет. **Подтверждено прогоном V-RECURSION** (07.10.2026,
  протокол `tools/mcp-orchestrator/verification/2026-10-06-verify-v7-recursion.md`,
  §2): 2 форс-попытки `run --agent nda-executor` → `TOOL_USE_ANY=0`, от этих
  сессий в логе **0** строк `=== Задача`/`spawn:`, ответов моста («занят»/
  «Рекурсия запрещена») 0 — вызов отклонён **на уровне permission** (слой 1),
  не доходя до моста; слой 2 (env-guard `ORCH_NESTED`) подтверждён пробником
  выше.

## Закрытые баги (new-стек)

- ✅ **Токены в `localStorage` → XSS-захват.** Этап 13 (ADR-007): access-токен
  только в памяти JS (`public/api.js`), refresh — в httpOnly `SameSite=Strict`
  куке `nd_refresh`; `GET /api/session` восстанавливает сессию, `logout()` чистит
  куку. Вход защищён rate-limit (120/15 мин на `/login`+`/refresh`) и блокировкой
  логина (5 неудач → 15 мин); включён helmet, скрыт `x-powered-by`.
- ✅ **Блокировка логина не срабатывала.** `isLoginBlocked` удалял запись
  попыток при каждой не-заблокированной проверке → счётчик неудач обнулялся.
  Фикс в `lib/login-throttle.ts` (не удалять в check; сброс при истёкшем блоке
  в `recordLoginFailure`); подтверждено: 6-я неудача → 429.

- ✅ **Идентификация деталей «Обозначение — Наименование».** Позиции узлов
  (`Catalog.code`: «1.1/1/10») больше не выдаются за коды деталей; наряды/запуски
  не теряли обозначение при выдаче (`/issue` подставляет наполненный
  `designation`/`name` из `Catalog`); дерево номенклатуры группируется по реальным
  узлам (Этап 5).
- ✅ **Master урезан против GAS.** Этап 3 вернул «полную картину»: оперативная
  сводка + дерево номенклатуры с метриками + отчёты/история из единого источника
  (`/api/analytics/dashboard`). Очередь печати осталась вне объёма (задокумен­тировано).
- ✅ **Оператор не мог открыть новую смену при наличии истории.** Форма
  «Открыть смену» была видна только при пустом списке смен; любая закрытая смена
  в истории блокировала роль. Теперь форма показывается при отсутствии открытой
  смены, история рендерится всегда (`operator.ejs`).
- ✅ **«Запомнить меня».** Чекбокс входа; выбор хранилища
  (`localStorage`/`sessionStorage`) через `tokenStore()`; общий `logout()` чистит
  оба хранилища.
- ✅ **Авторизация роль-в-URL → JWT роли-в-токене** (ADR-002 осн. узел).
  Спуфинг роли через URL невозможен: роль в подписанном сервером payload,
  пароли bcrypt.
- ✅ **Канон наряда сведён к `WorkOrders`** (ADR-003) в новом стеке; переходы —
  `Transitions` (FK, уникальность `[orderNumber, number]`); итоги — `ClosedOrders`.
- ✅ **Rework-статус есть в enum** (ADR-005): `created/in_progress/waiting_otk/
  rework/closed` — единый словарь `NARYAD_STATUS` + `NARYAD_STATUS_LABELS`
  (`server/src/lib/naryad-status.ts`).
- ✅ **Перф-проблем GAS нет** (реляционная БД, индекс по `orderNumber`) —
  очередь ОТК/списки мастеров отвечают мгновенно.

## Следующий шаг

0. [ ] **(опц.) Живая проверка императивного напоминания плагина на ~48%
   (Этап 34)** — остаётся опциональной: в короткой сессии контекст до порога
   не доходит, напоминание не воспроизводится (граница фазы/порог обычно
   достигаются только в длинной сессии). Статика и поведение покрыты probe:
   `tsc --noEmit` exit 0, **119 passed / 0 failed**
   (`.artifacts/verification/handoff-threshold-no-compact-final.md`).
0. [x] **Правки драйвера session-loop F1+F2+F3 (Этап 32)** — done, вердикт
   PASS (`.artifacts/verification/ralph-loop-fixes-verify.md`). **Остаток
   закрыт 19.10.2026: живой smoke PASS 7/7**
   (`.artifacts/verification/ralph-loop-live-smoke.md`) — RESUME-итерация 5,
   exit 3, маркер создан, новый бриф принят, гигиена выполнена.
   **Остаток этапа (коммит + тег + спека) закрыт:** `ralph-loop.ps1` →
   коммит `55863ad` (тег `v0.32-loop-driver-fixes`), актуализация
   `docs/specs/agent-loop.md` → `56b2a95`.
0. [x] **(опц.) Ужесточить resume-промпт против D1 — закрыто в Этапе 33
   (21.10.2026).** Якорь на `approved_plan`-бриф устранён: промпты драйвера
   требуют брать единственный источник действия из `next_action` самого
   свежего брифа, при противоречии порядок действий задаёт `next_action`
   (scope не расширяется); раздел «Источник действия» в
   `docs/specs/agent-loop.md` синхронизирован. Коммит `4cb4a10`, тег
   `v0.33-d1-resume-prompt`
   (`.artifacts/verification/commit-d1-resume-prompt-verify.md`).
0. [x] **Преднастройки сессии (session-bootstrap, Этап 29)**: контракт
   `instructions/session-bootstrap.md` (в `opencode.json → instructions`),
   плагин `.opencode/plugin/session-bootstrap.ts` (первый ход, гейт
   orchestrator, ветка `.opencode/session/config.json` через `stat`, probe
   48/48, импорт в opencode доказан), wiring — `.gitignore` (`.opencode/session/`)
   + поле `session_config` в frontmatter брифа (`session-loop.md`,
   `handoff.md`), спека `docs/specs/session-bootstrap.md` (правило первого
   ответа, схема A+B+C, resume-ветка, связь с циклом, плагин, границы,
   доказательства) + правки `AGENTS.md` (пункт 0 ритуала читает
   `session_config`/`config.json`; преднастройки в control plane).
   `server/**` не менялся.
0. [x] **Живое напоминание плагина первого хода — закрыто 19.10.2026
   (Этап 31, вердикт НЕ ДЕФЕКТ).** Доказательство: JSONL-лог
   `.artifacts/plugin-debug.log` (первый ход: `hasAssistant:false` →
   `branch:"with-config"`, `injected:true`; далее `skip-not-first-turn`) +
   цитата модели драйвер-сессии iter-3 «инъецированное напоминание…»
   (`.opencode/handoff/handoff-261016-120450.md`). Root cause —
   `.artifacts/plugin-debug-root-cause.md`.
0. [x] **Цикл session-loop «исполнение → handoff → restart» (Этап 28)**:
   контракт `instructions/session-loop.md` (в `opencode.json → instructions`),
   плагин `.opencode/plugin/handoff-threshold.ts` (порог `ND_HANDOFF_THRESHOLD`
   = 0.58, только orchestrator, probe 58/58, импорт в opencode доказан),
   драйвер `.opencode/loop/ralph-loop.ps1` + `run-agent-loop.cmd` (dry
   continue→done exit 0, лимит exit 3 через лаунчер, runtime в `.gitignore`),
   документация — `docs/specs/agent-loop.md` (триггер/frontmatter/resume/
   драйвер/плагин/guardrails/ручной end-to-end шаг) + ADR-012 «handoff+restart
   вместо lossy-компакшена» + правки `AGENTS.md` (пункт 0 ритуала читает
   frontmatter брифа и `state.json`; цикл в control plane). Доказательства —
   `.artifacts/verification/{handoff-threshold-verification,ralph-loop-dry-run}.md`,
   полный прогон драйвера 16.10 (argv-стаб, ветка таймаута → exit 4) —
   `.artifacts/verification/session-loop-driver-dry-run.md`;
   `server/**` не менялся.
0. [x] **Первый реальный (не dry) прогон цикла + живое срабатывание порога
   плагина** — только по явному согласию пользователя: сначала
   `run-agent-loop.cmd -Dry` (см. «Ручной end-to-end шаг» в
   `docs/specs/agent-loop.md`), затем `run-agent-loop.cmd -Task "…"
   -MaxIterations N` (`--auto` auto-approve permission-`ask`) с наблюдением за
   логами `.opencode/loop/logs/` и брифами; напоминание плагина проверить на
   первом длинном ходе (порог настраивается `ND_HANDOFF_THRESHOLD`). Сейчас
   живого смоук usage модели и реального запуска не было (ограничения
   верификации) — **выполнено 16.10.2026:** реальный прогон драйвера exit 0; плагин `handoff-threshold` сработал вживую на первом ходе (контекст ~64%).
0. [x] **Гигиена рабочего дерева для argos-агентов + авто-чтение handoff
   (Этап 27)**: `instructions/hygiene.md` (6 правил чистоты рабочего дерева)
   подключён в `opencode.json → instructions` (заодно убрана «висячая» запятая
   после блока `mcp`); `AGENTS.md` — указатель на `hygiene.md` (Do + Control
   plane) и пункт 0 ритуала старта (авто-чтение свежего handoff из
   `.opencode/handoff/` со сверкой со `STATUS.md`/`git log`). Почему так:
   argos-промпты встроены в кэш плагина (`@nest4869/argos` v0.1.1) и правке не
   поддаются, `argos.json` полей инструкций агентам не поддерживает —
   проектные `instructions` единственный путь доставить их и orchestrator, и
   всем специалистам. Проверки: статика PASS
   (`.artifacts/verification/hygiene-instructions-static-check.md`), инъекция в
   свежем процессе PASS (`opencode run` вернул 6 файлов инструкций, включая
   `hygiene.md`), поведенческий тест PASS, правило handoff PASS 4/4
   (`.artifacts/verification/handoff-rule-check.md`). **Остаток закрыт
   16.10.2026** (пробы субагентов видят `hygiene.md`; evidence —
   `.artifacts/verification/`). Тег `v0.28-argos-hygiene`
   (коммит — задача t2); `server/**` не менялся.
0. [x] **Схема «два терминала: планировщик → MCP-мост → исполнитель»
   удалена** (14.10.2026, ADR-011): контур (`.opencode/agents/nda-planner.md`,
   `nda-executor.md`, `.opencode/queue.jsonl`, `tools/mcp-orchestrator/`) убран
   из рабочего дерева, упоминания вычищены из `AGENTS.md`/`.gitignore`;
   `docs/specs/agent-delegation.md` помечен deprecated (сохранён как
   исторический контракт), ADR-010 — Superseded, новый ADR-011 «Переход на
   argos-оркестратор». **Актуальная оркестрация — argos** (плагин
   `@nest4869/argos`; точка входа `opencode --agent orchestrator`; задачи
   специалистам-исполнителям — через `register_task_groups`/`dispatch_tasks` →
   `submit_task_result`; на Windows tmux-панели пропускаются, специалисты в
   изолированных сессиях). История цикла — в записи Этапа 25 (выше) и в
   `docs/specs/adr/ADR-010-*.md`; `server/**` и демо-пароли не менялись.
0. ✅ **Набор скиллов opencode перестроен под проект (Этап 22)**: удалены
   `brainstorming`/`writing-plans`/`systematic-debugging` (23 файла, включая
   мета-тесты `test-academic.md`/`test-pressure-*.md` — чужая разработка);
   добавлены и адаптированы под OpenCode `diagnosing-bugs`, `domain-modeling`,
   `codebase-design`, `writing-for-agents`, `code-review`, `grilling` (13
   файлов). Ручные точки входа — `/grill-with-docs`, `/code-review`;
   ADR в `docs/specs/adr/`; PowerShell-шаблон HITL для Windows; `tdd` и
   issue-tracker-зависимые навыки не переносились осознанно (unit-раннера и
   трекера в проекте нет). Новые артефакты: `GLOSSARY.md`,
   `docs/specs/skills-layout.md`. Проверки: `opencode debug skill` — 11
   проектных скиллов (старых нет), `opencode debug config` — обе команды и
   оба MCP `enabled: true`, grep по мёртвым ссылкам чисто, build+check PASS.
   Коммит `7dee273`.
0. ✅ **Справочник документов изделия (КД) в БД и UI (Этап 19)**: модели
   `ProductDoc`/`ProductDocLink` (связь many-to-many из-за неуникального
   `Catalog.designation`), миграция `20261001061410`, массовый импорт
   `манифест.md` скриптом (`npm run docs:import`, только строгие совпадения
   обозначения; 48 отсутствующих позиций — в игнор), API `/api/product-docs`
   (`?partCode=`, `/counts`), кнопка 📄 + счётчик «КД: N» + панель по типам в
   дереве номенклатуры и в плоском поиске. Факт в БД: **895** документов /
   **1293** связи / **785** позиций; повторный импорт идемпотентен. Проверки:
   build+check PASS, API-проба 12/12, UI-проба браузером (785 счётчиков, 0
   JS-ошибок, 0 упавших запросов).
0a. ✅ **Единый демо-пароль `121212` + разблокированные E2E (Этап 20)**:
   `set-passwords.ts` переведён на обход всех `Employees` и минимум 6 символов
   (иначе 6-символьный пароль не проходил бы проверку скрипта); пароль задан
   на обоих контурах (MOSD 5/5, стенд **6/6** включая несидового `def`);
   синхронизированы `employees.json`, `.secrets/e2e-env.ps1`, `config.py`;
   поправлен устаревший сентинел «старый пароль `123`» в `test_auth_flow.py`.
   Проверки: HTTP-логин 6/6 (`121212` → 200, `123` → 401), независимая
   bcrypt-сверка **стенд 6/6** и **MOSD 5/5**, build+check PASS, полный E2E
   **164 PASS / 0 FAIL**, стенд чист (сирот 0, тестовых остатков 0).
0b. [ ] **Демо-пароль `121212` → реальный перед публикацией** — по решению
   пользователя сейчас режим демо/тест, замена отложена осознанно. Один
   `npm run passwords -- <новый>` на обоих контурах + правка
   `employees.json`/`.secrets`/`config.py`/доков.
0c. ✅ **Удобное удаление группы номенклатуры + каскад КД (Этап 21)**: `DELETE
   /prefix/:prefix` (группа по префиксу одним действием), каскад `ProductDocLink`
   в обоих delete-эндпоинтах (боевые ссылки → 409 с `refs`), идемпотентность
   (`P2025`/пусто → 204), кнопка «Удалить всю группу» у контейнеров (дерево +
   плоский поиск), правка скрыта у виртуальных узлов. Проверки: build+check
   PASS; `catalog_crud` 15/15, `dict_catalog` 34/34, `master` 12/12, `admin`
   5/5; UI-репро дерева (`Группа удалена (2)`, узел исчез). Группа `22` по
   решению пользователя удалена полностью (`DELETE /prefix/22`: 142 позиции +
   162 связи-КД), стенд: `Catalog` 2061, `ProductDocLink` 1131, топ-уровней 21;
   `test_dict_catalog` привязан к `max(top)+1` и не оставляет строку `22`.
0d. (по желанию) **Добавление/правка единичных документов через UI** — сейчас
   только просмотр; массовый импорт сделан, можно планировать отдельным этапом.
0c. ✅ **Пикер родителя в модалке каталога (Этап 18)**: плоский `<select>`
   (`~2208` опций) заменён компактным сворачиваемым деревом с поиском —
   назначать местонахождение новой/правки позиции удобно; путь к выбранному
   родителю авто-раскрывается, выбор пересчитывает автокод для не-admin.
   Проверки: E2E 15/15 + 34/34 + 5/5, UI-probe (дерево/поиск/корень/edit).
0b. ✅ **Серая заглушка «Не задано» (Этап 18b)**: пустой dict-select в модалке
   каталога показывает серое «Не задано» (вместо «—»), реальные значения —
   обычным цветом; сущность в словари не добавляется. Проверки: E2E 34/34 +
   15/15, UI-probe (создание/правка).
0c. ✅ **«Не задано» для всех пустых/нулевых полей (Этап 18c)**: любой пустой или
   равный 0 text/number-поле модалки (кроме «Код») показывает серое
   «Не задано»; number-0 не светится, при сохранении без правок значение 0
   сохраняется. Проверки: E2E 34/34 + 15/15, UI-probe (создание, правка
   `1.1.1`, правка `13.14.6` c `parentQty=0` → снова 0).
   **Далее (по желанию):** фаза «автозаполнение» (выбранное «ещё кое что») —
   сначала обсудить сценарий, затем план; (опц.) Excel-импорт как merge
   (Excel = резерв, БД+UI = источник правды); (опц.) пересмотр старых пустых
   словарных значений мастером через редактор.
1. ✅ **Справочники каталога + автогенерация кода (Этап 17)**: 5 словарных полей
   каталога + модель `DictionaryValue` (ADR-009), автокод из дерева с
   материализацией контейнеров, `next-code`, строгий UI-ввод / лояльный импорт,
   `dict:migrate` (чистка `#N/A` и мусора, коды не меняются). Проверки: E2E
   `test_dict_catalog.py` **34/34**, регресс catalog_crud 15/15 + admin 5/5 +
   master 12/12.
2. ✅ **Смена боевых паролей ролей** (Этап 15): один пароль на
   `admin/master/shift/operator/otk`, задан на обоих контурах; seed больше не
   сбрасывает пароли при деплое (`update: {}`). Проверки: E2E 31/31, bizcycle 51/51.
3. ✅ **Регистрация + роль Admin + администрирование сотрудников** (Этап 14):
   оператор — самозапись на `/login`, начальники/ОТК создаются админом в `/admin`,
   superuser-доступ. API-smoke 24/24, UI-probe 15/15, E2E 31/31, bizcycle 51/51.
4. ✅ **Безопасность перед публикацией** (Этап 13): rate-limit `/login`,
   refresh-токен в `httpOnly`-cookie, access только в памяти JS, блокировка
   логина, helmet, секреты из env принудительно в production. https наружного
   контура уже даёт Tailscale Funnel.
5. ✅ **Web Push уведомления на телефон (Фаза 2 уведомлений)** — реализовано
   (Этап 12): PWA + Service Worker, `PushSubscription` + `/api/push/*`,
   `web-push` (VAPID из `.env`) при уведомлении роли/оператора. Ожидает ручного
   подтверждения push на телефоне (Android/iOS 16.4+, «на главный экран»).
5. (опц.) Локальный производственный контур (сервер в цехе + Wi-Fi рабочих +
   VPN ответственных + https/PWA/push + бэкап + автозапуск) — отдельным
   планом-контекстом (развилки: железо Linux/Windows, доступ рабочих через
   tailnet vs Wi-Fi + свой CA, тип VPN).
6. (опц.) Проверить автовосстановление стека после полной перезагрузки Windows
   (ожидается: Docker Desktop поднимается сам, `restart: unless-stopped` поднимает
   контейнеры без ручных команд).

## Активный URL

- Локальный dev: `http://localhost:3000` (`GET /health` — `{status:'ok', db:'ok'}`).
- Локальная БД для MCP: `postgresql://production_user@localhost:5432/MOSD` —
  Windows-PostgreSQL 18 (служба `postgresql-x64-18`), пароль в
  `tests/e2e/.secrets/pgpass` (**только пароль, без `host:port:db:user:` и без
  перевода строки** — иначе `{file:…}` в `opencode.json` ломает URL). Тот же пароль
  лежит в `server/.env` (`DATABASE_URL`) — это источник правды при восстановлении.
  Проверка: `opencode mcp list` → `✓ postgres connected`.
- **Глобальный (Tailscale Funnel):** `https://el-konstr04.tail13402b.ts.net`
  (проброс на `127.0.0.1:3000`, без установки чего-либо на клиенте). Проверен
  через интернет: `/health` 200, `/login` рендерится.

## Справочники

- Архитектура/роли/данные: `docs/specs/architecture.md`, `docs/specs/roles.md`,
  `docs/specs/data-model.md`.
- Словари каталога + автокод: `docs/specs/dictionaries-catalog.md`, ADR-009.
- E2E-алгоритм запуска: `docs/testing/e2e-runbook.md` (актуален: полный набор
  9 файлов — **164 PASS / 0 FAIL** против `localhost:3000`, 01.10.2026).
- VBA REST-интеграция: `server/docs/vba-integration.md`.
- Оркестрация агентов: argos-оркестратор — ADR-011
  (`docs/specs/adr/ADR-011-transition-to-argos-orchestrator.md`); прежний контур
  «планировщик → MCP-мост → исполнитель, два терминала» —
  `docs/specs/agent-delegation.md` (deprecated, исторический контракт).
- Цикл длинной задачи (session-loop): `docs/specs/agent-loop.md` + ADR-012
  (`docs/specs/adr/ADR-012-handoff-restart-over-lossy-compaction.md`);
  контракт — `instructions/session-loop.md`.
- Преднастройки сессии (session-bootstrap): `docs/specs/session-bootstrap.md`;
  контракт — `instructions/session-bootstrap.md`, плагин —
  `.opencode/plugin/session-bootstrap.ts`, конфиг —
  `.opencode/session/config.json` (gitignored).
- Отчёт с приоритетами паритета: `docs/reports/2026-09-10-future-architecture-review.md`.