# Преднастройки сессии (session-bootstrap)

Статус: спецификация инструментального контура (engineering-работа; `server/**`
не менялся). Контракт — `instructions/session-bootstrap.md` (подключён в
`opencode.json → instructions`). Источники правды — фактические файлы
`instructions/session-bootstrap.md` и `.opencode/plugin/session-bootstrap.ts`
(плюс probe `.artifacts/probe-session-bootstrap.ts` и верификация
`.artifacts/verification/session-bootstrap-verification.md`).

## Зачем преднастройки

Сессия оркестратора стартует с неопределённости: какой режим исполнения
(диалог или цикл-драйвер), что разрешено (коммит/деплой/пуши), какой объём
(scope) и какие скиллы. Без фиксации эти настройки «живут» только в чате и
теряются при рестарте. Преднастройки решают это одним вопросом: ответы
пользователя записываются в **`.opencode/session/config.json`** (gitignored,
блок `.opencode/session/` в корневом `.gitignore`) — и следующая сессия цикла
наследует конфиг вместо повторного опроса.

Контракт действует **только для сессий оркестратора** (`context.agent:
"orchestrator"`): исполнители-специалисты начинают работу сразу,
преднастройки их не касаются.

## Обязательное правило первого ответа

**Первый ответ сессии оркестратора — преднастройки через `question` tool, а не
классическое начало работы.** До получения ответов работа не стартует:
планы не утверждаются, задачи не диспатчатся, коммиты и деплой не
выполняются. Один `question`-запрос несёт всю схему A+B+C ниже — только
настройки; объём работы (scope задачи) при этом не обсуждается — он
фиксируется как строка `context.scope`, а планирование идёт после.

Пример того, что спрашивает первый ход (содержание — по контракту):

- **A — режим:** `interactive` (диалог) или `driver` (цикл через
  `ralph-loop.ps1`), при `driver` — порог/лимит итераций/таймаут;
- **B — разрешения:** `approve-once` или `pause-each-barrier` + явные
  «да» на `deploy`/`commit`/`autoCommit`/`push`;
- **C — контекст:** строка `scope`, язык, рекомендуемые скиллы.

## Схема конфига (A + B + C)

Канон формата `.opencode/session/config.json`:

```json
{
  "mode": "interactive",
  "driver": { "enabled": false, "threshold": 0.58, "maxIterations": 10, "timeoutMinutes": 30 },
  "autonomy": "approve-once",
  "permissions": { "deploy": false, "commit": false, "autoCommit": false, "push": false },
  "context": { "scope": "", "language": "ru", "skills": [], "agent": "orchestrator" },
  "updatedAt": "2026-10-16T00:00:00Z"
}
```

| Секция | Ключ | Допустимые значения / дефолт | Смысл |
|---|---|---|---|
| **A** | `mode` | `interactive` (**дефолт**) \| `driver` | диалог с пользователем или работа циклом драйвера |
| A | `driver.enabled` | `false` (**дефолт**) | активен ли драйвер-контур |
| A | `driver.threshold` | `0.58` (**дефолт**) | порог handoff-плагина (доля контекста) |
| A | `driver.maxIterations` | `10` (**дефолт**) | лимит итераций цикла |
| A | `driver.timeoutMinutes` | `30` (**дефолт**) | таймаут одной итерации |
| **B** | `autonomy` | `approve-once` (**дефолт**) \| `pause-each-barrier` | одним вопросом утвердить план и границы или пауза на каждом барьере (коммит, деплой, выход за scope) |
| B | `permissions.deploy` | `false` (**дефолт**) | разрешён ли деплой |
| B | `permissions.commit` | `false` (**дефолт**) | разрешены ли коммиты |
| B | `permissions.autoCommit` | `false` (**дефолт**) | авто-коммит по завершении этапа |
| B | `permissions.push` | `false` (**дефолт**) | push в удалённый репозиторий |
| **C** | `context.scope` | строка, `""` (**дефолт**) | цель сессии: «что именно делаем» |
| C | `context.language` | `ru` (**дефолт**) | язык сессии |
| C | `context.skills` | массив строк, `[]` (**дефолт**) | рекомендуемые скиллы (из `.opencode/skills/`); пусто → выбор по фазе на ходу |
| C | `context.agent` | всегда `"orchestrator"` | преднастройки относятся только к оркестратору |
| — | `updatedAt` | ISO-8601 | момент записи конфига |

