// handoff-threshold — плагин opencode для цикла session-loop
// (контракт: instructions/session-loop.md).
//
// Регистрирует ровно один хук — experimental.chat.messages.transform:
//   * действует только для агента orchestrator (пустой agent = дефолтная
//     сессия orchestrator — та же гейт-семантика, что у argos);
//   * сравнивает долю заполнения контекста с порогом (env
//     ND_HANDOFF_THRESHOLD — доля 0..1, по умолчанию 0.58) и при
//     ratio >= порога дописывает в последнее user-сообщение напоминание:
//     «Контекст заполнен на ~X%. Сделай handoff по instructions/session-loop.md
//     и заверши ход.»
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
// Любая ошибка внутри хука гасится try/catch и не прерывает цикл агента.
//
// Экспорт модуля — только default (плагин): opencode трактует любые другие
// именованные экспорты как отдельные плагины (см. .artifacts/research/
// opencode-plugin-loop.md, п.6), поэтому чистые функции порога доступны
// через свойство plugin.pure (probe: .artifacts/probe-handoff-threshold.ts).

import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type { AssistantMessage, Part, TextPart, UserMessage } from "@opencode-ai/sdk";

type TransformHook = NonNullable<Hooks["experimental.chat.messages.transform"]>;
type TransformOutput = Parameters<TransformHook>[1];
type Entry = TransformOutput["messages"][number];

type UsageSnapshot = {
  used: number;
  providerID: string;
  modelID: string;
};

const DEFAULT_THRESHOLD = 0.58;
const FALLBACK_CONTEXT_LIMIT = 200_000;
const CHARS_PER_TOKEN = 4;
const ORCHESTRATOR_AGENT = "orchestrator";
const REMINDER_MARK = "Сделай handoff по instructions/session-loop.md";
const REMINDER_TAIL = `${REMINDER_MARK} и заверши ход.`;

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

async function resolveContextLimit(
  client: PluginInput["client"],
  providerID: string,
  modelID: string,
  cache: Map<string, number>,
): Promise<number> {
  const key = `${providerID}/${modelID}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  try {
    const res = await client.provider.list();
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

      const usage = usageFromMessages(messages);
      const used = usage ? usage.used : estimateFromVolume(messages);
      const limit = usage
        ? await resolveContextLimit(client, usage.providerID, usage.modelID, limitCache)
        : FALLBACK_CONTEXT_LIMIT;
      const ratio = used / limit;
      if (!shouldRemind(ratio, threshold)) return;

      appendReminder(lastUser, formatReminder(ratio));
    } catch (err) {
      console.error("[handoff-threshold]", err);
    }
  };

  return { "experimental.chat.messages.transform": onMessagesTransform };
};

const plugin = Object.assign(handoffThreshold, {
  pure: {
    DEFAULT_THRESHOLD,
    FALLBACK_CONTEXT_LIMIT,
    CHARS_PER_TOKEN,
    parseThreshold,
    shouldRemind,
    formatReminder,
    usageFromMessages,
    estimateFromVolume,
  },
});

export default plugin;
