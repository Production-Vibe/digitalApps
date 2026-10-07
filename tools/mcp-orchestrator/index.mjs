import { execFile, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BRIDGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = findProjectRoot();
const LOG_PATH = path.join(BRIDGE_DIR, "logs", "orchestrator.log");
const MCP_SERVER_NAME = "orchestrator";
const MCP_SERVER_VERSION = "0.1.0";
const DEFAULT_AGENT = "nda-orchestrator";
const DEFAULT_TIMEOUT_MS = 900000;
const MAX_TIMEOUT_MS = 2147483647;
const STDOUT_LIMIT = 20000;
const STDOUT_BUFFER_LIMIT = 524288;
const STDERR_BUFFER_LIMIT = 65536;
const STDERR_ERROR_TAIL = 1200;
const RECURSION_ERROR =
  "Рекурсия запрещена: вложенный вызов orchestrator_execute_task отклонён (ORCH_NESTED). " +
  "Оркестратор не может делегировать задачи самому себе — формулируй работу самостоятельно.";

let logFd = -1;
let taskCounter = 0;
let busy = false;
let activeChild = null;
let shuttingDown = false;

try {
  mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  logFd = openSync(LOG_PATH, "a");
} catch {
  logFd = -1;
}

function findProjectRoot() {
  let dir = BRIDGE_DIR;
  for (let hop = 0; hop < 12; hop += 1) {
    if (existsSync(path.join(dir, "opencode.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function writeAll(fd, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    offset += writeSync(fd, buffer, offset, buffer.length - offset);
  }
}

function log(message) {
  if (logFd < 0) return;
  const body = String(message)
    .split(/\r?\n/)
    .map((line, index) => (index === 0 ? line : `    ${line}`))
    .join("\n");
  try {
    writeAll(logFd, Buffer.from(`[${new Date().toISOString()}] ${body}\n`, "utf8"));
  } catch {
    logFd = -1;
  }
}

function formatConsoleArg(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack ?? String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function consoleSink(...args) {
  log(`console| ${args.map(formatConsoleArg).join(" ")}`);
}

console.log = consoleSink;
console.info = consoleSink;
console.warn = consoleSink;
console.error = consoleSink;
console.debug = consoleSink;

process.on("uncaughtException", (error) => {
  log(`uncaughtException| ${error?.stack ?? error}`);
});
process.on("unhandledRejection", (reason) => {
  log(`unhandledRejection| ${reason?.stack ?? reason}`);
});

function resolveOpenCodeBinary() {
  const entries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const isWindows = process.platform === "win32";
  const fileNames = isWindows ? ["opencode.exe"] : ["opencode"];
  for (const dir of entries) {
    for (const fileName of fileNames) {
      const candidate = path.join(dir, fileName);
      if (existsSync(candidate)) return candidate;
    }
  }
  if (isWindows) {
    for (const dir of entries) {
      if (!existsSync(path.join(dir, "opencode.cmd"))) continue;
      const candidate = path.join(dir, "node_modules", "opencode-ai", "bin", "opencode.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function agentFromEnv() {
  const raw = process.env.ORCH_AGENT;
  if (raw === undefined || raw === null) return DEFAULT_AGENT;
  return String(raw).trim();
}

function timeoutFromEnv() {
  const parsed = Number.parseInt(process.env.ORCH_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function normalizeTimeout(value) {
  if (!Number.isFinite(value) || value <= 0) return timeoutFromEnv();
  return Math.min(Math.trunc(value), MAX_TIMEOUT_MS);
}

function isNestedRun() {
  const raw = process.env.ORCH_NESTED;
  return raw !== undefined && raw !== null && String(raw).trim() !== "";
}

function nestedDepth() {
  const parsed = Number.parseInt(process.env.ORCH_NESTED ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildPrompt(task, context) {
  const extra = typeof context === "string" ? context.trim() : "";
  if (!extra) return task;
  return `${task}\n\nКонтекст задачи:\n${extra}`;
}

function preview(text, limit) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

function appendCapped(buffer, chunk, limit) {
  const next = buffer + chunk;
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function truncateStdout(text) {
  if (text.length <= STDOUT_LIMIT) return text;
  return `[усечено: показаны последние ${STDOUT_LIMIT} символов из ${text.length}]\n${text.slice(-STDOUT_LIMIT)}`;
}

function gitPorcelain() {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["status", "--porcelain"],
      { cwd: PROJECT_ROOT, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const lines = String(stdout)
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .filter(Boolean);
        resolve(lines);
      }
    );
  });
}

function porcelainFile(line) {
  const body = line.length > 3 ? line.slice(3) : line;
  const arrow = body.indexOf(" -> ");
  const raw = arrow >= 0 ? body.slice(arrow + 4) : body;
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

function diffPorcelain(before, after) {
  const previous = new Set(before ?? []);
  const seen = new Set();
  const changed = [];
  for (const line of after ?? []) {
    if (previous.has(line)) continue;
    const file = porcelainFile(line);
    if (!file || seen.has(file)) continue;
    seen.add(file);
    changed.push(file);
  }
  return changed;
}

function assistantTextOf(event) {
  if (!event || typeof event !== "object") return "";
  const part = event.part && typeof event.part === "object" ? event.part : null;
  if (part && part.type === "text" && typeof part.text === "string" && part.text.trim()) {
    return part.text;
  }
  if (event.type === "text" && typeof event.text === "string" && event.text.trim()) {
    return event.text;
  }
  const message = event.message && typeof event.message === "object" ? event.message : null;
  if (message && message.role === "assistant" && Array.isArray(message.content)) {
    const joined = message.content
      .filter((item) => item && item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (joined) return joined;
  }
  return "";
}

function toolNameOf(event) {
  if (!event || typeof event !== "object") return "";
  const part = event.part && typeof event.part === "object" ? event.part : null;
  const type = typeof event.type === "string" ? event.type : "";
  const partType = part && typeof part.type === "string" ? part.type : "";
  if (partType === "tool") {
    const name = part.tool ?? part.name;
    if (typeof name === "string" && name) return name;
  }
  if (type === "tool" || type === "tool_use" || type === "toolUse") {
    const name = part?.tool ?? part?.name ?? event.tool ?? event.name;
    if (typeof name === "string" && name) return name;
  }
  const message = event.message && typeof event.message === "object" ? event.message : null;
  if (message && Array.isArray(message.content)) {
    for (const item of message.content) {
      if (item && (item.type === "tool_use" || item.type === "tool") && typeof item.name === "string" && item.name) {
        return item.name;
      }
    }
  }
  return "";
}

function killProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.on("error", () => {});
    } catch {
      try {
        child.kill();
      } catch {}
    }
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {}
  const escalate = setTimeout(() => {
    if (child.exitCode !== null) return;
    try {
      child.kill("SIGKILL");
    } catch {}
  }, 5000);
  escalate.unref();
}

function emptyFields() {
  return { summary: "", files_changed: [], exitCode: null, durationMs: 0, stdout: "", error: "" };
}

async function runTask(task, context, timeoutMs) {
  const startedAt = Date.now();
  const runId = (taskCounter += 1);
  const timeout = normalizeTimeout(timeoutMs);
  const agent = agentFromEnv();
  const binary = resolveOpenCodeBinary();

  if (!binary) {
    const error = "Не найден исполняемый файл opencode (проверьте PATH)";
    log(`Задача #${runId}: ${error}`);
    return { ...emptyFields(), success: false, durationMs: Date.now() - startedAt, error };
  }

  const prompt = buildPrompt(task, context);
  log(`=== Задача #${runId}: старт, таймаут ${timeout} мс, агент ${agent || "(без --agent)"}, корень ${PROJECT_ROOT} ===`);
  log(`промпт (${prompt.length} симв.): ${preview(prompt, 400)}`);

  const before = await gitPorcelain();
  log(before ? `git status до: строк ${before.length}` : "git status до: недоступен (не git-репозиторий?)");

  const args = ["run", "--format", "json"];
  if (agent) args.push("--agent", agent);
  args.push(prompt);
  log(`spawn: ${binary} ${args.slice(0, -1).map((arg) => JSON.stringify(arg)).join(" ")} <промпт ${prompt.length} симв.>`);

  const child = spawn(binary, args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, ORCH_NESTED: String(nestedDepth() + 1) }
  });
  activeChild = child;

  const summaries = [];
  const toolNames = [];
  const seenTools = new Set();
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let lineBuffer = "";

  const handleLine = (line) => {
    if (!line.trim()) return;
    log(`data| ${line}`);
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    const text = assistantTextOf(event);
    if (text) {
      summaries.push(text);
      log(`assistant| ${text}`);
    }
    const tool = toolNameOf(event);
    if (tool) {
      if (!seenTools.has(tool)) {
        seenTools.add(tool);
        toolNames.push(tool);
      }
      log(`tool| ${tool}`);
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer = appendCapped(stdoutBuffer, chunk, STDOUT_BUFFER_LIMIT);
    lineBuffer += chunk;
    let index = lineBuffer.indexOf("\n");
    while (index >= 0) {
      const line = lineBuffer.slice(0, index).replace(/\r$/, "");
      lineBuffer = lineBuffer.slice(index + 1);
      handleLine(line);
      index = lineBuffer.indexOf("\n");
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrBuffer = appendCapped(stderrBuffer, chunk, STDERR_BUFFER_LIMIT);
    const text = chunk.replace(/\s+$/, "");
    if (text) log(`stderr| ${text}`);
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    log(`Задача #${runId}: превышен таймаут ${timeout} мс — убийство дочернего процесса`);
    killProcessTree(child);
  }, timeout);
  timer.unref();

  const exit = await new Promise((resolve) => {
    let settled = false;
    const finish = (info) => {
      if (settled) return;
      settled = true;
      resolve(info);
    };
    child.once("error", (error) => finish({ code: null, signal: null, error }));
    child.once("close", (code, signal) => finish({ code, signal, error: null }));
  });
  clearTimeout(timer);

  if (lineBuffer.trim()) handleLine(lineBuffer.replace(/\r$/, ""));

  const after = await gitPorcelain();
  const filesChanged = diffPorcelain(before, after);
  const durationMs = Date.now() - startedAt;
  const summary = summaries.length ? summaries[summaries.length - 1] : "";

  let error = "";
  if (exit.error) {
    error = `Не удалось запустить opencode: ${exit.error.message}`;
  } else if (timedOut) {
    error = `Таймаут ${timeout} мс превышен — дочерний процесс opencode убит`;
  } else if (exit.code !== 0) {
    const tail = stderrBuffer.trim().slice(-STDERR_ERROR_TAIL);
    const signalPart = exit.signal ? ` (сигнал ${exit.signal})` : "";
    error = `opencode завершился с кодом ${exit.code}${signalPart}${tail ? `\nstderr: ${tail}` : ""}`;
  }

  const success = error === "";
  log(
    `=== Задача #${runId}: конец, success=${success}, код=${exit.code ?? "-"}, ${durationMs} мс, изменено файлов: ${filesChanged.length} ===`
  );
  if (toolNames.length) log(`инструменты: ${toolNames.join(", ")}`);
  if (filesChanged.length) log(`изменённые файлы:\n${filesChanged.join("\n")}`);
  if (error) log(`ошибка: ${error}`);

  return {
    success,
    summary,
    files_changed: filesChanged,
    exitCode: exit.code ?? null,
    durationMs,
    stdout: truncateStdout(stdoutBuffer),
    error
  };
}

function toolResult(payload, isError) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError
  };
}

function createServer() {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });

  server.registerTool(
    "execute_task",
    {
      description:
        "Исполняет задачу во вложенном headless-процессе `opencode run` (без --auto) в корне проекта. " +
        "Возвращает JSON: success, summary, files_changed, exitCode, durationMs, stdout, error. " +
        "Одновременно выполняется только одна задача — параллельный вызов вернёт ошибку «занят».",
      inputSchema: {
        task: z.string().describe("Текст задачи для вложенного opencode run."),
        context: z
          .string()
          .optional()
          .describe("Дополнительный контекст: добавляется к задаче в промпт вложенного процесса."),
        timeoutMs: z
          .number()
          .optional()
          .describe("Таймаут выполнения в миллисекундах (по умолчанию env ORCH_TIMEOUT_MS, иначе 900000).")
      }
    },
    async ({ task, context, timeoutMs }) => {
      if (isNestedRun()) {
        const payload = {
          ...emptyFields(),
          success: false,
          error: RECURSION_ERROR
        };
        log(`execute_task: отклонён рекурсивный вызов (ORCH_NESTED=${process.env.ORCH_NESTED})`);
        return toolResult(payload, true);
      }
      if (busy) {
        const payload = {
          ...emptyFields(),
          success: false,
          error: "Оркестратор занят: другая задача уже выполняется. Повторите запрос позже."
        };
        log("execute_task: отклонён параллельный вызов (мост занят)");
        return toolResult(payload, true);
      }
      busy = true;
      try {
        const payload = await runTask(task, context, timeoutMs);
        return toolResult(payload, !payload.success);
      } catch (error) {
        log(`execute_task: внутренняя ошибка\n${error?.stack ?? error}`);
        const payload = {
          ...emptyFields(),
          success: false,
          error: `Внутренняя ошибка моста: ${error?.message ?? error}`
        };
        return toolResult(payload, true);
      } finally {
        busy = false;
        activeChild = null;
      }
    }
  );

  return server;
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`shutdown: ${reason}`);
  const child = activeChild;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (logFd >= 0) {
      try {
        closeSync(logFd);
      } catch {}
      logFd = -1;
    }
    setTimeout(() => process.exit(0), 50);
  };
  if (child && child.exitCode === null) {
    killProcessTree(child);
    const guard = setTimeout(finish, 2000);
    guard.unref();
    child.once("close", () => {
      clearTimeout(guard);
      finish();
    });
    return;
  }
  finish();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.stdin.on("end", () => shutdown("stdin закрыт"));
process.stdin.on("close", () => shutdown("stdin закрыт"));

log(`mcp-orchestrator: старт, pid=${process.pid}, node=${process.version}, root=${PROJECT_ROOT}, лог=${LOG_PATH}`);
log(`mcp-orchestrator: opencode=${resolveOpenCodeBinary() ?? "не найден"}, ORCH_AGENT=${JSON.stringify(agentFromEnv())}, ORCH_NESTED=${JSON.stringify(process.env.ORCH_NESTED ?? "")}, таймаут=${timeoutFromEnv()} мс`);

const server = createServer();
const transport = new StdioServerTransport();

server
  .connect(transport)
  .then(() => {
    log("mcp-orchestrator: подключён к stdio, инструмент execute_task зарегистрирован");
  })
  .catch((error) => {
    log(`mcp-orchestrator: ошибка запуска\n${error?.stack ?? error}`);
    process.exit(1);
  });