Семантика дефолтов разрешений совпадает с `instructions/safety.md`
(консервативные умолчания: деплой/коммит/пуши — только явное «да»
пользователя). `driver` заполняется осмысленно только при `mode: driver`;
при `interactive` остаётся дефолтным.

## Запись конфига

Ответы пользователя записываются в `.opencode/session/config.json` **до начала
работы**: JSON строго по схеме выше, допустимые значения `mode`/`autonomy` —
из таблицы, `updatedAt` — текущий момент в ISO-8601. Критерий готовности:
файл существует и разбирается как JSON (например,
`Get-Content .opencode/session/config.json | ConvertFrom-Json` без ошибок).

## Resume-ветка

Если выполняются **оба** условия:

1. `.opencode/session/config.json` существует, парсится как JSON и содержит
   `updatedAt`;
2. свежий handoff валиден по правилам resume из
   `instructions/session-loop.md` (самый поздний файл в `.opencode/handoff/`,
   состояние не противоречит `STATUS.md`/`git log`),

— полный опрос не проводится: показать унаследованный конфиг (режим,
разрешения, scope — кратко) и спросить через `question` tool только
**«подтвердить / изменить»**. «Подтвердить» — конфиг остаётся как есть
(`updatedAt` не обновляется); «изменить» — уточняются только названные поля.

**Неинтерактивный режим (драйвер):** когда сессия запущена драйвером session-loop и tool `question` недоступен, подтверждение преднастроек не запрашивается — конфиг считается подтверждённым, работа идёт сразу с `next_action` (см. `instructions/session-bootstrap.md`; дефект живого прогона 16.10.2026).

## Связь с циклом session-loop

Преднастройки — верхний слой над циклом `instructions/session-loop.md`
(спека `docs/specs/agent-loop.md`):

- **Передача по циклу:** свежий handoff несёт во frontmatter
  `session_config: <path>` (обычно `.opencode/session/config.json`) — поле
  обязательно по шаблону `.opencode/commands/handoff.md` (все пять ключей:
  `loop`, `iteration`, `approved_plan`, `session_config`, `next_action`);
- **Resume-наследование:** следующая сессия цикла читает путь из брифа и,
  при выполнении обеих условий resume-ветки, показывает конфиг на
  «подтвердить/изменить» вместо полного опроса (раздел «Resume-режим»
  контракта `instructions/session-loop.md` ссылается на
  `instructions/session-bootstrap.md`);
- **Разделение ответственности:** session-loop решает *когда продолжать*
  (триггер handoff, frontmatter, драйвер, state.json); session-bootstrap —
  *с чего сессия начинается* (первый ответ, конфиг, наследование). Оба
  конкурируют за первый ход только в одном: напоминание плагина
  session-bootstrap всегда адресовано первому ходу, напоминание
  handoff-threshold — последующим (порогу контекста).

## Плагин первого хода

`.opencode/plugin/session-bootstrap.ts` — автодискавери opencode (glob
`.opencode/plugin/*.{ts,js}`, запись в конфиг не нужна). Регистрирует ровно
один хук — `experimental.chat.messages.transform`:

- **гейт по агенту:** только orchestrator (пустой `agent` последнего
  user-сообщения = дефолтная сессия orchestrator — та же семантика, что у
  argos и `handoff-threshold`); чужим субагентам — тишина;
- **детект первого хода:** в `output.messages` нет ни одного
  assistant-сообщения (`isFirstTurn`);
- **ветка по конфигу:** на каждый вызов хука проверяется факт наличия
  `.opencode/session/config.json` как **файла** (`statSync` от
  `input.directory`, ошибка → «нет») — ветка отражает актуальное состояние
  репозитория, а не момент загрузки плагина;
- **действие:** в конец последнего text-парт последнего user-сообщения
  дописывается напоминание (тексты — канон контракта, вербально):

  - конфига нет → `Первый ход: выдай преднастройки сессии через question tool (instructions/session-bootstrap.md).`
  - конфиг есть → `Первый ход: покажи унаследованный конфиг сессии и спроси подтверждение/изменение (instructions/session-bootstrap.md).`

  (в плагине путь подставляется константой `CONTRACT`, см. шапку
  `.opencode/plugin/session-bootstrap.ts`);
- **идемпотентность:** по маркеру (полная строка либо связка «Первый ход:» +
  путь контракта) — повторные вызовы хука за ход ничего не добавляют;
- **аддитивность:** сообщения/части не удаляются, чужие преамбулы и
  напоминания не затираются (при отсутствии text-частей parts дописывается);
