// ============================================================
//  execute_code.js — Bun-native code execution tool
//  for LangChain AI agents.
//
//  Uses Bun.spawn(), Bun.write(), Bun.file(), and Bun Shell ($).
//  Zero Node.js modules. Pure Bun.
//
//  Features:
//    • Full system access mode (default)
//    • Sandboxed mode (isolated tmpdir + stripped env)
//    • Native Bun.spawn with timeout, SIGKILL, resource tracking
//    • Bun Shell ($) command execution
//    • TypeScript/JSX out of the box
//    • Automatic cleanup
// ============================================================

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { $ } from "bun";

// ─── Configuration ──────────────────────────────────────────

const CONFIG = {
  maxOutput: 8000,
  defaultTimeout: 30_000,
  maxTimeout: 120_000,
  tmpDir: "/tmp/zed-exec",
  sandboxDir: "/tmp/zed-sandbox",
  sensitiveEnvPatterns: [
    "SECRET", "TOKEN", "KEY", "PASSWORD", "CREDENTIAL",
    "PRIVATE", "AUTH", "DATABASE_URL", "REDIS_URL", "MONGO",
  ],
  sandboxAllowedEnv: [
    "PATH", "LANG", "LC_ALL", "TZ", "TERM", "BUN_INSTALL",
    "TMPDIR", "XDG_RUNTIME_DIR",
  ],
};

// ─── Helpers ────────────────────────────────────────────────

let dirsReady = false;
async function ensureDirs() {
  if (dirsReady) return;
  await $`mkdir -p ${CONFIG.tmpDir} ${CONFIG.sandboxDir}`.quiet().nothrow();
  dirsReady = true;
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || "";
  const tail = `\n...[${str.length} chars total, truncated]`;
  return str.slice(0, max - tail.length) + tail;
}

/** Convert any value to a JSON-safe primitive (handles BigInt, etc.) */
function safeNum(v) {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  return 0;
}

/** Safe JSON.stringify that converts BigInt to Number */
function safeStringify(obj) {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === "bigint" ? Number(value) : value
  );
}

function buildSandboxEnv(extraEnv) {
  const clean = {};
  for (const key of CONFIG.sandboxAllowedEnv) {
    if (process.env[key]) clean[key] = process.env[key];
  }
  if (extraEnv) Object.assign(clean, extraEnv);
  return clean;
}

function buildFullEnv(extraEnv) {
  const env = { ...process.env };
  if (extraEnv) Object.assign(env, extraEnv);
  return env;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Core: Script execution ─────────────────────────────────

async function executeScript({ code, timeout, cwd, env, sandbox }) {
  await ensureDirs();

  const id = makeId();
  const actualTimeout = Math.min(timeout || CONFIG.defaultTimeout, CONFIG.maxTimeout);
  const isSandbox = sandbox ?? false;

  const execDir = isSandbox ? `${CONFIG.sandboxDir}/${id}` : CONFIG.tmpDir;
  if (isSandbox) {
    await $`mkdir -p ${execDir}`.quiet();
  }

  // Detect TS syntax for the file extension — Bun handles both natively
  const hasTS = /:\s*(string|number|boolean|any|void|never|unknown|Record|Array)\b|<[A-Z]\w*>|interface\s|type\s+\w+\s*=|as\s+\w/.test(code);
  const scriptPath = `${execDir}/exec-${id}.${hasTS ? "ts" : "js"}`;

  // Wrap user code in async context so top-level await works
  const wrapped = `
const __out = [];
const __err = [];
const __origLog = console.log;
const __origError = console.error;

console.log = (...a) => {
  const s = a.map(x => typeof x === "string" ? x : Bun.inspect(x, { colors: false, depth: 6 })).join(" ");
  __out.push(s);
  __origLog(...a);
};
console.error = (...a) => {
  const s = a.map(x => typeof x === "string" ? x : Bun.inspect(x, { colors: false, depth: 6 })).join(" ");
  __err.push(s);
  __origError(...a);
};
console.warn = console.error;
console.info = console.log;

try {
  const __val = await (async () => { ${code} })();
  if (__val !== undefined) console.log(__val);
} catch(e) {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
}
`;

  await Bun.write(scriptPath, wrapped);

  const procEnv = isSandbox ? buildSandboxEnv(env) : buildFullEnv(env);
  if (isSandbox) {
    procEnv.TMPDIR = execDir;
    procEnv.HOME = execDir;
  }

  const startTime = performance.now();
  let stdout = "";
  let stderr = "";

  try {
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      cwd: cwd || (isSandbox ? execDir : process.cwd()),
      env: procEnv,
      stdout: "pipe",
      stderr: "pipe",
      timeout: actualTimeout,
      killSignal: "SIGKILL",
    });

    // Read output streams + wait for exit in parallel
    const [exitCode, rawOut, rawErr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const durationMs = Math.round(performance.now() - startTime);
    stdout = rawOut.trim();
    stderr = rawErr.trim();

    // Resource usage — safely convert BigInt fields
    let resourceUsage = null;
    try {
      const ru = proc.resourceUsage();
      if (ru) {
        resourceUsage = {
          cpuUser: safeNum(ru.cpuTime?.user),
          cpuSystem: safeNum(ru.cpuTime?.system),
          maxRSS: safeNum(ru.maxRSS),
        };
      }
    } catch {}

    const timedOut = !!(proc.signalCode && durationMs >= actualTimeout - 200);

    return {
      stdout: truncate(stdout, CONFIG.maxOutput),
      stderr: truncate(
        timedOut ? `[TIMEOUT] killed after ${actualTimeout}ms\n${stderr}` : stderr,
        CONFIG.maxOutput,
      ),
      exitCode: exitCode ?? null,
      signalCode: proc.signalCode ?? null,
      timedOut,
      durationMs,
      resourceUsage,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      stdout: truncate(stdout, CONFIG.maxOutput),
      stderr: truncate(`[SPAWN ERROR] ${err?.message || err}\n${stderr}`, CONFIG.maxOutput),
      exitCode: 1,
      signalCode: null,
      timedOut: false,
      durationMs,
    };
  } finally {
    try { await Bun.file(scriptPath).delete(); } catch {}
    if (isSandbox) {
      try { await $`rm -rf ${execDir}`.quiet().nothrow(); } catch {}
    }
  }
}

