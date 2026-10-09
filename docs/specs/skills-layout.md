# Раскладка скиллов `.opencode/` — что, зачем и почему именно это

Статус: спецификация окружения. Источник правды — фактические файлы в
`.opencode/skills/` и `.opencode/commands/`.

## Принцип отбора

Навык попадает в репозиторий, только если он **заменяет существующий или закрывает
реальную боль проекта**. Навык, который дублирует уже имеющееся, не берётся: дубль —
это два конкурирующих входа в одну фазу, и модель со временем выберет не тот.
Отсюда, например, отсутствие `retro` (цикл отчётов этапа уже зашит в
Definition of Done) и `tdd` (в `server/package.json` нет test-раннера — навыку
не на что опереться).

## Скиллы (`.opencode/skills/`)

OpenCode показывает модели список всех скиллов с их `description`; тело грузится
инструментом `skill` по требованию. Frontmatter: только `name` (== имя каталога),
`description`, опционально `license`/`compatibility`/`metadata`. Неизвестные поля
молча игнорируются — поэтому `disable-model-invocation` (поле Claude Code) убран: в
OpenCode оно ничего не делает и вводит в заблуждение.

| Скилл | Фаза | Роль |
|---|---|---|
| `grilling` | Уточнение задачи | Интервью по кругам: факты ищет агент, решения принимает пользователь. Дерево решений, фронт на раунд. |
| `diagnosing-bugs` | Отладка | Жёсткий гейт: сначала **красный цикл** (одна команда, которая гаснет на этом баге), потом гипотезы, потом фикс + регресс-тест, потом cleanup. Заменяет `systematic-debugging`. |
| `codebase-design` | Проектирование модуля | Словарь глубоких модулей (module / interface / depth / seam / adapter / leverage / locality). Держит рамку для выноса инвариантов из хендлеров в сервисный слой. |
| `domain-modeling` | Термины и ADR | Активная дисциплина: оспаривать термины, сверять код со словарём, вести `GLOSSARY.md` и `docs/specs/adr/` по ходу разговора. |
| `writing-for-agents` | Правка AGENTS/skills/instructions | Как писать документы, которые читает агент: context pointer, два бюджета, progressive disclosure, ведущие слова, pruning. |
| `verification-before-completion` | Завершение | Доказательства, а не утверждения. Оставлен как есть. |
| `webapp-testing` | E2E | Playwright-обвязка. Оставлена как есть. |
| `web-design`, `frontend-design` | Визуальный UI | Дизайн-система и эстетика. Аналогов в выбранном наборе нет — оставлены. |
| `doc-coauthoring` | Отчёты и спеки | Совместное написание документа + тест на читателя. Оставлен как есть. |

## Команды (`.opencode/commands/`)

В OpenCode нет user-invoked-only скилла: всё в `skills/` доступно модели. Поэтому
то, что должно запускаться **только по решению человека**, живёт в
`.opencode/commands/` — там команда появляется только по `/<name>`.

| Команда | Что делает |
|---|---|
| `/grill-with-docs` | Загружает `grilling` + `domain-modeling`, добавляет привязку к репозиторию и правило «итог интервью — файл в `docs/specs/`». |
| `/code-review` | Загружает `code-review`, уточняет, что спека — файл в `docs/`, и трекера задач здесь нет. |

## Что не перенесено и почему

- **Issue-tracker-зависимые** (`to-spec`, `to-tickets`, `implement`, `implement-spec`,
  `triage`, `wayfinder`, `setup-matt-pocock-skills`): рассчитаны на
  GitHub Issues/GitLab через `gh`. Проект живёт по схеме «этап → отчёт в
  `docs/reports/` → запись в `STATUS.md`»; второй трекер рядом создал бы два
  источника правды по задачам.
- **`ask-matt`**: скилл-навигатор upstream маршрутизирует по ~20 скиллам/командам,
  которых в проекте нет, — прямой порт дал бы висячие ссылки. Его роль выполняют
  раздел «Навигатор: как выбирать» (ниже), таблица фаз в `AGENTS.md` и ручные
  команды в `.opencode/commands/`.
- **`tdd`**: в `server/` нет test-раннера (`build` и `check` только, тесты — Playwright
  E2E). Навык требует цикла «красный → зелёный» и без раннера висит без опоры.
  Вернётся вместе с выбором раннера (vitest или node:test) — первым кандидатом на
  чистые функции в `server/src/lib/*`.
- **`retro`, `handoff`, `research`, `prototype`, `wait-what`, `wizard`, `teach`,
  `improve-codebase-architecture`, `to-questionnaire`, `pr`**: либо дублируют
  существующий цикл (отчёт этапа), либо требуют инфраструктуры, которой нет
  (GitHub PRs, bash-скрипты, сеть), либо перекрыты `explore`-субагентом.

## Адаптация под проект

1. `Call the Skill tool with "X"` → «загрузи навык `X` инструментом `skill`».
2. `CLAUDE.md` → `AGENTS.md`; `docs/adr/` → `docs/specs/adr/`; нумерация ADR —
   `ADR-NNN-<slug>.md` (уже используется, не перенумеровывается).
3. Примеры переведены в домен (наряд, запуск, ОТК, ПА), а не `processOrder`/`cart`.
4. `scripts/hitl-loop.template.sh` (bash) заменён на PowerShell-версию — проект
   работает в Windows PowerShell 5.1.