- **безопасность:** любая ошибка внутри хука гасится `try/catch` (лог
  `[session-bootstrap]`), цикл агента не прерывается; экспорт — только
  `default` (иначе opencode трактовал бы именованные экспорты как отдельные
  плагины), чистые функции доступны через свойство `plugin.pure` (probe —
  `.artifacts/probe-session-bootstrap.ts`).

### Семантика первого хода и наблюдаемость

- **«Первый ход» в терминах плагина** — первый вызов `messages.transform`,
  чей снапшот (`output.messages` — полная выборка сообщений сеанса из БД) не
  содержит assistant-записей. У **продолжения существующей сессии**
  (`opencode run -s <id>`, `--continue`) снапшот первого вызова уже включает
  прежние assistant-ответы из БД → `hasAssistant:true` → штатная ветка
  `skip-not-first-turn`, даже если для процесса это «первый ход». Это не
  дефект, а следствие семантики снапшота.
- **Наблюдаемость:** мутация transform-хука живёт **только в снапшоте текущего
  шага** и в БД/транскрипцию **не персистится** — «посмотреть по сохранённым
  сообщениям, была ли вставка», невозможно в принципе (ни для session-bootstrap,
  ни для `handoff-threshold`). Суждение «стартовое сообщение пришло без
  вставки» по внешнему виду транскрипции — невалидное свидетельство, оно не
  отличает «инъекция была» от «инъекции не было». Надёжные признаки срабатывания
  — **JSONL-лог плагина** (ветка `branch:"with-config"` → `injected:true`) либо
  **прямая цитата текста моделью**.

## Границы контура

- `.opencode/session/` — runtime, gitignored (конфиг не попадает в git);
- контракт, спека и плагин — инструментальный контур (`instructions/`,
  `docs/specs/`, `.opencode/`); `server/**`, БД и демо-пароли не трогаются;
- преднастройки не отменяют safety-правила: `permissions.* = false` —
  дефолт, продублированный `instructions/safety.md`; «да» в конфиге не
  заменяет явное согласие на деплой/-push (см. guardrails `agent-loop.md`);
- исполнители-субагенты не опрашиваются (гейт по `agent`).

## Проверки (доказательства)

- Плагин: `tsc --noEmit` (strict, `.artifacts/tsconfig.session-bootstrap.json`)
  exit 0; probe **48/48** (`.artifacts/probe-session-bootstrap.log`: детект
  первого хода, гейт агента, ветка fs-конфига, идемпотентность, аддитивность,
  гашение ошибок); импорт модуля opencode-движком доказан (`opencode debug
  info` — плагин в списке `plugins:`, 0 ERROR/WARN —
  `.artifacts/opencode-debug-load-session-bootstrap.log`; top-level маркер —
  `.artifacts/opencode-debug-import-marker.log`); `opencode serve` 10 с без
  ошибок (`.artifacts/serve-sb-{out,err}.log`) — подробности в
  `.artifacts/verification/session-bootstrap-verification.md`.
- Документация: файлы спеки, правки `AGENTS.md` и `STATUS.md` существуют;
  ключи конфига/пути/правило первого ответа сверены с
  `instructions/session-bootstrap.md` и `.opencode/plugin/session-bootstrap.ts`;
  `server/**` не изменён (acceptance этой задачи).
- **Живое срабатывание подтверждено** JSONL-логом 19.10.2026
  (`.artifacts/plugin-debug.log`): на первом ходу `hasAssistant:false` →
  `branch:"with-config"`, `injected:true`, далее — `skip-not-first-turn`;
  плюс прямая цитата модели в драйвер-сессии iter-3 («инъецированное
  напоминание…», `.opencode/handoff/handoff-261016-120450.md`). Диагностика
  симптома «напоминание не наблюдалось» (16.10) завершена вердиктом
  **НЕ ДЕФЕКТ** — root cause и опровержение гипотез H2–H5 в
  `.artifacts/plugin-debug-root-cause.md`.

## См. также

- `instructions/session-bootstrap.md` — контракт преднастроек (подключён в
  `opencode.json`).
- `instructions/session-loop.md` — контракт цикла; поле frontmatter
  `session_config` и resume-наследование конфига.
- `docs/specs/agent-loop.md` — спека цикла session-loop (драйвер,
  handoff-threshold, guardrails).
- `.opencode/commands/handoff.md` — шаблон брифа (пять ключей frontmatter).
- `.opencode/plugin/handoff-threshold.ts` — соседний плагин первого порядка
  (порог контекста), та же гейт/идемпотентность-семантика.
- `AGENTS.md` — пункт 0 ритуала старта (подхват брифа и преднастроек).
