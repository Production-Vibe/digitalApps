// handoff-threshold — плагин opencode для цикла session-loop
// (контракт: instructions/session-loop.md, шаблон брифа: .opencode/commands/handoff.md).
//
// Регистрирует ровно два хука:
//
// 1) experimental.chat.messages.transform:
//   * действует только для агента orchestrator (пустой agent = дефолтная
//     сессия orchestrator — та же гейт-семантика, что у argos/session-bootstrap);
//   * сравнивает долю заполнения контекста с ДВУМЯ порогами:
//     — НИЖНИЙ (env ND_HANDOFF_THRESHOLD — доля 0..1, по умолчанию 0.50):
//       ratio >= порога дописывает в КОНЕЦ последнего user-сообщения
//       императивное напоминание: немедленно выполнить /handoff и сразу после
//       записи брифа завершить ход без новых инструментов (маркер REMINDER_MARK);
//     — ВЕРХНИЙ, порог перезапуска (env ND_RESTART_THRESHOLD, дефолт
//       DEFAULT_RESTART_THRESHOLD = 0.80): ratio >= порога дополнительно
//       дописывает императив «контекст на пределе — допиши бриф и остановись,
//       сессия будет перезапущена автоматически» (маркер RESTART_MARK) и
//       армирует перезапуск в машине состояний (restartArmed);
//   * помечает сессию фазой pending (см. машину состояний ниже).
//
// 2) event:
//   * при событии «session idle» (session.idle либо session.status со
//     status.type="idle") для сессии в restartArmed (и фаза не restarting) —
//     ВЕРХНЯЯ idle-граница: при наличии СВЕЖЕГО handoff-брифа (файл handoff-*.md
//     в .opencode/handoff/ с mtime позже времени первой инъекции напоминания)
//     атомарно пишется маркер перезапуска .opencode/loop/restart-request.json
//     (схема version 1, см. buildRestartMarker), фаза становится restarting и
//     через 250 мс процесс завершается (process.exit(0)) — драйвер цикла
//     подхватывает маркер и стартует свежую сессию. БЕЗ свежего брифа маркер
//     не пишется и процесс не завершается (нить не теряем): в лог уходит
//     «restart skipped: no fresh brief»;
//   * иначе, для сессии в фазе pending — прежняя логика закрытия цикла
//     напоминаний: при наличии свежего брифа ОДИН РАЗ фаза становится spent
//     (цикл напоминаний закрыт до нового пересечения порога); без свежего
//     брифа фаза остаётся pending и напоминания продолжают доставляться.
//     Гейт по orchestrator для event-пути обеспечивается машиной состояний:
//     состояния pending/restartArmed появляются только у сессий, прошедших
//     гейт агента в transform, — субагенты не затрагиваются.
//
// Перезапуск ВЫКЛЮЧЕН (верхний порог не действует; нижнее напоминание на 0.50
// при этом продолжает работать всегда), когда:
//   * env ND_RESTART_DISABLE = 1|true|yes|on (без учёта регистра);
//   * env ND_LOOP_DRIVER = 1|true|yes|on — сессия запущена драйвером цикла
//     (у драйвера свой цикл перезапуска, маркер ему не нужен).
// Порог перезапуска, не прошедший валидацию (пусто/мусор/<= нижнего порога/> 1),
// заменяется дефолтом 0.80 (parseRestartThreshold).
//
// Маркер перезапуска (.opencode/loop/restart-request.json, UTF-8, атомарно —
// запись в *.tmp + renameSync): { version: 1, reason: "context_restart",
// sessionID, ratio (3 знака после запятой), percent (round(ratio*100)), brief
// (путь брифа относительно корня репо, прямые слэши), createdAt (ISO-8601),
// createdAtMs, nonce (crypto.randomUUID()), pid }. ratio в маркере —
// последнее измеренное значение (state.lastRatio).
//
// Программный компакшен УДАЛЁН: он выполнял HTTP-вызов к самому
// opencode-серверу (POST /api/session/{id}/compact через v2-клиент SDK), что
// в интерактивной сессии давало ConnectionRefused и триггерило
// free-tier-проверку OpenCode. Цикл session-loop стартует свежую сессию на
// каждой итерации — компакшен не нужен; idle-ветка закрывает цикл напоминаний
// по свежему брифу либо, на верхней границе, пишет маркер перезапуска.
//
// Идемпотентность:
//   * закрытие цикла напоминаний — не более одного раза на одно пересечение
//     порога (фаза spent); маркер перезапуска — не более одного раза на
//     сессию (фаза restarting);
//   * инъекция — на КАЖДОМ шаге (model-запросе), пока ratio >= нижнего порога
//     и фаза не spent/restarting: трансформ вызывается один раз на шаг цикла,
//     мутации снапшота не персистятся в БД (.artifacts/plugin-debug-opencode-
//     semantics.md, (a), (d) п.3) — при инъекции только на первом шаге
//     модель на шагах 2+ не видела бы напоминания вообще. Накопление
//     исключено: каждый шаг получает свежий снапшот из БД без нашего
//     текста, а внутри одного снапшота дубль отсекает маркер (REMINDER_MARK
//     у напоминания, RESTART_MARK у императива перезапуска; та же схема,
//     что у argos-преамбулы — она тоже мутирует каждый шаг);
//   * сброс к armed (вместе с restartArmed/lastRatio) происходит только при
//     ratio < НИЖНЕГО порога (новое пересечение), а не по каждому вызову;
//     injectedAt остаётся временем ПЕРВОЙ инъекции пересечения — гейт свежести
//     брифа (mtime) считается от него и не сдвигается ре-инъекциями.
//
// Источник usage: сумма tokens последнего assistant-сообщения с ненулевым
// usage (input + output + reasoning + cache.read + cache.write) и лимит окна
// limit.context модели из client.provider.list() (кэшируется на плагин).
//
// ФОЛБЭК usage (если SDK не отдаёт usage — нет assistant-сообщений с
// ненулевыми токенами): размер контекста оценивается по объёму сообщений —
// суммарная длина text/reasoning и текстовых выводов tool-частей, делённая на
// 4 символа на токен; если лимит модели получить не удалось — знаменатель
// FALLBACK_CONTEXT_LIMIT (200 000). Порог и формат напоминания при фолбэке
// те же; в напоминании процент — округлённая доля от знаменателя.
//
// Аддитивность (безопасно рядом с argos): сообщения/части не удаляются и не
// пересоздаются, чужие преамбулы (argos дописывает свою в первый text-парт)
// не затираются — напоминание идёт в КОНЕЦ последнего text-парт последнего
// user-сообщения (а при полном отсутствии text-частей добавляется новая).
// Любая ошибка внутри хуков гасится try/catch и не прерывает цикл агента.
//
// Экспорт модуля — только default (плагин): opencode трактует любые другие
// именованные экспорты как отдельные плагины (см. .artifacts/research/
// opencode-plugin-loop.md, п.6), поэтому чистые функции порогов/машины
// состояний/маркера доступны через свойство plugin.pure
// (probe: .artifacts/probe-handoff-threshold.ts).

