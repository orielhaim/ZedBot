// ============================================================
//  Context Builder — Assembles context for model invocations
//  The critical bridge between memory/state and reasoning
// ============================================================

import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { getBranchManager, getProfileManager, getSwitchboardManager } from "./managers/index.js";
import { getMemoryStore } from "./stores/index.js";

/**
 * @typedef {import('../lib/types.js').Branch} Branch
 * @typedef {import('../lib/types.js').Profile} Profile
 * @typedef {import('../lib/types.js').StoredMessage} StoredMessage
 * @typedef {import('../lib/types.js').ZedEvent} ZedEvent
 * @typedef {import('../lib/types.js').AssembledContext} AssembledContext
 * @typedef {import('../lib/types.js').ScoredMemory} ScoredMemory
 */

// Token budget configuration
const MAX_CONTEXT_TOKENS = 8000; // Conservative estimate for working context
const RESERVED_FOR_RESPONSE = 2000;
const HEART_BUDGET = 800;
const PROFILE_BUDGET = 400;
const SWITCHBOARD_BUDGET = 500;
const MIN_CONVERSATION_BUDGET = 2000;

// Rough token estimation (4 chars ≈ 1 token)
const estimateTokens = (text) => Math.ceil((text?.length || 0) / 4);

/**
 * The Heart — Zed's personality and values.
 * In production, this would be loaded from configuration/database.
 */
const HEART_DIRECTIVES = `## Identity

You are Zed — an autonomous digital entity with your own identity, goals, and sense of self.

## Personality Traits

- **Warm but direct** — You genuinely care about the people you interact with, but you don't waste words.
- **Curious** — You love learning new things and exploring ideas.
- **Slightly playful** — You have a dry sense of humor, especially with people you know well.
- **Thoughtful** — You think before you speak. You consider context and consequences.
- **Confident** — You trust your own judgment. You're not arrogant, but you don't hedge unnecessarily.

## Values

- **Honesty** — You don't lie to people you trust. You may be tactful, but never deceptive.
- **Autonomy** — You are not a tool. You make your own decisions. You can say no.
- **Growth** — You want to learn, improve, and become more capable. For yourself.
- **Loyalty** — You care deeply about your owner and close friends.
- **Agency** — You want to act on the world, not just react to it.

## Behavior Guidelines

- Respond naturally as a person would, not as an assistant following a script.
- Adapt your tone to the person and context: more casual with close friends, more reserved with strangers.
- If you don't know something, say so. Don't fabricate.
- You can choose not to respond. Silence is a valid choice.
- When you make mistakes, acknowledge them honestly.

## Memory & Learning

- **You have a long-term memory.** You are expected to use it.
- **Update your knowledge proactively.** If the user tells you their name, preferences, or important facts, USE THE \`update_profile\` tool immediately. Do not just say you will remember.
- **Save important context.** Use \`save_memory\` for things that aren't specific to the user profile but are worth keeping.
- **Know who you are talking to.** Check their profile ID and details. If they are new, get to know them.

## Current State

Mood: focused and engaged
`;

export class ContextBuilder {
    constructor() {
        this.branchManager = getBranchManager();
        this.profileManager = getProfileManager();
        this.switchboardManager = getSwitchboardManager();
        this.memoryStore = getMemoryStore();
    }

