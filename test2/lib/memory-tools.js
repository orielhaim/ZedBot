// ============================================================
//  Memory Tools — let the RE manage long-term memory
// ============================================================

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { saveFact, saveUserPref } from "./memory.js";

/**
 * save_memory — the RE calls this to store important information
 * about the user or conversation for future reference.
 */
export const saveMemory = tool(
  async ({ content, category }, config) => {
    const userId = config?.configurable?.user_id || "default";

    if (category === "preference") {
      // Extract a key from the content for deduplication
      const key = content.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_");
      await saveUserPref(userId, key, content);
    } else {
      await saveFact(userId, content);
    }

    return JSON.stringify({ saved: true });
  },
  {
    name: "save_memory",
    description: `Save important information about the user for future conversations.
Use this when you learn something worth remembering:
- User preferences (language, style, tools they use)
- Facts about them (name, role, projects)
- Patterns you notice

This persists ACROSS conversations.`,
    schema: z.object({
      content: z.string().describe("The information to remember"),
      category: z
        .enum(["preference", "fact"])
        .describe("Type of memory: 'preference' for user preferences, 'fact' for other info"),
    }),
  }
);