import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type { AssistantMessage, Event, Part, TextPart, UserMessage } from "@opencode-ai/sdk";
import { mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type TransformHook = NonNullable<Hooks["experimental.chat.messages.transform"]>;
type TransformOutput = Parameters<TransformHook>[1];
type Entry = TransformOutput["messages"][number];
type EventHook = NonNullable<Hooks["event"]>;

type UsageSnapshot = {
  used: number;
  providerID: string;
  modelID: string;
};

// Фаза пересечения порога для одной сессии:
//   armed      — порог не пересечён (дефолт, состояние отсутствует в Map);
//   pending    — напоминание инъецировано, ждём свежий бриф + idle → закрытие
//                цикла напоминаний;
//   spent      — цикл напоминаний закрыт по свежему брифу (до нового
//                пересечения порога: ratio < порога удаляет состояние → armed);
//   restarting — верхний порог пересечён и idle-граница записала маркер
//                перезапуска: процесс уходит на завершение (process.exit(0)).
type SessionState = {
  phase: "armed" | "pending" | "spent" | "restarting";
  injectedAt: number; // время ПЕРВОЙ инъекции пересечения — гейт mtime брифа
  lastMessageID: string | null; // id user-сообщения последней инъекции (диагностика)
  restartArmed: boolean; // верхний порог пересечён — кандидат на перезапуск на idle
  lastRatio: number; // последнее измеренное ratio (для маркера перезапуска)
};

// Маркер перезапуска для драйвера цикла (schema v1): собирается чистой
// buildRestartMarker, пишется атомарно writeRestartMarker.
type RestartMarker = {
  version: 1;
  reason: "context_restart";
  sessionID: string;
  ratio: number;
  percent: number;
  brief: string;
  createdAt: string;
  createdAtMs: number;
  nonce: string;
  pid: number;
};

const DEFAULT_THRESHOLD = 0.50;
const DEFAULT_RESTART_THRESHOLD = 0.80;
const FALLBACK_CONTEXT_LIMIT = 200_000;
const CHARS_PER_TOKEN = 4;
const ORCHESTRATOR_AGENT = "orchestrator";
const HANDOFF_DIR_RELATIVE = join(".opencode", "handoff");
const RESTART_MARKER_RELATIVE = ".opencode/loop/restart-request.json";
const BRIEF_FILENAME_RE = /^handoff-.*\.md$/i;
const REMINDER_MARK = "Это напоминание: на разумной границе";
const REMINDER_TAIL =
  `${REMINDER_MARK} (КРИТИЧНО) ` +
  "НЕМЕДЛЕННО выполни команду /handoff с кратким описанием 'для чего следующая сессия'. " +
  "СРАЗУ ПОСЛЕ ЗАПИСИ БРИФА ЗАВЕРШИ ТЕКУЩИЙ ХОД БЕЗ НОВЫХ ИНСТРУМЕНТОВ. " +
  "Не продолжай реализацию, не вызывай dispatch/register/execute. " +
  "Если бриф уже записан — просто закончи ход.";
const RESTART_MARK = "Это напоминание: контекст на пределе";
const RESTART_TAIL =
  "Немедленно допиши handoff-бриф " +
  "(frontmatter loop/iteration/approved_plan/session_config/next_action) " +
  "и остановись — сессия будет перезапущена автоматически.";
const RESTART_EXIT_DELAY_MS = 250;
const RESTART_DISABLE_ENV = "ND_RESTART_DISABLE";
const RESTART_DRIVER_ENV = "ND_LOOP_DRIVER";
const RESTART_TRUTHY = new Set(["1", "true", "yes", "on"]);

function parseThreshold(raw: string | undefined): number {
  if (raw == null) return DEFAULT_THRESHOLD;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0 || value > 1) return DEFAULT_THRESHOLD;
  return value;
}

