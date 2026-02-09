import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getProfileManager } from "../managers/index.js";
import { getMemoryStore } from "../stores/index.js";

const profileManager = getProfileManager();
const memoryStore = getMemoryStore();

/**
 * Tool: Update the user's profile.
 * Use this when the user tells you their name, preferences, or important details.
 */
export const updateProfile = tool(
    async ({ profileId, displayName, addFact, removeFact, category }) => {
        try {
            const profile = profileManager.getById(profileId);
            if (!profile) {
                return `Error: Profile ${profileId} not found.`;
            }

            const updates = {};
            let feedback = [];

            if (displayName && displayName !== profile.displayName) {
                updates.displayName = displayName;
                feedback.push(`Updated name to "${displayName}"`);
            }

            if (addFact) {
                profileManager.addFact(profileId, {
                    content: addFact,
                    confidence: 1.0, // High confidence since user stated it
                    source: "user_input",
                    category: category || "general",
                    timestamp: Date.now()
                });
                feedback.push(`Added fact: "${addFact}"`);
            }

            // Apply profile updates if any
            if (Object.keys(updates).length > 0) {
                profileManager.update(profileId, updates);
            }

            return feedback.length > 0 ? `Success: ${feedback.join(", ")}` : "No changes made.";
        } catch (error) {
            return `Error updating profile: ${error.message}`;
        }
    },
    {
        name: "update_profile",
        description: "Updates the user's profile information. Use this when the user tells you their name or a specific fact about themselves.",
        schema: z.object({
            profileId: z.string().describe("The ID of the user profile to update (e.g. from context)"),
            displayName: z.string().optional().describe("New display name for the user"),
            addFact: z.string().optional().describe("A specific fact to add about the user (e.g. 'Is a software engineer')"),
            category: z.string().describe("The category of the fact (e.g. 'work', 'personal', 'hobbies')"),
        }),
    }
);

/**
 * Tool: Save a general memory.
 * Use this for important information that isn't specifically about the user profile.
 */
export const saveMemory = tool(
    async ({ content, type, importance, source }) => {
        try {
            await memoryStore.store({
                content,
                type: type || "semantic",
                importance: importance || 0.8,
                source: source || "user_input",
                timestamp: Date.now()
            });
            return `Saved memory: "${content}"`;
        } catch (error) {
            return `Error saving memory: ${error.message}`;
        }
    },
    {
        name: "save_memory",
        description: "Save an important piece of information to long-term memory.",
        schema: z.object({
            content: z.string().describe("The information to remember"),
            type: z.enum(["episodic", "semantic", "procedural"]).optional().describe("Type of memory (default: semantic)"),
            importance: z.number().min(0).max(1).optional().describe("How important is this? 0-1 (default: 0.8)"),
            source: z.string().optional().describe("The source of the memory (default: user_input)"),
        }),
    }
);
