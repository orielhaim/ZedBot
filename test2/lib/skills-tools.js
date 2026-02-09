// ============================================================
//  Skills Tools — capability discovery tools for the RE
//  These replace the entire Context Builder sub-graph
// ============================================================

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchSkills, getSkill } from "./skills.js";

/**
 * request_capability — the RE calls this when it needs a skill.
 * Searches, ranks, and returns the FULL content of the best match.
 * One tool replaces the entire CB sub-graph.
 */
export const requestCapability = tool(
  async ({ query, reason }) => {
    const results = await searchSkills(query);

    if (results.length === 0) {
      return JSON.stringify({
        found: false,
        message: "No matching capabilities found.",
      });
    }

    // Take top 3 results above a threshold
    const relevant = results
      .filter((r) => r.score > 0.45)
      .slice(0, 3);

    if (relevant.length === 0) {
      return JSON.stringify({
        found: false,
        message: "Found results but none with high enough relevance.",
        hints: results.slice(0, 3).map((r) => ({
          name: r.name,
          score: r.score.toFixed(4),
          description: r.description,
        })),
      });
    }

    // Return full content of top match + summaries of others
    const top = getSkill(relevant[0].name);
    const others = relevant.slice(1).map((r) => ({
      name: r.name,
      score: r.score.toFixed(4),
      description: r.description,
    }));

    return JSON.stringify({
      found: true,
      skill: {
        name: top.name,
        description: top.description,
        content: top.content,
      },
      alsoRelevant: others,
    });
  },
  {
    name: "request_capability",
    description: `Search Zed's capability catalog and retrieve a skill.
Use this when you need to learn HOW to do something you don't already know.
Describe the CAPABILITY you need, not the user's question.

Examples:
- "search the web for real-time information"
- "read and write files on the filesystem"
- "interact with a REST API"
- "perform mathematical calculations"

Returns the full skill content if a strong match is found.`,
    schema: z.object({
      query: z
        .string()
        .describe("Natural language description of the capability needed"),
      reason: z
        .string()
        .describe("Brief explanation of why you need this capability"),
    }),
  }
);

/**
 * list_capabilities — lets the RE see what's available
 * without fetching full content. Lightweight.
 */
export const listCapabilities = tool(
  async ({ query }) => {
    const results = await searchSkills(query);
    return JSON.stringify({
      count: results.length,
      capabilities: results.slice(0, 8).map((r) => ({
        name: r.name,
        description: r.description,
        score: r.score.toFixed(4),
      })),
    });
  },
  {
    name: "list_capabilities",
    description: `List available capabilities without fetching full content.
Use this for a quick overview of what Zed can do in a particular area.
Lighter than request_capability — use when exploring, not executing.`,
    schema: z.object({
      query: z
        .string()
        .describe("Broad capability area to explore"),
    }),
  }
);