// ─── Core: Shell execution ──────────────────────────────────

async function executeShell(command, { timeout, cwd, env, sandbox } = {}) {
  const actualTimeout = Math.min(timeout || CONFIG.defaultTimeout, CONFIG.maxTimeout);
  const isSandbox = sandbox ?? false;
  const procEnv = isSandbox ? buildSandboxEnv(env) : buildFullEnv(env);

  const startTime = performance.now();

  try {
    // Use Bun.spawn with sh -c for proper shell semantics with timeout support
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd: cwd || process.cwd(),
      env: procEnv,
      stdout: "pipe",
      stderr: "pipe",
      timeout: actualTimeout,
      killSignal: "SIGKILL",
    });

    const [exitCode, rawOut, rawErr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const durationMs = Math.round(performance.now() - startTime);
    const timedOut = !!(proc.signalCode && durationMs >= actualTimeout - 200);

    return {
      stdout: truncate(rawOut.trim(), CONFIG.maxOutput),
      stderr: truncate(
        timedOut ? `[TIMEOUT] killed after ${actualTimeout}ms\n${rawErr.trim()}` : rawErr.trim(),
        CONFIG.maxOutput,
      ),
      exitCode: exitCode ?? null,
      signalCode: proc.signalCode ?? null,
      timedOut,
      durationMs,
      resourceUsage: null,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    return {
      stdout: "",
      stderr: truncate(`[SHELL ERROR] ${err?.message || err}`, CONFIG.maxOutput),
      exitCode: 1,
      signalCode: null,
      timedOut: false,
      durationMs,
    };
  }
}

// ─── LangChain Tool Definition ──────────────────────────────

export const executor = tool(
  async ({ code, mode, timeout, cwd, env, sandbox }) => {
    try {
      const result = mode === "shell"
        ? await executeShell(code, { timeout, cwd, env, sandbox })
        : await executeScript({ code, timeout, cwd, env, sandbox });

      return safeStringify(result);
    } catch (err) {
      return safeStringify({
        stdout: "",
        stderr: `[TOOL ERROR] ${err?.message || err}`,
        exitCode: 1,
        signalCode: null,
        timedOut: false,
        durationMs: 0,
      });
    }
  },
  {
    name: "executor",
    description: `Execute JavaScript/TypeScript code or shell commands on the system using Bun runtime.

This is your universal tool — you can do ANYTHING on the system by writing code:
  • Read/write/delete files and directories
  • HTTP requests (fetch is built-in)
  • Run CLI commands and system tools
  • Install packages (Bun.spawn(["bun", "add", "pkg"]))
  • Parse/generate JSON, CSV, TOML, YAML, etc.
  • Database queries, API calls, process management
  • File search, text processing, data transformation

Bun runs TypeScript and JSX natively — no compilers or config needed.
All Bun APIs are available: Bun.file(), Bun.write(), Bun.spawn(), fetch(), etc.
Node.js APIs also work: fs, path, os, crypto, http, etc.
Top-level await is supported — just write "await fetch(...)" directly.

MODES:
  "script" (default) — Runs JS/TS code. Use console.log() for output.
  "shell" — Runs a shell command. Supports pipes, redirects, globs.

SANDBOX (off by default):
  sandbox=true runs in an isolated tmpdir with stripped env vars.
  Use for untrusted/pure-computation tasks that don't need system access.`,

    schema: z.object({
      code: z.string().describe(
        "JS/TS code (mode=script) or shell command (mode=shell). Use console.log() for output in script mode."
      ),
      mode: z.enum(["script", "shell"]).default("script").describe(
        "'script' = JS/TS via Bun (default). 'shell' = shell command."
      ),
      timeout: z.number().min(1000).max(120000).optional().describe(
        "Timeout in ms. Default 30000, max 120000."
      ),
      cwd: z.string().optional().describe("Working directory."),
      env: z.string().optional().describe("Extra environment variables."),
      sandbox: z.boolean().default(false).describe(
        "Isolate in tmpdir with stripped env. Off by default."
      ),
    }),
  },
);

// ─── Raw exports for non-tool usage ─────────────────────────

export { executeScript, executeShell };