// Разбор env-порога перезапуска. Чистая: невалидное/пустое значение, доля
// <= нижнего порога (ND_HANDOFF_THRESHOLD) или > 1 → дефолт (0.80).
function parseRestartThreshold(raw: string | undefined, handoffThreshold: number): number {
  if (raw == null) return DEFAULT_RESTART_THRESHOLD;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0 || value > 1 || value <= handoffThreshold) {
    return DEFAULT_RESTART_THRESHOLD;
  }
  return value;
}

// Значение env-флага трактуется как «истина»: 1|true|yes|on (без учёта регистра).
function isTruthyEnv(raw: string | undefined): boolean {
  if (raw == null) return false;
  return RESTART_TRUTHY.has(raw.trim().toLowerCase());
}

// Перезапуск включён, пока не заданы отключающие флаги: ND_RESTART_DISABLE
// или ND_LOOP_DRIVER (драйвер цикла имеет свой цикл перезапуска). Чистая:
// env читается только из аргумента.
function parseRestartEnabled(env: Record<string, string | undefined>): boolean {
  return !isTruthyEnv(env[RESTART_DISABLE_ENV]) && !isTruthyEnv(env[RESTART_DRIVER_ENV]);
}

function shouldRemind(ratio: number, threshold: number): boolean {
  return ratio >= threshold;
}

// Верхний порог пересечён (и перезапуск включён). Чистая.
function shouldRestart(ratio: number, restartThreshold: number, enabled = true): boolean {
  return enabled && ratio >= restartThreshold;
}

function formatReminder(ratio: number): string {
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  return `Контекст заполнен на ~${percent}%. ${REMINDER_TAIL}`;
}

// Текст императива верхней границы: начинается с RESTART_MARK (дедуп в
// снапшоте по своему маркеру). Чистая.
function formatRestartReminder(ratio: number): string {
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  return `${RESTART_MARK} (~${percent}%). ${RESTART_TAIL}`;
}

// Приведение пути к прямым слэшам (для поля brief маркера). Чистая.
function toPosix(path: string): string {
  return path.split("\\").join("/");
}