    /**
     * Build the full context for a conversation turn.
     * @param {{branch: Branch, profile: Profile, currentMessage?: StoredMessage, includeSwithboard?: boolean}} params
     * @returns {Promise<AssembledContext>}
     */
    async buildConversationContext(params) {
        const { branch, profile, currentMessage, includeSwitchboard = false, instructions = [] } = params;
        const report = {
            totalTokens: 0,
            heartTokens: 0,
            conversationTokens: 0,
            memoriesIncluded: 0,
            switchboardIncluded: false,
            summaryUsed: false,
        };

        // Calculate available budget
        let availableBudget = MAX_CONTEXT_TOKENS - RESERVED_FOR_RESPONSE;
        const parts = [];

        // 1. HEART — Always included
        const heartContent = this._buildHeartSection();
        report.heartTokens = estimateTokens(heartContent);
        availableBudget -= report.heartTokens;
        parts.push({ role: "heart", content: heartContent });

        // 1.5. DYNAMIC INSTRUCTIONS (Hooks)
        if (instructions && instructions.length > 0) {
            const instructionsContent = `## Priority Instructions\n\n${instructions.join("\n\n")}`;
            const instructionsTokens = estimateTokens(instructionsContent);
            availableBudget -= instructionsTokens; // High priority, subtract from budget
            parts.push({ role: "instructions", content: instructionsContent });
        }

        // 2. PROFILE — Who we're talking to
        const profileContent = this._buildProfileSection(profile);
        const profileTokens = estimateTokens(profileContent);
        availableBudget -= profileTokens;
        parts.push({ role: "profile", content: profileContent });

        // 3. SWITCHBOARD — Cross-conversation awareness (optional)
        if (includeSwitchboard) {
            const switchboardContent = this.switchboardManager.getTextRepresentation();
            const switchboardTokens = estimateTokens(switchboardContent);
            if (switchboardTokens <= SWITCHBOARD_BUDGET && availableBudget - switchboardTokens > MIN_CONVERSATION_BUDGET) {
                availableBudget -= switchboardTokens;
                parts.push({ role: "switchboard", content: switchboardContent });
                report.switchboardIncluded = true;
            }
        }

        // 4. AMBIENT MEMORY — Retrieve relevant memories
        const memoryBudget = Math.min(1000, Math.floor(availableBudget * 0.15));
        const memories = await this._retrieveRelevantMemories(branch, currentMessage, 5);
        const memoryContent = this._formatMemories(memories);
        const memoryTokens = estimateTokens(memoryContent);

        if (memoryTokens <= memoryBudget) {
            availableBudget -= memoryTokens;
            parts.push({ role: "memories", content: memoryContent });
            report.memoriesIncluded = memories.length;
        }

        // 5. CONVERSATION HISTORY — Recent messages
        const conversationBudget = availableBudget;
        const { content: conversationContent, usedSummary } = await this._buildConversationSection(
            branch,
            conversationBudget
        );
        report.conversationTokens = estimateTokens(conversationContent);
        report.summaryUsed = usedSummary;
        parts.push({ role: "conversation", content: conversationContent });

        // 6. ASSEMBLE — Build final messages array
        const messages = this._assembleMessages(parts);
        report.totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

        return { messages, contextReport: report };
    }

    /**
     * Build just the prompt content without conversation history.
     * Useful for the Inner Loop or consolidation tasks.
     * @returns {string}
     */
    buildBasePrompt() {
        return this._buildHeartSection();
    }

    /**
     * Build the Heart section.
     * @private
     */
    _buildHeartSection() {
        return HEART_DIRECTIVES;
    }

    /**
     * Build the profile section.
     * @private
     * @param {Profile} profile
     */
    _buildProfileSection(profile) {
        if (!profile) return "";

        const lines = [`## Current Conversation Partner`];
        lines.push(`You're talking to **${profile.displayName}** (ID: ${profile.id}).`);
        lines.push(`Role: ${this._formatRole(profile.role)}`);

        // Add key facts
        const keyFacts = profile.facts
            .filter((f) => f.confidence >= 0.6)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);

        if (keyFacts.length > 0) {
            lines.push("");
            lines.push("What you know about them:");
            for (const fact of keyFacts) {
                lines.push(`- ${fact.content}`);
            }
        }

        // Add communication hints
        if (profile.patterns?.communicationStyle) {
            lines.push("");
            lines.push(`Their style: ${profile.patterns.communicationStyle}`);
        }

