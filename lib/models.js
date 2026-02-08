// ============================================================
//  Shared model instances.
//  One place to change models, keys, temperature, etc.
// ============================================================

import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";

// Fast & cheap — for internal agents (Context Builder, etc.)
export const fastModel = new ChatOpenAI({
  model: "glm-4.7-flash",
  temperature: 0.5,
  apiKey: "sk-NfOtH3XbsZ5T5y13JLw9nw",
  configuration: {
    baseURL: "https://llm.orielhaim.com/v1",
  },
});

// Primary — for the Reasoning Engine
export const reasoningModel = new ChatOpenAI({
  model: "glm-4.7-flash",
  temperature: 0.5,
  apiKey: "sk-NfOtH3XbsZ5T5y13JLw9nw",
  configuration: {
    baseURL: "https://llm.orielhaim.com/v1",
  },
});

export const embeddingModel = new OpenAIEmbeddings({
  model: "text-embedding-qwen3-embedding-4b",
  encodingFormat: "float",
  apiKey: "",
  configuration: {
      baseURL: "http://127.0.0.1:1234/v1",
  },
})