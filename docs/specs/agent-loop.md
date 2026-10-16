# Цикл session-loop: исполнение → handoff → restart

Статус: спецификация инструментального контура (engineering-работа; `server/**`
не менялся). Контракт цикла — `instructions/session-loop.md` (подключён в
`opencode.json → instructions`); решение «handoff+restart вместо
lossy-компакшена» — ADR-012
(`docs/specs/adr/ADR-012-handoff-restart-over-lossy-compaction.md`).
Источники правды — фактические файлы `.opencode/plugin/handoff-threshold.ts`,
`.opencode/loop/ralph-loop.ps1`, `run-agent-loop.cmd`.

## Зачем цикл

Длинная задача живёт дольше одной сессии. Компакшен одной долгой сессии —
lossy: повторные компакшены накапливают шум и галлюцинации, теряется «почему»
(диагноз зафиксирован в контексте ADR-010). Команда `/handoff` (Этап 24) дала
переносимый бриф, но остановилась на ручном переносе. Цикл замыкает связку:
работа идёт последовательностью **свежих сессий**, нить живёт на диске
(бриф + машинное состояние), а не в контексте движка.

```
исполнение (свежая сессия, orchestrator)
  → триггер: контекст ≥ порога | граница фазы | вопрос пользователю (blocked)
  → /handoff <для чего следующая сессия>
       → .opencode/handoff/handoff-<yyMMdd-HHmmss>.md  (frontmatter цикла)
  → ход завершён
  → драйвер читает frontmatter + .opencode/loop/state.json
  → resume-режим или холодный старт
  → следующая итерация (свежая сессия)
```

## Триггер handoff

- **Контекст ≥ ~55–60%** — напоминание дописывает плагин
  `handoff-threshold.ts` (см. «Плагин»); не дожидаться компакшена.
- **Граница фазы/группы** — завершилась утверждённая группа работ, даже если
  контекст мал.
- **Вопрос/блокер** — задача вне утверждённого scope или нужен ответ
  пользователя → бриф с `loop: blocked`.

На триггере: `/handoff <для чего следующая сессия>` → бриф в
`.opencode/handoff/` → ход завершается. **Ход без записанного брифа теряет
нить** — драйвер такую итерацию не продолжает, а останавливает цикл
(exit 1).

## Контракт frontmatter

В начале брифа — машиночитаемый YAML-frontmatter с полями цикла:

| Поле | Значения | Смысл |
|---|---|---|
| `loop` | `continue` \| `done` \| `blocked` | цикл продолжается / завершён / ход за пользователем |
| `iteration` | целое | номер итерации (с каждой новой сессией +1) |
| `approved_plan` | путь-ссылка | утверждённый план (`docs/specs/`, `.opencode/design/` или отчёт этапа) |
| `next_action` | короткая строка | одно конкретное действие для следующей сессии |

Далее — человекочитаемая «живая нить» по формату `/handoff`: что в работе и
почему, следующий шаг, предложенные скиллы; **ссылки вместо копий**, допущения
помечены, секреты вырезаны. Без поля `loop` фронтматтер не считается
валидным (драйвер → останов как ошибка).

## Resume-режим

Свежий handoff валиден, когда это самый поздний файл в `.opencode/handoff/`
и его состояние не противоречит `STATUS.md`/`git log` (пункт 0 ритуала
старта в `AGENTS.md`). Если он валиден и `loop: continue` — сессия стартует в
resume-режиме:

- продолжение фазы исполнения по **уже утверждённому** плану
  (`approved_plan`): pre-approval не повторяется, работа идёт сразу с
  `next_action`;
- работать только в утверждённом scope: план не пересматривается, объём не
  расширяется;
- задача вне scope → стоп: бриф с `loop: blocked` и вопрос пользователю,
  продолжение — только после ответа.

Машинное состояние цикла — `.opencode/loop/state.json` (ведёт драйвер):
`iteration`, `loop`, `phase`, `approved_plan`, `task`, `updatedAt`. Resume
драйвер даёт только при согласованности брифа и `state.json` (`loop`,
`iteration`, `approved_plan` совпадают при наличии в обоих). Любое расхождение
или отсутствие данных → **холодный старт** с полного pre-approval (зафиксировать
`approved_plan` в `docs/specs/` или `.opencode/design/` — и дальше исполнять
только утверждённый scope).

## Драйвер

Файлы: `.opencode/loop/ralph-loop.ps1` (PowerShell 5.1, UTF-8 **с BOM**) +
корневой лаунчер `run-agent-loop.cmd` (ASCII в стиле `run-site.cmd`,
пробрасывает аргументы и код выхода).