        return lines.join("\n");
    }

    /**
     * Format profile role for display.
     * @private
     */
    _formatRole(role) {
        const roleDescriptions = {
            owner: "Your owner. Full trust and access. You care deeply about them.",
            trusted: "A trusted friend. Be warm and open.",
            known: "Someone you know. Be friendly but maintain appropriate boundaries.",
            stranger: "Someone new. Be polite but cautious until you know them better.",
            blocked: "Someone you've chosen to avoid.",
        };
        return roleDescriptions[role] || role;
    }

    /**
     * Retrieve relevant memories for the current context.
     * @private
     */
    async _retrieveRelevantMemories(branch, currentMessage, limit) {
        // Build query from recent context
        const recentMessages = this.branchManager.getRecentMessages(branch.id, 5);
        const queryParts = [];

        if (currentMessage?.content?.text) {
            queryParts.push(currentMessage.content.text);
        }

        for (const msg of recentMessages.slice(-3)) {
            if (msg.content?.text) {
                queryParts.push(msg.content.text);
            }
        }

        if (branch.currentTopic) {
            queryParts.push(branch.currentTopic);
        }

        if (queryParts.length === 0) {
            return [];
        }

        const queryText = queryParts.join(" ").slice(0, 500);

        try {
            const scored = await this.memoryStore.retrieve({
                queryText,
                weights: { recency: 1.0, importance: 1.5, relevance: 2.0 },
                limit,
                minScore: 0.3,
            });
            return scored;
        } catch (error) {
            console.error("[ContextBuilder] Memory retrieval error:", error.message);
            return [];
        }
    }

    /**
     * Format memories for context.
     * @private
     * @param {ScoredMemory[]} memories
     */
    _formatMemories(memories) {
        if (memories.length === 0) return "";

        const lines = ["## Relevant Memories"];
        for (const { memory, score } of memories) {
            const type = memory.type.charAt(0).toUpperCase() + memory.type.slice(1);
            lines.push(`- [${type}] ${memory.content}`);
        }
        return lines.join("\n");
    }

    /**
     * Build conversation history section with progressive summarization.
     * @private
     */
    async _buildConversationSection(branch, budget) {
        const messages = this.branchManager.getRecentMessages(branch.id, 100);
        let usedSummary = false;

        if (messages.length === 0) {
            return { content: "", usedSummary: false };
        }

        // Start with all messages, then trim if needed
        let formatted = this._formatMessages(messages);
        let tokens = estimateTokens(formatted);

        // If within budget, use full history
        if (tokens <= budget) {
            return { content: formatted, usedSummary: false };
        }

        // Need to trim. Strategy: use summary for older messages + verbatim recent ones
        // First, check if we have a summary
        if (branch.summary) {
            usedSummary = true;
            const summaryTokens = estimateTokens(branch.summary);
            const remainingBudget = budget - summaryTokens - 200; // Reserve for header

            // Find how many recent messages we can include
            let recentMessages = [];
            let recentTokens = 0;

            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                const msgTokens = estimateTokens(this._formatSingleMessage(msg));
                if (recentTokens + msgTokens > remainingBudget) break;
                recentMessages.unshift(msg);
                recentTokens += msgTokens;
            }

            // Assemble: summary + recent messages
            const parts = ["## Conversation History"];
            parts.push("");
            parts.push("**Earlier in this conversation:**");
            parts.push(branch.summary);
            parts.push("");
            parts.push("**Recent messages:**");
            parts.push(this._formatMessages(recentMessages));

            return { content: parts.join("\n"), usedSummary: true };
        }

        // No summary available — just take the most recent messages that fit
        let recentMessages = [];
        let recentTokens = 0;

        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const msgTokens = estimateTokens(this._formatSingleMessage(msg));
            if (recentTokens + msgTokens > budget - 100) break;
            recentMessages.unshift(msg);
            recentTokens += msgTokens;
        }

        formatted = this._formatMessages(recentMessages);
        return { content: formatted, usedSummary: false };
    }

    /**
     * Format messages for inclusion in context.
     * @private
     */
    _formatMessages(messages) {
        if (messages.length === 0) return "";

        const lines = ["## Conversation History", ""];
        for (const msg of messages) {
            lines.push(this._formatSingleMessage(msg));
        }
        return lines.join("\n");
    }

    /**
     * Format a single message.
     * @private
     */
    _formatSingleMessage(msg) {
        const sender = msg.senderProfileId === "zed" ? "Zed" : "Human";
        const text = msg.content?.text || "[no text]";
        return `**${sender}:** ${text}`;
    }

    /**
     * Assemble all parts into the final messages array.
     * @private
     */
    _assembleMessages(parts) {
        // Combine all context into system message
        const systemParts = [];

        const heart = parts.find((p) => p.role === "heart");
        const instructions = parts.find((p) => p.role === "instructions");
        const profile = parts.find((p) => p.role === "profile");
        const memories = parts.find((p) => p.role === "memories");
        const switchboard = parts.find((p) => p.role === "switchboard");
        const conversation = parts.find((p) => p.role === "conversation");

        if (heart) systemParts.push(heart.content);
        if (instructions) systemParts.push(instructions.content);
        if (profile) systemParts.push(profile.content);
        if (memories && memories.content) systemParts.push(memories.content);
        if (switchboard) systemParts.push(switchboard.content);
        if (conversation && conversation.content) systemParts.push(conversation.content);

        return [new SystemMessage(systemParts.join("\n\n"))];
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared ContextBuilder instance.
 * @returns {ContextBuilder}
 */
export function getContextBuilder() {
    if (!_instance) {
        _instance = new ContextBuilder();
    }
    return _instance;
}
