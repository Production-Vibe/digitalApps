# Session-bootstrap — преднастройки сессии (оркестратор)

Сессия оркестратора стартует с преднастроек: режим исполнения, разрешения и
контекст выясняются одним вопросом и фиксируются в
`.opencode/session/config.json` (gitignored). Resume-цикл наследует этот
конфиг вместо повторного опроса. Контракт цикла —
`instructions/session-loop.md`; шаблон брифа — `.opencode/commands/handoff.md`.

Инструкция действует **только для сессий оркестратора** (`context.agent:
"orchestrator"`): исполнители-специалисты начинают работу сразу,
преднастройки их не касаются.

## Правило первого хода

**Первый ответ сессии оркестратора — преднастройки через `question` tool, а не
классическое начало работы.** До получения ответов работа не стартует: планы не
утверждаются, задачи не диспатчатся, коммиты и деплой не выполняются. Один
`question`-запрос несёт схему A+B+C ниже — только настройки, объём работы при
этом не обсуждается.

## Схема преднастроек (A + B + C)

Формат файла `.opencode/session/config.json` (канон):

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

### A — режим исполнения

- `mode` — `interactive` (диалог с пользователем; **дефолт**) или `driver`
  (работа идёт циклом через `.opencode/loop/ralph-loop.ps1`).
- `driver` — `{ enabled, threshold, maxIterations, timeoutMinutes }`;
  дефолты: `enabled: false`, `threshold: 0.58` (порог handoff-плагина),
  `maxIterations: 10`, `timeoutMinutes: 30`. Заполняется осмысленно, только
  когда выбран `mode: driver`; при `interactive` остаётся дефолтным.

### B — разрешения

- `autonomy` — `approve-once` (**дефолт**: план и границы утверждаются одним
  вопросом, дальше работа идёт без пауз) или `pause-each-barrier`
  (пауза на каждом барьере: коммит, деплой, выход за scope).
- `permissions` — консервативные дефолты, совпадающие с
  `instructions/safety.md`: `deploy: false`, `commit: false`, `autoCommit:
  false`, `push: false`. Каждое «да» задаётся пользователем явно в этом
  же вопросе.

### C — контекст

- `scope` — одна строка: цель сессии («что именно делаем»).
- `language` — `ru` (дефолт проекта).
- `skills` — массив рекомендуемых скиллов (из `.opencode/skills/` и фазовой
  таблицы `AGENTS.md`); может быть пустым — тогда скиллы выбираются по фазе
  на ходу.
- `agent` — всегда `"orchestrator"`: преднастройки относятся только к нему.

## Resume-ветка

Если выполняются **оба** условия:

1. `.opencode/session/config.json` существует, парсится как JSON и содержит
   `updatedAt`;
2. свежий handoff валиден по правилам resume из
   `instructions/session-loop.md` (самый поздний файл в `.opencode/handoff/`,
   состояние не противоречит `STATUS.md`/`git log`),

— полный опрос не проводится: показать унаследованный конфиг (режим,
разрешения, scope — кратко) и спросить через `question` tool только
**«подтвердить / изменить»**. Ответ «подтвердить» — конфиг остаётся как есть
(updatedAt обновлять не нужно); «изменить» — уточняются только названные
поля.

## Запись конфига

Ответы пользователя записываются в `.opencode/session/config.json` **до
начала работы**: JSON строго по схеме выше, допустимые значения
(`mode`, `autonomy`) — из описания секций A+B, `updatedAt` — текущий момент
в ISO-8601. Критерий готовности: файл существует и разбирается как JSON
(например, `Get-Content .opencode/session/config.json | ConvertFrom-Json` без
ошибок).

## Связь с циклом

Свежий handoff несёт во frontmatter `session_config: <path>` (обычно
`.opencode/session/config.json`) — см. контракт в `instructions/session-loop.md`
и шаблон `.opencode/commands/handoff.md`. Следующая сессия цикла читает путь
из брифа и, при выполнении условий resume-ветки, наследует конфиг.