// Маркер перезапуска для драйвера цикла. Чистая: всё случайное/окружение —
// в аргументах с дефолтами (nonce — crypto.randomUUID(), pid — process.pid);
// ratio округляется до 3 знаков, percent = round(ratio*100) от него же.
function buildRestartMarker(args: {
  sessionID: string;
  ratio: number;
  briefFile: string;
  nowMs?: number;
  nonce?: string;
  pid?: number;
}): RestartMarker {
  const nowMs = args.nowMs ?? Date.now();
  const ratio3 = Math.round(args.ratio * 1000) / 1000;
  return {
    version: 1,
    reason: "context_restart",
    sessionID: args.sessionID,
    ratio: ratio3,
    percent: Math.round(ratio3 * 100),
    brief: toPosix(join(HANDOFF_DIR_RELATIVE, args.briefFile)),
    createdAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
    nonce: args.nonce ?? crypto.randomUUID(),
    pid: args.pid ?? process.pid,
  };
}

function usageFromMessages(messages: Entry[]): UsageSnapshot | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i].info;
    if (info.role !== "assistant") continue;
    const tokens = info.tokens as Partial<AssistantMessage["tokens"]> | undefined;
    if (!tokens) continue;
    const cache = tokens.cache ?? { read: 0, write: 0 };
    const used =
      (tokens.input ?? 0) +
      (tokens.output ?? 0) +
      (tokens.reasoning ?? 0) +
      (cache.read ?? 0) +
      (cache.write ?? 0);
    if (used > 0) return { used, providerID: info.providerID, modelID: info.modelID };
  }
  return null;
}

function partChars(part: Part): number {
  switch (part.type) {
    case "text":
    case "reasoning":
      return part.text.length;
    case "tool": {
      const state = part.state as { input?: unknown; output?: unknown };
      let chars = typeof state.output === "string" ? state.output.length : 0;
      try {
        const input = state.input === undefined ? "" : JSON.stringify(state.input);
        if (input) chars += input.length;
      } catch {
        // несериализуемый (циклический) ввод тула в оценку не попадает
      }
      return chars;
    }
    default:
      return 0;
  }
}

