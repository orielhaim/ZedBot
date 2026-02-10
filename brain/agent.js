import { createDeepAgent, FilesystemBackend } from "deepagents";
import { tool, createMiddleware } from "langchain";
import { SqliteSaver } from "../test/lch-sqlite.js";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { db } from "../db.js";

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
  async ({ query, maxResults = 5 }) => {
    return "mock data search results for " + query;
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
    console.log(`  ⚡ ${name}(${JSON.stringify(args)})`);
    const result = await handler(request);
    return result;
  }
});

const llm = new ChatOpenAI({
  model: "cerebras/gpt-oss-120b",
  temperature: 0.9,
  apiKey: "sk-NfOtH3XbsZ5T5y13JLw9nw",
  configuration: {
    baseURL: "https://llm.orielhaim.com/v1",
  },
});

// SqliteSaver will use the provided db connection
const checkpointer = new SqliteSaver(db);

export const agent = createDeepAgent({
  model: llm,
  tools: [getWeather],
  systemPrompt: "You are a helpful assistant. Keep responses concise. Answer in the user's language.",
  middleware: [logToolCallsMiddleware],
  checkpointer,
  subagents: subagents,
  backend: (config) =>
    new FilesystemBackend({ rootDir: "./workspace", virtualMode: true }),
  memory: ["./AGENTS.md"],
  slills: "/skills"
});
