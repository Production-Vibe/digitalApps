// session-bootstrap — плагин opencode: напоминание о преднастройках первого
// хода сессии оркестратора (контракт: instructions/session-bootstrap.md).
//
// Регистрирует ровно один хук — experimental.chat.messages.transform:
//   * действует только для агента orchestrator (пустой agent = дефолтная
//     сессия orchestrator — та же гейт-семантика, что у argos и у
//     handoff-threshold);
//   * детектирует ПЕРВЫЙ ход — в output.messages нет ни одного
//     assistant-сообщения;
//   * подмешивает в КОНЕЦ последнего text-парт последнего user-сообщения
//     напоминание:
//       - существует `.opencode/session/config.json` (файл) →
//         «Первый ход: покажи унаследованный конфиг сессии и спроси
//         подтверждение/изменение (instructions/session-bootstrap.md).»;
//       - иначе →
//         «Первый ход: выдай преднастройки сессии через question tool
//         (instructions/session-bootstrap.md).»
//     Проверка конфига — на каждый вызов хука (маленький stat по пути
//     input.directory), чтобы ветка «конфиг есть/нет» отражала актуальное
//     состояние репозитория, а не момент загрузки плагина.
//
// Идемпотентность: напоминание не дублируется — если в text-частях последнего
// user-сообщения уже есть наше напоминание (полная строка либо связка
// «Первый ход:» + instructions/session-bootstrap.md), повторные вызовы хука
// (их бывает несколько за ход: основной сайт + клон при компакшене) ничего
// не добавляют.
//
// Аддитивность (безопасно рядом с argos и handoff-threshold): сообщения/части
// не удаляются и не пересоздаются, чужие преамбулы и напоминания не затираются —
// наше напоминание идёт в КОНЕЦ последнего text-парт последнего user-сообщения
// (а при полном отсутствии text-частей добавляется новая). Любая ошибка внутри
// хука гасится try/catch и не прерывает цикл агента.
//
// Экспорт модуля — только default (плагин): opencode трактует любые другие
// именованные экспорты как отдельные плагины (см. .artifacts/research/
// opencode-plugin-loop.md, п.6), поэтому чистые функции доступны через
// свойство plugin.pure (probe: .artifacts/probe-session-bootstrap.ts).

import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import type { Part, TextPart, UserMessage } from "@opencode-ai/sdk";
import { statSync } from "node:fs";
import { join } from "node:path";

type TransformHook = NonNullable<Hooks["experimental.chat.messages.transform"]>;
type TransformOutput = Parameters<TransformHook>[1];
type Entry = TransformOutput["messages"][number];

const ORCHESTRATOR_AGENT = "orchestrator";
const CONFIG_RELATIVE = ".opencode/session/config.json";
const CONTRACT = "instructions/session-bootstrap.md";
const DRIVER_ENV = "ND_LOOP_DRIVER";
const REMINDER_MARK = "Первый ход:";
const REMINDER_WITH_CONFIG = `Первый ход: покажи унаследованный конфиг сессии и спроси подтверждение/изменение (${CONTRACT}).`;
const REMINDER_WITHOUT_CONFIG = `Первый ход: выдай преднастройки сессии через question tool (${CONTRACT}).`;

// Драйвер цикла запускает неинтерактивную сессию без инструмента question:
// напоминание о преднастройках там вредно (ход завершается без брифа).
function isDriverMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DRIVER_ENV] === "1";
}

function isFirstTurn(messages: Entry[]): boolean {
  return !messages.some((entry) => entry.info.role === "assistant");
}

function resolveReminder(configExists: boolean): string {
  return configExists ? REMINDER_WITH_CONFIG : REMINDER_WITHOUT_CONFIG;
}

function isAlreadyInjected(texts: string[]): boolean {
  return texts.some(
    (text) =>
      text.includes(REMINDER_WITH_CONFIG) ||
      text.includes(REMINDER_WITHOUT_CONFIG) ||
      (text.includes(REMINDER_MARK) && text.includes(CONTRACT)),
  );
}

// Файл-конфиг существует именно как файл (каталог на этом пути не считается).
function configExistsAt(directory: string): boolean {
  try {
    return statSync(join(directory, CONFIG_RELATIVE)).isFile();
  } catch {
    return false;
  }
}

function appendReminder(entry: Entry, reminder: string): void {
  const texts = entry.parts.filter((part): part is TextPart => part.type === "text");
  if (isAlreadyInjected(texts.map((part) => part.text))) return; // уже подмешано
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

const sessionBootstrap: Plugin = async (input: PluginInput): Promise<Hooks> => {
  const baseDirectory = input.directory || process.cwd();

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

      // первый ход = в сессии ещё нет ни одного assistant-ответа
      if (!isFirstTurn(messages)) return;

      // неинтерактивный запуск драйвером: преднастройки подтверждены заранее
      if (isDriverMode()) return;

      appendReminder(lastUser, resolveReminder(configExistsAt(baseDirectory)));
    } catch (err) {
      console.error("[session-bootstrap]", err);
    }
  };

  return { "experimental.chat.messages.transform": onMessagesTransform };
};

const plugin = Object.assign(sessionBootstrap, {
  pure: {
    ORCHESTRATOR_AGENT,
    CONFIG_RELATIVE,
    CONTRACT,
    DRIVER_ENV,
    REMINDER_MARK,
    REMINDER_WITH_CONFIG,
    REMINDER_WITHOUT_CONFIG,
    isFirstTurn,
    isDriverMode,
    resolveReminder,
    isAlreadyInjected,
    appendReminder,
  },
});

export default plugin;