function estimateFromVolume(messages: Entry[]): number {
  let chars = 0;
  for (const entry of messages) {
    for (const part of entry.parts) chars += partChars(part);
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function newSessionState(): SessionState {
  return {
    phase: "armed",
    injectedAt: 0,
    lastMessageID: null,
    restartArmed: false,
    lastRatio: 0,
  };
}

// Машина состояний пересечения: решает, инъецировать ли напоминание в этот
// вызов transform и каким станет состояние сессии. Чистая.
function decideInject(
  state: SessionState,
  crossed: boolean,
  messageID: string,
  now: number,
): { inject: boolean; state: SessionState } {
  if (!crossed) return { inject: false, state: newSessionState() };
  // spent/restarting — цикл напоминаний закрыт либо сессия уходит на
  // перезапуск, напоминание больше не нужно
  if (state.phase === "spent" || state.phase === "restarting") return { inject: false, state };
  if (state.phase === "armed") {
    return {
      inject: true,
      state: {
        phase: "pending",
        injectedAt: now,
        lastMessageID: messageID,
        restartArmed: false,
        lastRatio: 0,
      },
    };
  }
  // pending — инъецируем на каждом шаге (снапшоты не персистятся, см.
  // шапку файла); injectedAt не трогаем: гейт mtime брифа считается от
  // первой инъекции пересечения
  return { inject: true, state: { ...state, lastMessageID: messageID } };
}

function markCompacted(state: SessionState): SessionState {
  return { ...state, phase: "spent" };
}

function isBriefFileName(name: string): boolean {
  return BRIEF_FILENAME_RE.test(name);
}

function isFreshBrief(newestMtimeMs: number, injectedAt: number): boolean {
  return newestMtimeMs > injectedAt;
}

// «Idle-граница» сессии: session.idle либо session.status со status.idle.
// Возвращает sessionID, если событие — такой границей, иначе null. Чистая.
function idleSessionID(event: Event): string | null {
  if (event.type === "session.idle") {
    return event.properties.sessionID ?? null;
  }
  if (event.type === "session.status" && event.properties.status.type === "idle") {
    return event.properties.sessionID ?? null;
  }
  return null;
}

// Имя и mtime самого свежего handoff-брифа в каталоге, либо null (каталога
// нет или он не читается). Императивная fs-обёртка — вне plugin.pure.
function newestBrief(handoffDir: string): { name: string; mtimeMs: number } | null {
  try {
    let best: { name: string; mtimeMs: number } | null = null;
    for (const name of readdirSync(handoffDir)) {
      if (!isBriefFileName(name)) continue;
      const mtimeMs = statSync(join(handoffDir, name)).mtimeMs;
      if (!best || mtimeMs > best.mtimeMs) best = { name, mtimeMs };
    }
    return best;
  } catch {
    return null;
  }
}

function newestBriefMtimeMs(handoffDir: string): number {
  return newestBrief(handoffDir)?.mtimeMs ?? -1;
}

// Атомарная запись маркера перезапуска: временный файл рядом + renameSync.
// Императивная fs-обёртка — вне plugin.pure.
function writeRestartMarker(markerPath: string, marker: RestartMarker): void {
  mkdirSync(dirname(markerPath), { recursive: true });
  const tmpPath = `${markerPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  renameSync(tmpPath, markerPath);
}

// Дописывает текст в КОНЕЦ последнего text-парт последнего user-сообщения
// (или создаёт text-часть, если text-частей нет); дедуп — по маркеру в
// рамках снапшота (default REMINDER_MARK — обратная совместимость; императив
// перезапуска передаёт свой RESTART_MARK).
function appendReminder(entry: Entry, reminder: string, mark: string = REMINDER_MARK): void {
  const texts = entry.parts.filter((part): part is TextPart => part.type === "text");
  if (texts.some((part) => part.text.includes(mark))) return; // уже подмешано
  if (texts.length > 0) {
    const last = texts[texts.length - 1];
    last.text = `${last.text.replace(/\s+$/, "")}\n\n${reminder}`;
    return;
  }
  entry.parts.push({
    id: crypto.randomUUID(),
    sessionID: entry.info.sessionID,
    messageID: entry.info.id,
    type: "text",
    text: reminder,
  });
}

const handoffThreshold: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const threshold = parseThreshold(process.env.ND_HANDOFF_THRESHOLD);
  const restartEnabled = parseRestartEnabled(process.env);
  const restartThreshold = parseRestartThreshold(process.env.ND_RESTART_THRESHOLD, threshold);
  const limitCache = new Map<string, number>();
  const client = input.client;
  const baseDirectory = input.directory || process.cwd();
  const handoffDir = join(baseDirectory, HANDOFF_DIR_RELATIVE);

  const states = new Map<string, SessionState>();

  // Закрытие цикла напоминаний для pending-сессии на idle-границе: при
  // свежем брифе (mtime > injectedAt) фаза становится spent; без свежего
  // брифа фаза остаётся pending — напоминания продолжаются. Синхронная
  // fs-проверка + обновление Map; ошибки гасятся.
  function closeCycleOnIdle(sessionID: string): void {
    try {
      const state = states.get(sessionID);
      if (!state || state.phase !== "pending") return;
      if (!isFreshBrief(newestBriefMtimeMs(handoffDir), state.injectedAt)) return;
      states.set(sessionID, markCompacted(state));
      console.log(
        "[handoff-threshold] свежий handoff-бриф обнаружен — цикл напоминаний закрыт (программный компакшен удалён)",
      );
    } catch (err) {
      console.error("[handoff-threshold]", err);
    }
  }

  // Верхняя idle-граница перезапуска: при свежем брифе атомарно пишет маркер
  // .opencode/loop/restart-request.json, переводит фазу в restarting и через
  // RESTART_EXIT_DELAY_MS завершает процесс (драйвер цикла подхватит маркер и
  // стартует свежую сессию). БЕЗ свежего брифа — тишина, маркер не пишется и
  // процесс не завершается (нить не теряем). Синхронная fs-проверка + запись;
  // ошибки гасятся.
  function requestRestart(sessionID: string, state: SessionState): void {
    try {
      const brief = newestBrief(handoffDir);
      if (!brief || !isFreshBrief(brief.mtimeMs, state.injectedAt)) {
        console.log("[handoff-threshold] restart skipped: no fresh brief");
        return;
      }
      const marker = buildRestartMarker({
        sessionID,
        ratio: state.lastRatio,
        briefFile: brief.name,
      });
      const markerPath = join(baseDirectory, RESTART_MARKER_RELATIVE);
      writeRestartMarker(markerPath, marker);
      states.set(sessionID, { ...state, phase: "restarting" });
      console.log(
        `[handoff-threshold] restart marker written ${markerPath} (контекст ~${marker.percent}%)`,
      );
      setTimeout(() => process.exit(0), RESTART_EXIT_DELAY_MS);
    } catch (err) {
      console.error("[handoff-threshold]", err);
    }
  }

  const onMessagesTransform: TransformHook = async (_input, output) => {
    try {
      const messages = output.messages;
      if (messages.length === 0) return;

      const users = messages.filter(
        (entry): entry is Entry & { info: UserMessage } => entry.info.role === "user",
      );
      const lastUser = users[users.length - 1];
      if (!lastUser) return;
      // пустой agent = дефолтная сессия orchestrator; чужим субагентам — тишина
      if (lastUser.info.agent && lastUser.info.agent !== ORCHESTRATOR_AGENT) return;

      const sessionID = lastUser.info.sessionID;

      const usage = usageFromMessages(messages);
      const used = usage ? usage.used : estimateFromVolume(messages);
      const limit = usage
        ? await resolveContextLimit(client, usage.providerID, usage.modelID, limitCache)
        : FALLBACK_CONTEXT_LIMIT;
      const ratio = used / limit;

      // машина состояний читается ПОСЛЕ await выше — без устаревших снапшотов
      const crossed = shouldRemind(ratio, threshold);
      if (!crossed) {
        states.delete(sessionID); // ratio ниже порога → возврат к armed
        return;
      }
      const prev = states.get(sessionID) ?? newSessionState();
      const decision = decideInject(prev, crossed, lastUser.info.id, Date.now());
      if (decision.inject) appendReminder(lastUser, formatReminder(ratio));
      // верхний порог: императив «контекст на пределе» на каждом шаге и
      // армирование перезапуска (гейт вкл/выкл читается при старте плагина)
      const restartCrossed = shouldRestart(ratio, restartThreshold, restartEnabled);
      if (restartCrossed && decision.state.phase !== "restarting") {
        appendReminder(lastUser, formatRestartReminder(ratio), RESTART_MARK);
      }
      states.set(sessionID, {
        ...decision.state,
        restartArmed: prev.restartArmed || restartCrossed,
        lastRatio: ratio,
      });
    } catch (err) {
      console.error("[handoff-threshold]", err);
    }
  };

  const onEvent: EventHook = async ({ event }) => {
    try {
      const sessionID = idleSessionID(event);
      if (!sessionID) return;
      const state = states.get(sessionID);
      if (!state) return;
      // верхняя idle-граница: restartArmed + свежий бриф → маркер + выход
      if (state.restartArmed && state.phase !== "restarting") {
        requestRestart(sessionID, state);
        return;
      }
      if (state.phase !== "pending") return;
      closeCycleOnIdle(sessionID);
    } catch (err) {
      console.error("[handoff-threshold]", err);
    }
  };

  async function resolveContextLimit(
    cli: PluginInput["client"],
    providerID: string,
    modelID: string,
    cache: Map<string, number>,
  ): Promise<number> {
    const key = `${providerID}/${modelID}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    try {
      const res = await cli.provider.list();
      const model = res.data?.all.find((provider) => provider.id === providerID)?.models[modelID];
      const context = model?.limit?.context;
      if (typeof context === "number" && context > 0) {
        cache.set(key, context);
        return context;
      }
    } catch {
      // лимит недоступен — ниже фолбэк-знаменатель
    }
    return FALLBACK_CONTEXT_LIMIT;
  }

  return {
    "experimental.chat.messages.transform": onMessagesTransform,
    event: onEvent,
  };
};

const plugin = Object.assign(handoffThreshold, {
  pure: {
    DEFAULT_THRESHOLD,
    DEFAULT_RESTART_THRESHOLD,
    FALLBACK_CONTEXT_LIMIT,
    CHARS_PER_TOKEN,
    ORCHESTRATOR_AGENT,
    HANDOFF_DIR_RELATIVE,
    RESTART_MARKER_RELATIVE,
    REMINDER_MARK,
    REMINDER_TAIL,
    RESTART_MARK,
    RESTART_TAIL,
    parseThreshold,
    parseRestartThreshold,
    parseRestartEnabled,
    shouldRemind,
    shouldRestart,
    formatReminder,
    formatRestartReminder,
    buildRestartMarker,
    usageFromMessages,
    estimateFromVolume,
    newSessionState,
    decideInject,
    markCompacted,
    isBriefFileName,
    isFreshBrief,
    idleSessionID,
    appendReminder,
  },
});

export default plugin;
