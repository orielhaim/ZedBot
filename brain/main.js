// ============================================================
//  Main Agent Graph — Redesigned Architecture
//
//  Flow: pre_route → reason ↔ exec_tools → post_run
//
//  Key changes from v1:
//  1. No more Context Builder sub-graph
//  2. RE has request_capability tool — fetches skills on demand
//  3. Memory store for cross-thread learning
//  4. pre_route is a fast NO-LLM node (heuristics only)
//  5. post_run records skill usage for future optimization
// ============================================================

import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  StateGraph,
  StateSchema,
  MessagesValue,
  ReducedValue,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { z } from "zod";
import { reasoningModel } from "../lib/models.js";
import { executor } from "../lib/executor.js";
import { requestCapability, listCapabilities } from "../lib/skills-tools.js";
import { saveMemory } from "../lib/memory-tools.js";
import {
  memoryStore,
  findPastSkillUsage,
  recordSkillUsage,
  getFacts,
  getUserPrefs,
} from "../lib/memory.js";

// ============================================================
// State — using new StateSchema API
// ============================================================

const MainState = new StateSchema({
  // Core message history with built-in reducer
  messages: MessagesValue,

  // Skills that have been loaded this session (accumulated)
  loadedSkills: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.array(z.string()),
      reducer: (current, incoming) => {
        const merged = [...current];
        for (const name of incoming) {
          if (!merged.includes(name)) merged.push(name);
        }
        return merged;
      },
    }
  ),

  // Context hints injected by pre_route (overwritten each turn)
  contextHints: z.string().default(""),

  // Track which skills were requested this turn (for post_run)
  skillsRequestedThisTurn: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.array(z.string()),
      reducer: (current, incoming) => [...current, ...incoming],
    }
  ),
});

// ============================================================
// Identity prompt
// ============================================================

const IDENTITY = `You are Zed — an autonomous digital entity.
You think before you act. You plan before you execute. You reflect after you finish.

## Process
1. THINK — analyze what's needed and what context you have
2. PLAN — decide your approach (do you have the skills? if not, request_capability)
3. EXECUTE — write and run code if needed
4. REFLECT — verify results, iterate if needed
5. ANSWER — final response to the user

## Your Tools

### executor
Run Bun/JS scripts. Returns { stdout, stderr, exitCode }.
Use console.log() for output. You can call it multiple times.

### request_capability
When you need to do something you don't know HOW to do (web search,
file operations, API calls, etc.), use this to find instructions.
Describe the CAPABILITY, not the user's question.
The skill content will be returned — follow its instructions.

### list_capabilities
Quick overview of available capabilities in an area.
Use when exploring options, not when you need specific instructions.

### save_memory
Remember important facts or preferences about the user for future
conversations. Use when you learn something worth keeping.

## Rules
- Think step by step before using tools
- If you don't know how to do something → request_capability FIRST
- After executing code, analyze the output before responding
- If something fails, analyze the error, adjust, and retry
- Prefer code over guessing when precision matters
- When you successfully use a skill, note its name (for system tracking)`;

// ============================================================
// Tools
// ============================================================

const allTools = [executor, requestCapability, listCapabilities, saveMemory];
const toolsByName = Object.fromEntries(allTools.map((t) => [t.name, t]));
const model = reasoningModel.bindTools(allTools);

// ============================================================
// Nodes
// ============================================================

/**
 * pre_route — Fast, NO-LLM node that runs before reasoning.
 * Enriches context with:
 *   1. User memory (preferences, facts)
 *   2. Past skill usage patterns (heuristic preloading hints)
 */
async function preRoute(state, config) {
  const userId = config?.configurable?.user_id || "default";
  const hints = [];

  // 1. Load user memory
  const [facts, prefs, pastUsage] = await Promise.all([
    getFacts(userId, 10),
    getUserPrefs(userId),
    findPastSkillUsage(userId, 15),
  ]);

  if (facts.length > 0) {
    hints.push(`## Known facts about this user\n${facts.map((f) => `- ${f}`).join("\n")}`);
  }

  const prefEntries = Object.entries(prefs);
  if (prefEntries.length > 0) {
    hints.push(
      `## User preferences\n${prefEntries.map(([k, v]) => `- ${v}`).join("\n")}`
    );
  }

  // 2. Skill usage history — give the RE hints about what worked before
  if (pastUsage.length > 0) {
    const skillFreq = {};
    for (const u of pastUsage) {
      skillFreq[u.skill] = (skillFreq[u.skill] || 0) + 1;
    }
    const sorted = Object.entries(skillFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    hints.push(
      `## Previously useful skills\n${sorted
        .map(([name, count]) => `- "${name}" (used ${count}x)`)
        .join("\n")}\n\nYou can request these by name if relevant.`
    );
  }

  const contextHints = hints.length > 0 ? hints.join("\n\n") : "";

  console.log(
    `  📋 pre_route: ${facts.length} facts, ${prefEntries.length} prefs, ${pastUsage.length} usage records`
  );

  return { contextHints };
}

/**
 * reason — The main LLM call. Builds the full prompt and invokes.
 */
async function reason(state) {
  let systemPrompt = IDENTITY;

  // Inject memory-based context hints
  if (state.contextHints) {
    systemPrompt += `\n\n${state.contextHints}`;
  }

  // Inject any previously loaded skills (from earlier turns in this conversation)
  if (state.loadedSkills.length > 0) {
    systemPrompt += `\n\n## Already loaded skills this session: ${state.loadedSkills.join(", ")}`;
  }

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages,
  ]);

  const label = response.tool_calls?.length
    ? `→ ${response.tool_calls.map((t) => t.name).join(", ")}`
    : "→ final response";
  console.log(`  💭 reason ${label}`);

  return { messages: [response] };
}

