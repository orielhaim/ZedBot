// ============================================================
//  Memory Services — Summarization
//
//  Progressive conversation summarization:
//  - Compress long conversation histories
//  - Maintain key context while reducing tokens
//  - On-demand summarization for context building
// ============================================================

import { getBranchManager } from "../managers/index.js";
import { reasoningModel } from "../../lib/models.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * @typedef {Object} Summary
 * @property {string} branchId
 * @property {string} content
 * @property {number} messageCount - Messages summarized
 * @property {number} createdAt
 */

export class SummarizationService {
    constructor() {
        this.branchManager = getBranchManager();
        this.cache = new Map(); // branchId -> Summary
    }

    // ─────────────────────────────────────────────────────────────
    // Progressive Summarization
    // ─────────────────────────────────────────────────────────────

    /**
     * Generate a summary of a conversation branch
     * @param {string} branchId
     * @param {Object} [options]
     * @returns {Promise<Summary>}
     */
    async summarizeBranch(branchId, options = {}) {
        const maxMessages = options.maxMessages || 50;
        const messages = this.branchManager.getRecentMessages(branchId, maxMessages);

        if (messages.length === 0) {
            return {
                branchId,
                content: "No messages yet.",
                messageCount: 0,
                createdAt: Date.now(),
            };
        }

        // Check cache
        const cached = this.cache.get(branchId);
        if (cached && cached.messageCount === messages.length) {
            return cached;
        }

        // Build transcript
        const transcript = messages
            .map((m) => {
                const sender = m.senderProfileId === "zed" ? "Zed" : "User";
                return `${sender}: ${m.content?.text || "[no text]"}`;
            })
            .join("\n");

        const prompt = `Summarize this conversation, preserving:
- Key topics discussed
- Important decisions or commitments made
- The current state/context of the conversation
- Any pending questions or tasks

Conversation:
${transcript}

Provide a concise summary (2-4 paragraphs max).`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("Create a concise but complete conversation summary."),
                new HumanMessage(prompt),
            ]);

            const summary = {
                branchId,
                content: response.content || "",
                messageCount: messages.length,
                createdAt: Date.now(),
            };

            this.cache.set(branchId, summary);
            return summary;
        } catch (e) {
            console.error("[Summarization] Error summarizing branch:", e);
            return {
                branchId,
                content: `Conversation with ${messages.length} messages.`,
                messageCount: messages.length,
                createdAt: Date.now(),
            };
        }
    }

    /**
     * Get or create a summary for context injection
     * @param {string} branchId
     * @returns {Promise<string>}
     */
    async getSummaryForContext(branchId) {
        const summary = await this.summarizeBranch(branchId);
        return summary.content;
    }

    // ─────────────────────────────────────────────────────────────
    // Incremental Updates
    // ─────────────────────────────────────────────────────────────

    /**
     * Update an existing summary with new messages
     * @param {string} branchId
     * @param {number} newMessageCount
     * @returns {Promise<Summary>}
     */
    async updateSummary(branchId, newMessageCount) {
        const cached = this.cache.get(branchId);
        if (!cached) {
            return this.summarizeBranch(branchId);
        }

        const messages = this.branchManager.getRecentMessages(branchId, newMessageCount);
        const newMessages = messages.slice(-newMessageCount);

        if (newMessages.length === 0) {
            return cached;
        }

        const newTranscript = newMessages
            .map((m) => {
                const sender = m.senderProfileId === "zed" ? "Zed" : "User";
                return `${sender}: ${m.content?.text || "[no text]"}`;
            })
            .join("\n");

        const prompt = `Update this conversation summary with new messages:

Existing summary:
${cached.content}

New messages:
${newTranscript}

Provide an updated summary that incorporates the new information.`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("Update the summary to include new information."),
                new HumanMessage(prompt),
            ]);

            const summary = {
                branchId,
                content: response.content || "",
                messageCount: cached.messageCount + newMessages.length,
                createdAt: Date.now(),
            };

            this.cache.set(branchId, summary);
            return summary;
        } catch (e) {
            console.error("[Summarization] Error updating summary:", e);
            return cached;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Topic Extraction
    // ─────────────────────────────────────────────────────────────

    /**
     * Extract current topic from a conversation
     * @param {string} branchId
     * @returns {Promise<string>}
     */
    async extractTopic(branchId) {
        const messages = this.branchManager.getRecentMessages(branchId, 5);
        if (messages.length === 0) return "No topic";

        const transcript = messages
            .map((m) => m.content?.text || "")
            .join(" ");

        // Simple topic extraction
        const prompt = `What is the current topic of this conversation? One short phrase only.

${transcript}`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("Extract the main topic in 2-5 words."),
                new HumanMessage(prompt),
            ]);

            return (response.content || "").trim();
        } catch {
            return "General conversation";
        }
    }

    /**
     * Clear cache for a branch
     * @param {string} branchId
     */
    clearCache(branchId) {
        this.cache.delete(branchId);
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {SummarizationService|null} */
let instance = null;

export function getSummarizationService() {
    if (!instance) {
        instance = new SummarizationService();
    }
    return instance;
}
