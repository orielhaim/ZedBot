// bot.js
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { tool, createMiddleware } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const llm = new ChatOpenAI({
  model: "cerebras/gpt-oss-120b",
  temperature: 0.9,
  apiKey: "sk-NfOtH3XbsZ5T5y13JLw9nw",
  configuration: {
    baseURL: "https://llm.orielhaim.com/v1",
  },
});

const getWeather = tool(
  ({ city }) => {
    const w = ["sunny", "cloudy", "rainy", "windy"];
    const temp = Math.floor(Math.random() * 35) + 5;
    return `${city}: ${w[Math.floor(Math.random() * w.length)]}, ${temp}°C`;
  },
  {
    name: "get_weather",
    description: "Get current weather for a city",
    schema: z.object({ city: z.string() }),
  }
);

const internetSearch = tool(
  async ({ query, maxResults = 5, topic = "general", includeRawContent = false }) => {
    return "mock data"
  },
  {
    name: "internet_search",
    description: "Run a web search",
  },
  {
    name: "internet_search",
    description: "Run a web search",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().optional().default(5).describe("Maximum number of results to return"),
    }),
  }
);

const research_subagent = {
  "name": "research-agent",
  "description": "Used to research more in depth questions",
  "system_prompt": "You are a great researcher",
  "tools": [internetSearch],
}
const subagents = [research_subagent]

const logToolCallsMiddleware = createMiddleware({
  name: "LogToolCallsMiddleware",
  wrapToolCall: async (request, handler) => {
    const name = request.toolCall.name;
    const args = request.toolCall.args;

    console.log(
      c("33", `  ⚡ ${name}`) + c("2", `(${JSON.stringify(args)})`)
    );

    const result = await handler(request);

    let display = "";
    const raw = result.content ?? result;

    if (typeof raw === "string") {
      display = raw;
    } else if (raw?.update?.messages?.length) {
      // task/subagent — שולף content מההודעה האחרונה
      const lastMsg = raw.update.messages[raw.update.messages.length - 1];
      display = lastMsg?.kwargs?.content ?? lastMsg?.content ?? JSON.stringify(raw);
    } else {
      display = JSON.stringify(raw);
    }

    console.log(c("36", `  ✔ [${name}] `) + display.slice(0, 300));

    return result;
  },
});

const checkpointer = new MemorySaver();

const agent = createDeepAgent({
  model: llm,
  tools: [getWeather],
  systemPrompt: "You are a helpful assistant. Keep responses concise. Answer in the user's language.",
  middleware: [logToolCallsMiddleware],
  checkpointer,
  subagents: subagents,
  backend: (config) =>
    new FilesystemBackend({ rootDir: "./workspace", virtualMode: true }),
  memory: ["./AGENTS.md"],
});

const c = (code, text) => `\x1b[${code}m${text}\x1b[0m`;

async function main() {
  const rl = createInterface({ input, output });
  const threadId = `thread-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  console.log(c("44", " 🤖 DeepAgents Bot "));
  console.log(c("2", "Tools: get_weather, calculate, get_current_time"));
  console.log(c("2", "Built-in: write_todos, read_file, write_file, edit_file, ls, glob, grep, task"));
  console.log(c("2", 'Type "exit" to quit.\n'));

  while (true) {
    const userInput = await rl.question(c("32", "You: "));
    if (!userInput || userInput.toLowerCase() === "exit") {
      console.log(c("35", "\nBye! 👋\n"));
      rl.close();
      break;
    }

    console.log(c("2", "\n  ⏳ Thinking...\n"));

    try {
      const result = await agent.invoke(
        { messages: [{ role: "user", content: userInput }] },
        config
      );

      const last = result.messages[result.messages.length - 1];
      const text = typeof last.content === "string"
        ? last.content
        : (last.content ?? []).filter(b => b.type === "text").map(b => b.text).join("");

      if (text.trim()) console.log("\n" + c("34", "Assistant: ") + text);

    } catch (err) {
      console.error(c("31", `  ❌ ${err.message}`));
    }

    console.log("");
  }
}

main().catch(console.error);