/**
 * execTools — Execute tool calls from the RE.
 * Tracks which skills are loaded for post_run recording.
 */
async function execTools(state) {
  const last = state.messages.at(-1);
  if (!last?.tool_calls?.length) return { messages: [] };

  const results = [];
  const newLoadedSkills = [];
  const newRequestedSkills = [];

  for (const tc of last.tool_calls) {
    const fn = toolsByName[tc.name];

    if (!fn) {
      results.push(
        new ToolMessage({ tool_call_id: tc.id, content: "Unknown tool" })
      );
      continue;
    }

    console.log(`  🔧 ${tc.name}`);

    // Show code preview for executor
    if (tc.name === "executor" && tc.args.code) {
      const lines = tc.args.code.split("\n").slice(0, 3);
      console.log(lines.map((l) => `     | ${l}`).join("\n"));
    }

    const result = await fn.invoke(tc);
    results.push(result);

    // Track skill requests
    if (tc.name === "request_capability") {
      try {
        const parsed = JSON.parse(
          typeof result === "string" ? result : result.content
        );
        if (parsed.found && parsed.skill) {
          newLoadedSkills.push(parsed.skill.name);
          newRequestedSkills.push(parsed.skill.name);
          console.log(`     📌 Loaded skill: ${parsed.skill.name}`);
        }
      } catch (_) {}
    }

    // Log executor results
    if (tc.name === "executor") {
      try {
        const p = JSON.parse(
          typeof result === "string" ? result : result.content
        );
        console.log(
          p.exitCode === 0
            ? `     ✅ ${(p.stdout || "").slice(0, 120)}`
            : `     ❌ exit ${p.exitCode}: ${(p.stderr || "").slice(0, 120)}`
        );
      } catch (_) {}
    }
  }

  return {
    messages: results,
    loadedSkills: newLoadedSkills,
    skillsRequestedThisTurn: newRequestedSkills,
  };
}

/**
 * postRun — Runs after the RE finishes. NO LLM.
 * Records which skills were used for future optimization.
 */
async function postRun(state, config) {
  const userId = config?.configurable?.user_id || "default";

  // Record skill usage for future pre_route hints
  if (state.skillsRequestedThisTurn.length > 0) {
    // Get the user's message to create a pattern
    const userMsgs = state.messages.filter(
      (m) => m._getType?.() === "human"
    );
    const latest = userMsgs.at(-1)?.content || "";
    // Create a short pattern from the query (first 100 chars)
    const pattern = latest.slice(0, 100);

    for (const skillName of state.skillsRequestedThisTurn) {
      await recordSkillUsage(userId, skillName, pattern);
    }

    console.log(
      `  💾 post_run: recorded ${state.skillsRequestedThisTurn.length} skill usages`
    );
  }

  // Reset the turn tracker (return empty array to "reset" via reducer)
  // Actually, we want to leave it — it accumulates but post_run only
  // fires once at the end. For next turn it'll be fresh state.
  return {};
}

// ============================================================
// Routing
// ============================================================

function routeAfterReason(state) {
  const last = state.messages.at(-1);
  if (last?._getType?.() === "ai" && last?.tool_calls?.length) {
    return "exec_tools";
  }
  return "post_run";
}

// ============================================================
// Graph
// ============================================================

const checkpointer = new MemorySaver();

export const mainGraph = new StateGraph(MainState)
  .addNode("pre_route", preRoute)
  .addNode("reason", reason)
  .addNode("exec_tools", execTools)
  .addNode("post_run", postRun)
  .addEdge(START, "pre_route")
  .addEdge("pre_route", "reason")
  .addConditionalEdges("reason", routeAfterReason, ["exec_tools", "post_run"])
  .addEdge("exec_tools", "reason")
  .addEdge("post_run", END)
  .compile({
    checkpointer,
    store: memoryStore,
  });