Запуск:

```powershell
run-agent-loop.cmd [-Task "..."] [-MaxIterations N] [-TimeoutMinutes M]
                   [-Threshold 0.58] [-Dry]
# эквивалент:
powershell -NoProfile -ExecutionPolicy Bypass -File .opencode\loop\ralph-loop.ps1 [...]
```

Важно: `-Threshold` драйвера подставляется **только в текст промпта** итерации
(промпт напоминает агенту про порог) и **не влияет на плагин**. Порог
напоминания плагина — отдельный, независимый рычаг: env `ND_HANDOFF_THRESHOLD`
(дефолт 0.58). Задав `-Threshold 0.7`, вы **не** сдвинете напоминание плагина —
оно по-прежнему сработает на 0.58 (или на значение `ND_HANDOFF_THRESHOLD`,
если задано).

Поведение итерации:

1. чтение свежего `handoff-*.md` (frontmatter) и `state.json`; стоп по
   `loop: done`/`blocked` ещё до запуска;
2. выбор режима: `continue` + согласованный `state.json` → **resume-промпт**
   (без pre-approval, сразу `next_action`), иначе → **cold-промпт** (пройти
   pre-approval, зафиксировать `approved_plan`);
3. запуск **свежей сессии** `opencode run --agent orchestrator --auto
   "<промпт>"` (без `-c/--continue`; в текущем CLI `opencode` флаг `-p` — это
   `--password`, поэтому промпт идёт позиционным `message`);
4. жёсткий таймаут на итерацию (`-TimeoutMinutes`, дефолт 30) + kill-on-hang
   (`taskkill /T /F`); stdout/stderr/промпт каждой итерации — в
   `.opencode/loop/logs/iter-N.{out,err}.log` / `iter-N.prompt.txt`;
5. после итерации — повторное чтение frontmatter: нет брифа / нет валидного
   `loop` → останов «нить потеряна» (слепое продолжение запрещено);
6. запись `state.json` и переход к следующей итерации.

Коды выхода: `0` = `done` (цикл закрыт), `1` = ошибка (нет брифа / битый
frontmatter / неизвестный `loop`), `2` = `blocked` (ход за пользователем),
`3` = лимит итераций (дефолт `-MaxIterations` 10), `4` = таймаут итерации.

Режим `-Dry`: opencode не запускается, брифы и `state.json` пишутся в
песочницу `.opencode/loop/dry-run/` (реальный `.opencode/handoff/` не трогается,
фейковые брифы не подменяют живую нить).

Runtime цикла gitignored (корневой `.gitignore`): `.opencode/loop/logs/`,
`.opencode/loop/state.json`, `.opencode/loop/dry-run/`; сам `ralph-loop.ps1`
трекается.

## Плагин

`.opencode/plugin/handoff-threshold.ts` — автодискавери opencode (glob
`.opencode/plugin/*.{ts,js}`, запись в конфиг не нужна). Регистрирует ровно
один хук — `experimental.chat.messages.transform`:

- **гейт:** только orchestrator (пустой `agent` последнего user-сообщения =
  дефолтная сессия orchestrator; чужим субагентам — тишина);
- **расчёт:** usage = сумма `tokens` последнего assistant-сообщения с
  ненулевым usage (`input+output+reasoning+cache.read+cache.write`), лимит =
  `limit.context` модели из `client.provider.list()` (кэш на плагин);
- **порог:** env `ND_HANDOFF_THRESHOLD` (доля 0..1), дефолт **0.58**
  (≈ «55–60%» из контракта); `ratio >= порога` → напоминание;
- **действие:** в конец последнего text-парт последнего user-сообщения
  дописывается «Контекст заполнен на ~X%. Сделай handoff по
  instructions/session-loop.md и заверши ход.» — идемпотентно (по маркеру,
  повтор не удваивает), аддитивно к argos (чужие преамбулы не затираются);
- **фолбэк usage** (задокументирован в шапке файла): нет ненулевого usage →
  оценка по объёму (сумма длины text/reasoning и текстовых выводов tool-частей
  ÷ 4 символа на токен); лимит модели не получен → знаменатель 200 000;
- **безопасность:** любая ошибка внутри хука гасится `try/catch` (лог
  `[handoff-threshold]`), цикл агента не прерывается; экспорт — только
  `default` (иначе opencode трактовал бы именованные экспорты как отдельные
  плагины), чистые функции порога доступны через свойство `plugin.pure`
  (probe — `.artifacts/probe-handoff-threshold.ts`).

