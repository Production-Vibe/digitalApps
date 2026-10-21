// handoff-threshold — плагин opencode для цикла session-loop
// (контракт: instructions/session-loop.md, шаблон брифа: .opencode/commands/handoff.md).
//
// Регистрирует ровно два хука:
//
// 1) experimental.chat.messages.transform:
//   * действует только для агента orchestrator (пустой agent = дефолтная
//     сессия orchestrator — та же гейт-семантика, что у argos/session-bootstrap);
//   * сравнивает долю заполнения контекста с порогом (env
//     ND_HANDOFF_THRESHOLD — доля 0..1, по умолчанию 0.48) и при
//     ratio >= порога дописывает в КОНЕЦ последнего user-сообщения
//     императивное напоминание: немедленно выполнить /handoff и сразу после
//     записи брифа завершить ход без новых инструментов;
//   * помечает сессию фазой pending (см. машину состояний ниже).
//
// 2) event:
//   * при событии «session idle» (session.idle либо session.status со
//     status.type="idle") для сессии в фазе pending проверяет наличие СВЕЖЕГО
//     handoff-брифа: файл handoff-*.md в .opencode/handoff/ с mtime позже
//     времени первой инъекции напоминания (mtime-гейт);
//   * при наличии свежего брифа ОДИН РАЗ переводит фазу в spent (цикл
//     напоминаний закрыт до нового пересечения порога); без свежего брифа
//     фаза остаётся pending и напоминания продолжают доставляться. Гейт по
//     orchestrator для event-пути обеспечивается машиной состояний: состояния
//     pending появляются только у сессий, прошедших гейт агента в transform, —
//     субагенты не затрагиваются.
//
// Программный компакшен УДАЛЁН: он выполнял HTTP-вызов к самому
// opencode-серверу (POST /api/session/{id}/compact через v2-клиент SDK), что
// в интерактивной сессии давало ConnectionRefused и триггерило
// free-tier-проверку OpenCode. Цикл session-loop стартует свежую сессию на
// каждой итерации — компакшен не нужен; idle-ветка только закрывает цикл
// напоминаний по свежему брифу.
//
// Идемпотентность:
//   * закрытие цикла напоминаний — не более одного раза на одно пересечение
//     порога (фаза spent);
//   * инъекция — на КАЖДОМ шаге (model-запросе), пока ratio >= порога и
//     фаза не spent: трансформ вызывается один раз на шаг цикла, мутации
//     снапшота не персистятся в БД (.artifacts/plugin-debug-opencode-
//     semantics.md, (a), (d) п.3) — при инъекции только на первом шаге
//     модель на шагах 2+ не видела бы напоминания вообще. Накопление
//     исключено: каждый шаг получает свежий снапшот из БД без нашего
//     текста, а внутри одного снапшота дубль отсекает маркер REMINDER_MARK
//     (та же схема, что у argos-преамбулы — она тоже мутирует каждый шаг);
//   * сброс к armed происходит только при ratio < порога (новое
//     пересечение), а не по каждому вызову; injectedAt остаётся временем
//     ПЕРВОЙ инъекции пересечения — гейт свежести брифа (mtime) считается
//     от него и не сдвигается ре-инъекциями.
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
// opencode-plugin-loop.md, п.6), поэтому чистые функции порога/машины
// состояний доступны через свойство plugin.pure
// (probe: .artifacts/probe-handoff-threshold.ts).

import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type { AssistantMessage, Event, Part, TextPart, UserMessage } from "@opencode-ai/sdk";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
//   armed   — порог не пересечён (дефолт, состояние отсутствует в Map);
//   pending — напоминание инъецировано, ждём свежий бриф + idle → закрытие
//             цикла напоминаний;
//   spent   — цикл напоминаний закрыт по свежему брифу (до нового
//             пересечения порога: ratio < порога удаляет состояние → armed).
type SessionState = {
  phase: "armed" | "pending" | "spent";
  injectedAt: number; // время ПЕРВОЙ инъекции пересечения — гейт mtime брифа
  lastMessageID: string | null; // id user-сообщения последней инъекции (диагностика)
};

const DEFAULT_THRESHOLD = 0.48;
const FALLBACK_CONTEXT_LIMIT = 200_000;
const CHARS_PER_TOKEN = 4;
const ORCHESTRATOR_AGENT = "orchestrator";
const HANDOFF_DIR_RELATIVE = join(".opencode", "handoff");
const BRIEF_FILENAME_RE = /^handoff-.*\.md$/i;
const REMINDER_MARK = "Это напоминание: на разумной границе";
const REMINDER_TAIL =
  `${REMINDER_MARK} (КРИТИЧНО) ` +
  "НЕМЕДЛЕННО выполни команду /handoff с кратким описанием 'для чего следующая сессия'. " +
  "СРАЗУ ПОСЛЕ ЗАПИСИ БРИФА ЗАВЕРШИ ТЕКУЩИЙ ХОД БЕЗ НОВЫХ ИНСТРУМЕНТОВ. " +
  "Не продолжай реализацию, не вызывай dispatch/register/execute. " +
  "Если бриф уже записан — просто закончи ход.";

function parseThreshold(raw: string | undefined): number {
  if (raw == null) return DEFAULT_THRESHOLD;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0 || value > 1) return DEFAULT_THRESHOLD;
  return value;
}

function shouldRemind(ratio: number, threshold: number): boolean {
  return ratio >= threshold;
}

function formatReminder(ratio: number): string {
  const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
  return `Контекст заполнен на ~${percent}%. ${REMINDER_TAIL}`;
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
  return { phase: "armed", injectedAt: 0, lastMessageID: null };
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
  // spent — цикл напоминаний закрыт, напоминание больше не нужно
  if (state.phase === "spent") return { inject: false, state };
  if (state.phase === "armed") {
    return {
      inject: true,
      state: { phase: "pending", injectedAt: now, lastMessageID: messageID },
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

// mtime самого свежего handoff-брифа в каталоге (мс), либо -1 (каталога нет
// или он не читается). Императивная fs-обёртка — вне plugin.pure.
function newestBriefMtimeMs(handoffDir: string): number {
  try {
    let newest = -1;
    for (const name of readdirSync(handoffDir)) {
      if (!isBriefFileName(name)) continue;
      const mtimeMs = statSync(join(handoffDir, name)).mtimeMs;
      if (mtimeMs > newest) newest = mtimeMs;
    }
    return newest;
  } catch {
    return -1;
  }
}

function appendReminder(entry: Entry, reminder: string): void {
  const texts = entry.parts.filter((part): part is TextPart => part.type === "text");
  if (texts.some((part) => part.text.includes(REMINDER_MARK))) return; // уже подмешано
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
      const decision = decideInject(
        states.get(sessionID) ?? newSessionState(),
        crossed,
        lastUser.info.id,
        Date.now(),
      );
      if (decision.inject) appendReminder(lastUser, formatReminder(ratio));
      states.set(sessionID, decision.state);
    } catch (err) {
      console.error("[handoff-threshold]", err);
    }
  };

  const onEvent: EventHook = async ({ event }) => {
    try {
      const sessionID = idleSessionID(event);
      if (!sessionID) return;
      const state = states.get(sessionID);
      if (!state || state.phase !== "pending") return;
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
    FALLBACK_CONTEXT_LIMIT,
    CHARS_PER_TOKEN,
    ORCHESTRATOR_AGENT,
    HANDOFF_DIR_RELATIVE,
    REMINDER_MARK,
    REMINDER_TAIL,
    parseThreshold,
    shouldRemind,
    formatReminder,
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
