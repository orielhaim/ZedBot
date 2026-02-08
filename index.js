// ============================================================
//  ZED BRAIN v0.3 — Entry Point
// ============================================================

import { HumanMessage } from "@langchain/core/messages";
import * as readline from "readline";
import { mainGraph } from "./agents/reasoner.js";
import { listSkills, warmup } from "./lib/skills.js";

async function chat(userMessage, threadId = "zed-main") {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  👤 ${userMessage}`);
  console.log(`${"═".repeat(60)}`);

  const result = await mainGraph.invoke(
    { messages: [new HumanMessage(userMessage)] },
    { configurable: { thread_id: threadId }, recursionLimit: 30 }
  );

  const finalAI = result.messages
    .filter((m) => m._getType?.() === "ai" && !m.tool_calls?.length)
    .at(-1);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  🤖 Zed:\n${finalAI?.content || "[No response]"}`);
  console.log(`${"─".repeat(60)}`);

  return result;
}

async function main() {
  // Pre-warm embeddings index at startup
  console.log("\n  ⏳ Initializing...");
  await warmup();

  const skills = listSkills();
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  ZED BRAIN v0.3 — Modular + Semantic Search               ║
║                                                           ║
║  lib/skills.js  → vector search (text-embedding-3-small) ║
║  Context Builder → semantic capability discovery          ║
║  Reasoner        → execute_code only                      ║
║                                                           ║
║  Skills: ${skills.map((s) => s.name).join(", ").padEnd(48)}║
╚═══════════════════════════════════════════════════════════╝`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("\n💬 You: ", async (input) => {
      const t = input.trim();
      if (!t || t === "exit" || t === "quit") {
        console.log("\n  👋 Zed signing off.\n");
        rl.close();
        return;
      }
      try {
        await chat(t);
      } catch (err) {
        console.error(`\n  ❌ ${err.message}`);
        if (process.env.DEBUG) console.error(err.stack);
      }
      ask();
    });
  };

  ask();
}

main();
