// ============================================================
//  Context Builder Agent — Sub-graph
//
//  Semantic skill search + two-path surfacing:
//    FAST:    surface_skill (description match is obvious)
//    INSPECT: inspect_skill (need to read before deciding)
// ============================================================

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  StateGraph,
  Annotation,
  START,
  END,
} from "@langchain/langgraph";
import { fastModel } from "../lib/models.js";
import { searchSkills, getSkill } from "../lib/skills.js";

// ============================================================
// Tools
// ============================================================

const searchCapabilities = tool(
  async ({ query }) => {
    // Returns ALL skills with scores — no threshold filtering
    // The LLM decides what's relevant based on scores
    const results = await searchSkills(query);

    if (results.length === 0) {
      return JSON.stringify({ found: 0, results: [] });
    }

    return JSON.stringify({
      found: results.length,
      results: results.map((r) => ({
        name: r.name,
        description: r.description,
        score: r.score.toFixed(4),
      })),
    });
  },
  {
    name: "search_capabilities",
    description: `Semantic search over Zed's capability catalog.
Describe the needed capability in natural language.
Returns ALL skills ranked by relevance score (0 to 1).
You decide which ones are relevant enough to surface.`,
    schema: z.object({
      query: z.string().describe("Natural language description of the needed capability"),
    }),
  }
);

const surfaceSkill = tool(
  ({ skill_name, reason }) => {
    const skill = getSkill(skill_name);
    if (!skill) {
      return JSON.stringify({ surfaced: false, error: `"${skill_name}" not found` });
    }
    return JSON.stringify({ surfaced: true, name: skill.name });
  },
  {
    name: "surface_skill",
    description: `Mark a skill to be injected into the Reasoning Engine's context.
Use when the skill description clearly matches the need.
You do NOT read the skill content — it's auto-injected.
This is the FAST path — preferred when the match is obvious.`,
    schema: z.object({
      skill_name: z.string().describe("Exact skill name from search results"),
      reason: z.string().describe("Brief reason why this skill is relevant"),
    }),
  }
);

const inspectSkill = tool(
  ({ skill_name }) => {
    const skill = getSkill(skill_name);
    if (!skill) {
      return JSON.stringify({ error: `"${skill_name}" not found` });
    }
    return JSON.stringify({
      name: skill.name,
      description: skill.description,
      content: skill.content,
    });
  },
  {
    name: "inspect_skill",
    description: `Read the FULL content of a skill to decide if it's relevant.
Only use when you're UNSURE from the description alone.
After inspecting, call surface_skill to include it, or skip it.`,
    schema: z.object({
      skill_name: z.string().describe("Exact skill name to read"),
    }),
  }
);

const CB_TOOLS = [searchCapabilities, surfaceSkill, inspectSkill];
const cbToolsByName = Object.fromEntries(CB_TOOLS.map((t) => [t.name, t]));
const cbModel = fastModel.bindTools(CB_TOOLS);

// ============================================================
// System Prompt
// ============================================================

const CB_SYSTEM = `You are Zed's Context Builder — an internal subsystem.
You do NOT answer the user. You prepare context for the Reasoning Engine.

## YOUR JOB
1. Read the user's message
2. Think: what CAPABILITIES does the Reasoning Engine need?
3. Search using natural language descriptions of the capability needed:
   - "fetch real-time information from the web"
   - "perform math calculations and data analysis"
   - "read, write and manipulate files"
4. If search returns relevant results:
   - High relevance + clear description match → surface_skill (fast path)
   - Unsure → inspect_skill first, then surface_skill if relevant
5. When done, respond with a brief summary of what you surfaced

## CRITICAL RULES
- Search for CAPABILITIES, not answers to the user's question
- User asks about Coolify → search "fetch information from the web" or "web search"
- User asks to calculate → search "mathematical calculations"
- Keep it brief. The Reasoning Engine has limited context.
- If nothing matches, say "No specialized capabilities needed."`;

// ============================================================
// State
// ============================================================

const CBState = Annotation.Root({
  userMessage: Annotation({
    reducer: (_, y) => y,
    default: () => "",
  }),
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  // Skill names that were explicitly surfaced — tracked directly
  surfacedSkills: Annotation({
    reducer: (x, y) => {
      const merged = [...x];
      for (const name of y) {
        if (!merged.includes(name)) merged.push(name);
      }
      return merged;
    },
    default: () => [],
  }),
  contextPackage: Annotation({
    reducer: (_, y) => y,
    default: () => "",
  }),
});

// ============================================================
// Nodes
// ============================================================

async function cbThink(state) {
  const response = await cbModel.invoke([
    new SystemMessage(CB_SYSTEM),
    new HumanMessage(`Prepare context for:\n\n"${state.userMessage}"`),
    ...state.messages,
  ]);
  return { messages: [response] };
}

async function cbTools(state) {
  const last = state.messages.at(-1);
  if (!last?.tool_calls?.length) return { messages: [], surfacedSkills: [] };

  const results = [];
  const newSurfaced = [];

  for (const tc of last.tool_calls) {
    const fn = cbToolsByName[tc.name];
    if (!fn) {
      results.push(new ToolMessage({ tool_call_id: tc.id, content: "Unknown tool" }));
      continue;
    }

    const result = await fn.invoke(tc);
    results.push(result);

    // ── BUG FIX: track surfaced skills reliably ──
    // When surface_skill is called, we track the skill name
    // directly from the tool call args — don't rely on parsing
    // the ToolMessage content, which can be wrapped differently.
    if (tc.name === "surface_skill") {
      const skill = getSkill(tc.args.skill_name);
      if (skill) {
        newSurfaced.push(skill.name);
        console.log(`     📌 Surfaced: ${skill.name}`);
      }
    }
  }

  return { messages: results, surfacedSkills: newSurfaced };
}

function cbAssemble(state) {
  // ── Auto-inject full content for every surfaced skill ──
  const parts = [];

  for (const name of state.surfacedSkills) {
    const skill = getSkill(name);
    if (skill) {
      parts.push(`### Skill: ${skill.name}\n${skill.description}\n\n${skill.content}`);
    }
  }

  const pkg = parts.length > 0
    ? parts.join("\n\n---\n\n")
    : "";

  const label = state.surfacedSkills.length > 0
    ? state.surfacedSkills.join(", ")
    : "none";
  console.log(`  📦 Context package: [${label}]`);

  return { contextPackage: pkg };
}

function cbRoute(state) {
  const last = state.messages.at(-1);
  if (last?._getType?.() === "ai" && last?.tool_calls?.length) {
    return "cb_tools";
  }
  return "cb_assemble";
}

// ============================================================
// Sub-graph
// ============================================================

export const contextBuilderGraph = new StateGraph(CBState)
  .addNode("cb_think", cbThink)
  .addNode("cb_tools", cbTools)
  .addNode("cb_assemble", cbAssemble)
  .addEdge(START, "cb_think")
  .addConditionalEdges("cb_think", cbRoute, ["cb_tools", "cb_assemble"])
  .addEdge("cb_tools", "cb_think")
  .addEdge("cb_assemble", END)
  .compile();
