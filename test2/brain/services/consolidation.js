// ============================================================
//  Memory Services — Consolidation
//
//  Moves short-term buffer to long-term memory:
//  - Extract important information
//  - Score importance
//  - Store as episodic/semantic/procedural memories
// ============================================================

import { getMemoryStore } from "../stores/index.js";
import { reasoningModel } from "../../lib/models.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * @typedef {Object} ConsolidationResult
 * @property {number} processed - Items processed from buffer
 * @property {number} stored - Items stored as memories
 * @property {number} discarded - Items discarded (low importance)
 */

export class ConsolidationService {
    constructor() {
        this.memoryStore = getMemoryStore();
    }

    // ─────────────────────────────────────────────────────────────
    // Main Consolidation
    // ─────────────────────────────────────────────────────────────

    /**
     * Run consolidation on the buffer
     * @param {Object} [options]
     * @param {number} [options.maxItems] - Max items to process
     * @returns {Promise<ConsolidationResult>}
     */
    async consolidate(options = {}) {
        const maxItems = options.maxItems || 50;
        const buffer = this.memoryStore.getRecentBuffer(maxItems);

        if (buffer.length === 0) {
            return { processed: 0, stored: 0, discarded: 0 };
        }

        console.log(`[Consolidation] Processing ${buffer.length} buffer items`);

        let stored = 0;
        let discarded = 0;

        // Group buffer items by branch for context
        const byBranch = {};
        for (const item of buffer) {
            const branchId = item.branchId || "global";
            if (!byBranch[branchId]) byBranch[branchId] = [];
            byBranch[branchId].push(item);
        }

        // Process each branch's items together
        for (const [branchId, items] of Object.entries(byBranch)) {
            const result = await this._consolidateBranch(branchId, items);
            stored += result.stored;
            discarded += result.discarded;
        }

        // Clear processed items from buffer
        this.memoryStore.clearBuffer(buffer.map((b) => b.id));

        console.log(`[Consolidation] Complete: ${stored} stored, ${discarded} discarded`);

        return { processed: buffer.length, stored, discarded };
    }

    /**
     * Consolidate items from a single branch
     * @param {string} branchId
     * @param {Object[]} items
     * @returns {Promise<{stored: number, discarded: number}>}
     */
    async _consolidateBranch(branchId, items) {
        // Build context from items
        const context = items
            .map((i) => `[${i.eventType}] ${i.content}`)
            .join("\n");

        // Use LLM to extract important information
        const prompt = `Analyze this conversation excerpt and extract important information worth remembering:

${context}

Extract:
1. Key facts learned (about people, topics, preferences)
2. Important decisions made
3. Commitments or promises
4. Skills or techniques demonstrated
5. Relationship insights

For each extraction, rate importance 0-1 and classify as:
- "episodic" (specific event/moment)
- "semantic" (general knowledge/fact)
- "procedural" (skill/how-to)

Return as JSON array:
[{"content": "...", "importance": 0.7, "type": "semantic"}, ...]

If nothing important, return empty array: []`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("Extract memories worth keeping. Be selective - only truly important things."),
                new HumanMessage(prompt),
            ]);

            const content = response.content || "";

            // Parse extractions
            let extractions = [];
            try {
                const match = content.match(/\[[\s\S]*\]/);
                if (match) {
                    extractions = JSON.parse(match[0]);
                }
            } catch {
                // If parsing fails, try to extract manually
                extractions = [];
            }

            // Store valid extractions
            let stored = 0;
            for (const ext of extractions) {
                if (ext.content && ext.importance > 0.4) {
                    await this.memoryStore.store({
                        type: ext.type || "semantic",
                        content: ext.content,
                        importance: ext.importance,
                        branchId: branchId !== "global" ? branchId : undefined,
                    });
                    stored++;
                }
            }

            return { stored, discarded: items.length - stored };
        } catch (e) {
            console.error("[Consolidation] Error processing branch:", e);
            return { stored: 0, discarded: items.length };
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Importance Scoring
    // ─────────────────────────────────────────────────────────────

    /**
     * Score importance of a piece of information
     * @param {string} content
     * @param {Object} context
     * @returns {Promise<number>} - 0-1 importance score
     */
    async scoreImportance(content, context = {}) {
        // Heuristic scoring for efficiency
        let score = 0.5;

        // Owner involvement increases importance
        if (context.involvedOwner) score += 0.2;

        // Questions often contain important info
        if (content.includes("?")) score += 0.1;

        // Personal information is important
        if (/\b(my|their|your)\s+(name|age|birthday|address|number)/i.test(content)) {
            score += 0.3;
        }

        // Commitments are important
        if (/\b(will|promise|commit|remember|don't forget)\b/i.test(content)) {
            score += 0.2;
        }

        // Preferences are important
        if (/\b(like|love|hate|prefer|favorite|dislike)\b/i.test(content)) {
            score += 0.15;
        }

        return Math.min(1, score);
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {ConsolidationService|null} */
let instance = null;

export function getConsolidationService() {
    if (!instance) {
        instance = new ConsolidationService();
    }
    return instance;
}