5. `agents/openai.yaml` из исходного набора удалён: это метаданные другого рантайма,
   в OpenCode они не читаются.
6. В русскоязычном проекте триггеры продублированы по-русски прямо в `description` —
   решение о загрузке скилла принимается по тому, что пользователь написал.

## Навигатор: как выбирать

Карта выбора навыка под задачу — аналог upstream `ask-matt`, но поверх **наших
11 навыков** и без висячих ссылок. Триггерная таблица «фаза → навык» живёт в
`AGENTS.md`; здесь — маршруты, а не перечень.

**Основной маршрут (задача → готово):**

`grilling` (уточнение) → по ходу `domain-modeling` (термины/ADR) и
`codebase-design` (форма модуля) → реализация (профильный доменный навык) →
`code-review` (ревью диффа по двум осям) → `verification-before-completion`
(доказательства, а не утверждения). Ручные точки входа: `/grill-with-docs`
(интервью → документ в `docs/specs/`) и `/code-review`.

**Он-рампы (входят в маршрут по ситуации):**

- «сломалось / падает / медленно» → `diagnosing-bugs` (красный цикл → гипотезы →
  фикс → регресс-тест).
- «термин разъехался / решение навсегда» → `domain-modeling`.
- «как спроектировать модуль» → `codebase-design`.

**Подсистемы:**

- Визуальный UI → `web-design` (системный/структурный) или `frontend-design`
  (эстетика).
- E2E → `webapp-testing`; документы и спеки → `doc-coauthoring`.
- Правка агентских инструкций (`AGENTS.md`, `skills/`, `instructions/`) →
  `writing-for-agents`.
- Любая завершённая работа → `verification-before-completion`.

## Синхронизация с upstream

6 навыков — производные от `github.com/mattpocock/skills` (адаптация, не копия).
Остальные 5 к upstream отношения не имеют и в синхронизации не участвуют.

- **Источник:** `https://github.com/mattpocock/skills` (MIT).
- **Зафиксированная ревизия:** `main` @ `b0618bc436ad893b3c5e84e55fba86586d34a404`
  (линия CHANGELOG `1.3.x`).
- **Производные:** `grilling`, `diagnosing-bugs`, `codebase-design`,
  `domain-modeling`, `writing-for-agents`, `code-review`.
- **Не из upstream:** `doc-coauthoring`, `frontend-design`, `web-design`,
  `webapp-testing`, `verification-before-completion`.

### Diff-log (сверка на зафиксированной ревизии)

Статусы: **identical** (байт-в-байт), **adapted** (проектные отличия — ценность,
не долг), **divergent** (намеренно иной рантайм/домен).

| Навык / файл | Статус | Отличие от upstream |
|---|---|---|
| `grilling/SKILL.md` | adapted | русские триггеры в `description`; блоки «Ground the interview in the code» и «Close on a written artefact». Тело и строка про «yes accepts your recommended answer» — в синхроне |
| `diagnosing-bugs/SKILL.md` | adapted | русские триггеры; раздел «Project shortcuts»; `hitl-loop.template.ps1` вместо `.sh`; проектный чеклист Phase 6. Phase 5 (diff против pristine-копии) — в синхроне |
| `codebase-design/SKILL.md` | adapted | секции «Applied to this repo» и «Testing seam» |
| `codebase-design/DEEPENING.md` | identical | — |
| `codebase-design/DESIGN-IT-TWICE.md` | identical | — |
| `domain-modeling/SKILL.md` | adapted | single-context; `docs/specs/adr/`; примечание про `STATUS.md` |
| `domain-modeling/ADR-FORMAT.md` | adapted | `docs/specs/adr/` + `ADR-NNN-<slug>.md` |
| `domain-modeling/GLOSSARY-FORMAT.md` | adapted | русские термины, один файл |
| `writing-for-agents/SKILL.md` | adapted | `AGENTS.md`/`instructions/` вместо `CLAUDE.md`; секция «Pruning a sedimented doc» |
| `writing-for-agents/SKILL-MECHANICS.md` | divergent | OpenCode-специфика (frontmatter, skill↔command); upstream — Claude/Codex |
| `code-review/SKILL.md` | adapted | spec/standards sources под репозиторий (нет трекера); раздел «After the report» |

### Playbook синхронизации

1. `git clone --depth 1 https://github.com/mattpocock/skills <tmp>`, затем
   `git -C <tmp> rev-parse HEAD` — зафиксировать SHA.
2. Построчный diff наших 6 навыков против upstream
   (`git diff --no-index --numstat` по каждой паре файлов).
3. Править **только реальные дельты**. `identical`/`adapted`/`divergent` не
   «заменяются»: проектные отличия — ценность, а не долг. Переносить лишь то, чего
   у нас ещё нет.
4. Обновить diff-log и зафиксированный SHA; при расхождении сверяться с
   «Адаптация под проект» выше.
5. Набор не расширять: новинки upstream не «притягивать» (см. «Правила поддержки»).

## Правила поддержки

- Один вход в фазу. Новый скилл добавляется вместе с решением, какой существующий
  он заменяет или какой пробел закрывает; «просто полезный» — не причина.
- `AGENTS.md` (таблица фаз) и `instructions/verification.md` обновляются тем же
  коммитом, что и сам набор скиллов.
- Ссылка на несуществующий скилл, путь или скрипт — дефект: чинить в том же
  коммите. Проверяется грепом по `.opencode/`.