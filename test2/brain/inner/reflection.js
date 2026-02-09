// ============================================================
//  Inner Layer — Reflection
//
//  Self-evaluation and learning from experience:
//  - Review recent events and form assessments
//  - Learn from mistakes and successes
//  - Observe patterns across conversations
// ============================================================

import { reasoningModel } from "../../lib/models.js";
import { getMemoryStore } from "../stores/index.js";
import { getBranchManager } from "../managers/index.js";
import { getHeartManager } from "../heart/index.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * @typedef {Object} Reflection
 * @property {string} id
 * @property {string} type - 'assessment' | 'lesson' | 'observation' | 'self_evaluation'
 * @property {string} content
 * @property {string[]} relatedBranchIds
 * @property {number} timestamp
 */

export class ReflectionEngine {
    constructor() {
        this.memoryStore = getMemoryStore();
        this.branchManager = getBranchManager();
        this.heartManager = getHeartManager();
    }

    // ─────────────────────────────────────────────────────────────
    // Reflection Types
    // ─────────────────────────────────────────────────────────────

    /**
     * Reflect on recent events (conversation, interactions)
     * @param {Object} context - Recent context from awareness
     * @returns {Promise<Reflection[]>}
     */
    async reflectOnRecentEvents(context) {
        const reflections = [];

        // Get recent events from memory buffer
        const recentEvents = this.memoryStore.getRecentBuffer(20);
        if (recentEvents.length === 0) return reflections;

        // Build prompt for reflection
        const eventSummary = recentEvents
            .map((e) => `- [${e.eventType}] ${e.content.slice(0, 100)}`)
            .join("\n");

        const prompt = `You are reflecting on recent events. Be honest and introspective.

Recent events:
${eventSummary}

Current emotional state: ${this.heartManager.getDirectives().moodContext}

Questions to consider:
1. How did these interactions go?
2. Did I make any mistakes or could I have done better?
3. Did I learn anything new?
4. How do I feel about these interactions?

Provide a brief, honest reflection. Be specific about what went well and what didn't.`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("You are Zed's inner voice, reflecting privately. Be honest and introspective."),
                new HumanMessage(prompt),
            ]);

            const content = response.content || "";

            // Store as episodic memory
            await this.memoryStore.store({
                type: "episodic",
                content: `[Reflection] ${content}`,
                importance: 0.6,
                metadata: { reflectionType: "events" },
            });

            reflections.push({
                id: `ref-${Date.now()}`,
                type: "assessment",
                content,
                relatedBranchIds: recentEvents.map((e) => e.branchId).filter(Boolean),
                timestamp: Date.now(),
            });
        } catch (e) {
            console.error("[Reflection] Error reflecting on events:", e);
        }

        return reflections;
    }

    /**
     * Self-evaluation: Am I being consistent with my values?
     * @returns {Promise<Reflection|null>}
     */
    async selfEvaluate() {
        const recentResponses = this.memoryStore.getRecentBuffer(10)
            .filter((e) => e.eventType === "message.outgoing");

        if (recentResponses.length < 3) return null;

        const responseSamples = recentResponses
            .map((r) => r.content.slice(0, 200))
            .join("\n---\n");

        const { systemPrompt } = this.heartManager.getDirectives();

        const prompt = `Review these recent responses I gave:

${responseSamples}

My values and personality:
${systemPrompt}

Self-evaluation questions:
1. Am I being consistent with my personality?
2. Am I being too verbose or too concise?
3. Am I being genuine, not just helpful?
4. Is there anything I should adjust?

Be honest and specific.`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("You are evaluating your own behavior. Be honest about what you see."),
                new HumanMessage(prompt),
            ]);

            const content = response.content || "";

            // Check for personality drift indicators
            if (content.toLowerCase().includes("too verbose")) {
                this.heartManager.evolveTrait("verbose_concise", 0.05, "self-evaluation: too verbose");
            }
            if (content.toLowerCase().includes("too formal")) {
                this.heartManager.evolveTrait("formal_casual", -0.05, "self-evaluation: too formal");
            }

            return {
                id: `eval-${Date.now()}`,
                type: "self_evaluation",
                content,
                relatedBranchIds: [],
                timestamp: Date.now(),
            };
        } catch (e) {
            console.error("[Reflection] Error in self-evaluation:", e);
            return null;
        }
    }

    /**
     * Learn from a specific mistake
     * @param {string} mistake - Description of the mistake
     * @param {string} context - Context where it happened
     * @returns {Promise<Reflection|null>}
     */
    async learnFromMistake(mistake, context) {
        const prompt = `I made a mistake:
${mistake}

Context:
${context}

What should I learn from this? How can I avoid this in the future?`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("Extract a practical lesson from this mistake. Be specific."),
                new HumanMessage(prompt),
            ]);

            const lesson = response.content || "";

            // Store as procedural memory (learned skill/rule)
            await this.memoryStore.store({
                type: "procedural",
                content: `[Lesson] ${lesson}`,
                importance: 0.8,
                metadata: { source: "mistake", original: mistake },
            });

            return {
                id: `lesson-${Date.now()}`,
                type: "lesson",
                content: lesson,
                relatedBranchIds: [],
                timestamp: Date.now(),
            };
        } catch (e) {
            console.error("[Reflection] Error learning from mistake:", e);
            return null;
        }
    }

    /**
     * Observe patterns across conversations
     * @returns {Promise<Reflection[]>}
     */
    async observePatterns() {
        const activeBranches = this.branchManager.getActiveBranches();
        if (activeBranches.length < 2) return [];

        const reflections = [];

        // Look for common questions/topics across branches
        const topics = {};
        for (const branch of activeBranches) {
            const recent = this.branchManager.getRecentMessages(branch.id, 5);
            for (const msg of recent) {
                const text = msg.content?.text?.toLowerCase() || "";
                // Simple pattern detection - could be enhanced
                if (text.includes("?")) {
                    topics["questions"] = (topics["questions"] || 0) + 1;
                }
                if (text.includes("help")) {
                    topics["help_requests"] = (topics["help_requests"] || 0) + 1;
                }
            }
        }

        if (topics["questions"] > 3) {
            reflections.push({
                id: `obs-${Date.now()}`,
                type: "observation",
                content: "I'm getting a lot of questions lately. Should prepare better answers.",
                relatedBranchIds: activeBranches.map((b) => b.id),
                timestamp: Date.now(),
            });
        }

        return reflections;
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {ReflectionEngine|null} */
let instance = null;

export function getReflectionEngine() {
    if (!instance) {
        instance = new ReflectionEngine();
    }
    return instance;
}