## Guardrails

- **Реальный прогон — только по явному согласию пользователя.** Драйвер зовёт
  `opencode run --auto`: auto-approve только permission-`ask` (deny-правила
  остаются), но это всё равно автоматическое разрешение — см. «Ручной
  end-to-end шаг».
- **Секреты.** Брифы пишет `/handoff` с редакцией токенов/паролей/`.env`;
  логи и промпты драйвера секретов не содержат (скан при верификации — 0
  совпадений). `server/.env`, `.secrets/` и прочее — по `instructions/safety.md`.
- **Слепое продолжение запрещено:** итерация без записанного брифа или с
  неизвестным `loop` → стоп с кодом 1.
- **Scope:** resume работает только по утверждённому плану; всё вне scope —
  `blocked` + вопрос пользователю, не «доделать на глазок».
- **Плагин не ломает argos:** один хук, аддитивная вставка, идемпотентность,
  ошибки гасятся; чужим субагентам не мешает (гейт по `agent`).
- **Граница контура:** цикл — инструментальный контур
  (`instructions/`, `.opencode/`); `server/**`, БД и демо-пароли он не трогает,
  деплой — отдельное явное решение.
- **Windows-кодировки:** `.ps1` сохранён с BOM (PowerShell 5.1 читает без BOM
  как ANSI и ломает кириллицу), лаунчер — ASCII-only.

## Ручной end-to-end шаг (для пользователя)

1. **Сухая проверка** (ничего не запускает):
   `run-agent-loop.cmd -Dry` → ожидаемо итерация 1 `COLD` (симулированный
   бриф `continue`) → итерация 2 `RESUME` → `loop: done`, **exit 0**;
   лог — `.opencode/loop/logs/loop-<stamp>-dry.log`.
2. **Согласие и задача:** решить, что циклу делать (например,
   `-Task "Довести этап по STATUS.md до коммита"`), и явно разрешить
   реальный прогон (`--auto`).
3. **Запуск:** `run-agent-loop.cmd -Task "…" -MaxIterations 3` (запас по
   итерациям; таймаут на итерацию 30 мин).
4. **Наблюдение:** `git status`, `docs/reports/STATUS.md` (что успела сделать
   сессия), брифы `.opencode/handoff/handoff-*.md` (frontmatter), состояние
   `.opencode/loop/state.json`, логи `.opencode/loop/logs/iter-N.*`.
5. **Останов:** коды выхода 0/1/2/3/4 (см. «Драйвер»); `blocked` (2) — ответить
   пользователю и запустить цикл заново; `done` (0) — цикл закрыт. Прервать
   заранее — Ctrl+C; зависшую итерацию драйвер убивает по таймауту сам.
6. **Возврат к обычной работе:** после `done`/ручного останова цикл ничего не
   держит — следующая сессия стартует по общему ритуалу (пункт 0 `AGENTS.md`).

## Проверки (доказательства)

- Плагин: `tsc --noEmit` (strict) exit 0; probe **58/58**
  (`.artifacts/probe-handoff-threshold.log`); импорт модуля opencode-движком
  доказан (`opencode debug info` + top-level маркер), `opencode serve` 10 с без
  ошибок — `.artifacts/verification/handoff-threshold-verification.md`.
- Драйвер: парс PowerShell 0 ошибок; `-Dry` continue→done exit 0; лимит exit 3
  (и через лаунчер); `git check-ignore` 3/3; скан секретов 0; кириллица UTF-8
  байтово — `.artifacts/verification/ralph-loop-dry-run.md`; более полный
  внешний прогон 16.10 (argv-стаб — форма запуска без `--continue` и промпт
  позиционным `message`, ветка таймаута/kill-on-hang → exit 4) —
  `.artifacts/verification/session-loop-driver-dry-run.md`.
- Честные ограничения: **реальный (не dry) прогон цикла не выполнялся**
  (требует согласия на `--auto`); **живое срабатывание порога на настоящем
  usage модели не проверялось** (логика покрыта probe на синтетических
  сообщениях) — наблюдение на первом длинном ходе.

## См. также

- `instructions/session-loop.md` — контракт цикла (подключён в `opencode.json`).
- `docs/specs/adr/ADR-012-handoff-restart-over-lossy-compaction.md` — решение и
  альтернативы.
- `.opencode/commands/handoff.md` — формат брифа; `AGENTS.md` — пункт 0
  ритуала старта (подхват frontmatter и `state.json`).
- `docs/specs/adr/ADR-011-transition-to-argos-orchestrator.md` — оркестрация,
  внутри которой работает цикл.
