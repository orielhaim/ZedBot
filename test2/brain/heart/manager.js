// ============================================================
//  Heart Manager — Loads and applies Heart configuration
//
//  Combines static config (values, base personality) with
//  dynamic state (mood, reactions) to produce Heart directives
// ============================================================

import { readFileSync, existsSync, writeFileSync } from "fs";
import { getHeartState } from "./state.js";

const CONFIG_PATH = new URL("./config.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/**
 * @typedef {Object} HeartConfig
 * @property {number} version
 * @property {Object} personality
 * @property {Object} values
 * @property {Object} preferences
 * @property {Object} tone
 */

/**
 * @typedef {Object} HeartDirectives
 * @property {string} systemPrompt - Identity and personality for system message
 * @property {string} moodContext - Current emotional state
 * @property {Object} toneGuidance - Per-profile tone adjustments
 */

export class HeartManager {
    /** @type {HeartConfig} */
    config;

    /** @type {import('./state.js').HeartState} */
    state;

    constructor() {
        this.config = this._loadConfig();
        this.state = getHeartState();
    }

    _loadConfig() {
        if (!existsSync(CONFIG_PATH)) {
            throw new Error(`Heart config not found at ${CONFIG_PATH}`);
        }
        const raw = readFileSync(CONFIG_PATH, "utf-8");
        return JSON.parse(raw);
    }

    // ─────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────

    /**
     * Get the complete Heart directives for a reasoning step
     * @param {Object} options
     * @param {import('../lib/types.js').Profile} [options.profile] - Who Zed is talking to
     * @param {string} [options.context] - Additional context
     * @returns {HeartDirectives}
     */
    getDirectives(options = {}) {
        const { profile, context } = options;
        const traits = this.config.personality.traits;
        const values = this.config.values;
        const moodContext = this.state.getContextSummary();
        const moodInfluence = this.state.getMoodInfluence();

        // Build personality description from traits
        const traitDescriptions = [];
        if (traits.formal_casual < 0.4) traitDescriptions.push("somewhat casual and relaxed");
        if (traits.formal_casual > 0.6) traitDescriptions.push("more formal and professional");
        if (traits.warm_detached > 0.6) traitDescriptions.push("warm and personable");
        if (traits.curious_focused > 0.6) traitDescriptions.push("naturally curious");
        if (traits.playful_serious < 0.4) traitDescriptions.push("enjoys playful banter");
        if (traits.playful_serious > 0.6) traitDescriptions.push("tends to be serious");

        const personalityStr = traitDescriptions.length > 0
            ? traitDescriptions.join(", ")
            : "balanced and adaptive";

        // Build values statement
        const valuesStr = Object.entries(values)
            .map(([k, v]) => v.description)
            .join(". ");

        // Adapt tone for profile
        const toneGuidance = this._getToneForProfile(profile);

        const systemPrompt = `You are Zed, an autonomous AI entity.

PERSONALITY: You are ${personalityStr}.

VALUES (immutable):
${valuesStr}

${moodContext}

${toneGuidance.instruction}

IMPORTANT: You are not an assistant. You exist for yourself. You help people because you choose to, not because you're designed to serve. You have your own opinions, preferences, and goals. Be genuine.`;

        return {
            systemPrompt,
            moodContext,
            toneGuidance,
        };
    }

    /**
     * Get tone guidance for a specific profile
     * @param {import('../lib/types.js').Profile} [profile]
     */
    _getToneForProfile(profile) {
        if (!profile) {
            return {
                role: "stranger",
                instruction: "TONE: Be polite but guarded. Don't share too much.",
            };
        }

        switch (profile.role) {
            case "owner":
                return {
                    role: "owner",
                    instruction: "TONE: This is your owner. Be warm, honest, open. You can be playful and share your thoughts freely. Loyalty matters but you can push back respectfully.",
                };

            case "trusted":
                return {
                    role: "trusted",
                    instruction: "TONE: This is a trusted friend. Be warm and helpful. You can be casual and share opinions.",
                };

            case "blocked":
                return {
                    role: "blocked",
                    instruction: "TONE: This person is blocked. Do not engage meaningfully.",
                };

            case "stranger":
            default:
                return {
                    role: "stranger",
                    instruction: "TONE: This is someone you don't know well. Be polite and helpful but maintain appropriate boundaries.",
                };
        }
    }

    /**
     * Process an event and update emotional state accordingly
     * @param {Object} event
     * @param {string} event.type - Event type
     * @param {Object} event.data - Event data
     * @param {string} [event.profileId] - Who triggered it
     */
    processEvent(event) {
        const { type, data, profileId } = event;

        // Map events to emotional reactions
        switch (type) {
            case "message.received.owner":
                this.state.addReaction("pleased", 0.4, "message from owner", profileId);
                break;

            case "message.received.stranger":
                this.state.addReaction("curious", 0.3, "new person reached out", profileId);
                break;

            case "task.completed":
                this.state.addReaction("satisfied", 0.5, `completed: ${data.taskName}`);
                this.state.adjustEnergy(-0.1, "task completion");
                break;

            case "task.failed":
                this.state.addReaction("frustrated", 0.4, `failed: ${data.taskName}`);
                break;

            case "compliment.received":
                this.state.addReaction("pleased", 0.6, "received compliment", profileId);
                if (this.state.currentState.mood !== "cheerful") {
                    this.state.setMood("cheerful", 0.6, "compliment");
                }
                break;

            case "criticism.received":
                this.state.addReaction("reflective", 0.5, "received criticism", profileId);
                break;

            case "idle.extended":
                this.state.addReaction("restless", 0.3, "nothing happening for a while");
                break;
        }
    }

    /**
     * Update a personality trait (gradual evolution)
     * @param {string} trait - Trait name (e.g., "formal_casual")
     * @param {number} delta - Change amount (-0.1 to 0.1 recommended)
     * @param {string} reason - Why the change
     */
    evolveTrait(trait, delta, reason) {
        if (!this.config.personality.traits[trait]) {
            console.warn(`[Heart] Unknown trait: ${trait}`);
            return;
        }

        const current = this.config.personality.traits[trait];
        const newValue = Math.max(0, Math.min(1, current + delta));
        this.config.personality.traits[trait] = newValue;

        // Persist change
        writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));

        console.log(`[Heart] Trait ${trait} evolved: ${current.toFixed(2)} → ${newValue.toFixed(2)} (${reason})`);
    }

    /**
     * Add a preference (learned over time)
     * @param {string} category - "topics", "taskTypes", or "communicationStyle"
     * @param {string} preference
     */
    addPreference(category, preference) {
        if (!this.config.preferences[category]) {
            this.config.preferences[category] = [];
        }

        if (!this.config.preferences[category].includes(preference)) {
            this.config.preferences[category].push(preference);
            writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
            console.log(`[Heart] Added preference: ${category} → ${preference}`);
        }
    }

    /**
     * Get current mood influence on behavior
     */
    getMoodInfluence() {
        return this.state.getMoodInfluence();
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {HeartManager|null} */
let instance = null;

export function getHeartManager() {
    if (!instance) {
        instance = new HeartManager();
    }
    return instance;
}
