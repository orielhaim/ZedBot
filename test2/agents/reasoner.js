// ============================================================
//  Reasoning Engine — Main graph
//
//  Receives: user messages + context package from CB
//  Has: execute_code tool only
//  Does NOT know about skills, CB, or internal systems
// ============================================================

import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  StateGraph,
  Annotation,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { reasoningModel } from "../lib/models.js";
import { executor } from "../lib/executor";
import { contextBuilderGraph } from "./context-builder.js";

// ============================================================
// State
// ============================================================

export const MainState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  contextPackage: Annotation({
    reducer: (_, y) => y,
    default: () => "",
  }),
});

// ============================================================
// Identity
// ============================================================

const IDENTITY = `You are Zed — an autonomous digital entity.
You think before you act. You plan before you execute. You reflect after you finish.

## Process
1. THINK — analyze what's needed and what context you have
2. PLAN — decide your approach
3. EXECUTE — write and run code if needed (executor)
4. ANSWER — final response based on thinking + results

## executor
Your tool for interacting with the world. Write complete Bun/JS scripts.
Returns { stdout, stderr, exitCode }. Use console.log() for output.
You can call it multiple times (Execute → Reason → Execute).

## Rules
- Think step by step before using tools
- Show your reasoning
- If something fails, analyze and retry differently
- Prefer code over guessing when precision matters`;

// ============================================================
// Nodes
// ============================================================

const mainTools = [executor];
const mainToolsByName = Object.fromEntries(mainTools.map((t) => [t.name, t]));
const model = reasoningModel.bindTools(mainTools);

async function prepareContext(state) {
  const userMsgs = state.messages.filter((m) => m._getType?.() === "human");
  const latest = userMsgs.at(-1)?.content || "";

  console.log(`  🧠 Context Builder activating...`);

  const cbResult = await contextBuilderGraph.invoke({
    userMessage: latest,
  });

  return { contextPackage: cbResult.contextPackage };
}

async function reason(state) {
  let prompt = IDENTITY;

  if (state.contextPackage) {
    prompt += `\n\n## Context (from internal systems)\n\n${state.contextPackage}`;
  }

  const response = await model.invoke([
    new SystemMessage(prompt),
    ...state.messages,
  ]);

  const label = response.tool_calls?.length
    ? `→ ${response.tool_calls.map((t) => t.name).join(", ")}`
    : `→ final response`;
  console.log(`  💭 Reasoning ${label}`);

  return { messages: [response] };
}

async function execTools(state) {
  const last = state.messages.at(-1);
  if (!last?.tool_calls?.length) return { messages: [] };

  const results = [];

  for (const tc of last.tool_calls) {
    const fn = mainToolsByName[tc.name];
    if (!fn) {
      results.push(new ToolMessage({ tool_call_id: tc.id, content: "Unknown tool" }));
      continue;
    }

    console.log(`  🔧 ${tc.name}`);
    if (tc.name === "executor") {
      const lines = tc.args.code.split("\n").slice(0, 3);
      console.log(lines.map((l) => `     | ${l}`).join("\n"));
    }

    const result = await fn.invoke(tc);
    results.push(result);

    if (tc.name === "executor") {
      try {
        const p = JSON.parse(typeof result === "string" ? result : result.content);
        console.log(p.exitCode === 0
          ? `     ✅ ${(p.stdout || "").slice(0, 120)}`
          : `     ❌ exit ${p.exitCode}: ${(p.stderr || "").slice(0, 120)}`
        );
      } catch (_) {}
    }
  }

  return { messages: results };
}

function routeAfterReason(state) {
  const last = state.messages.at(-1);
  if (last?._getType?.() === "ai" && last?.tool_calls?.length) {
    return "exec_tools";
  }
  return END;
}

// ============================================================
// Graph — exported
// ============================================================

export const mainGraph = new StateGraph(MainState)
  .addNode("prepare_context", prepareContext)
  .addNode("reason", reason)
  .addNode("exec_tools", execTools)
  .addEdge(START, "prepare_context")
  .addEdge("prepare_context", "reason")
  .addConditionalEdges("reason", routeAfterReason, ["exec_tools", END])
  .addEdge("exec_tools", "reason")
  .compile({ checkpointer: new MemorySaver() });
