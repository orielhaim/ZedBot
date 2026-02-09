// ============================================================
//  Proactive Communication
//
//  Handles Zed-initiated outreach:
//  - Check-ins with people
//  - Notifications about blocked goals
//  - Sharing discoveries/interests
//  - Scheduled reminders
// ============================================================

import { getProfileManager, getBranchManager } from "../managers/index.js";
import { getGoalManager } from "../goals/index.js";
import { getHeartManager } from "../heart/index.js";
import { getPresenceRouter } from "../presence/router.js";
import { sendProactiveMessage } from "../index.js";
import { reasoningModel } from "../../lib/models.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * @typedef {Object} OutreachDecision
 * @property {boolean} shouldReach
 * @property {string} reason
 * @property {string} [message]
 */

export class ProactiveCommunication {
    constructor() {
        this.profileManager = getProfileManager();
        this.branchManager = getBranchManager();
        this.goalManager = getGoalManager();
        this.heartManager = getHeartManager();
        this.lastOutreach = new Map(); // profileId -> timestamp
    }

    // ─────────────────────────────────────────────────────────────
    // Check-ins
    // ─────────────────────────────────────────────────────────────

    /**
     * Check if Zed should reach out to someone
     * @param {string} profileId
     * @param {string} reason - Why considering reaching out
     * @returns {Promise<OutreachDecision>}
     */
    async shouldReachOut(profileId, reason) {
        const profile = this.profileManager.getProfile(profileId);
        if (!profile) {
            return { shouldReach: false, reason: "Profile not found" };
        }

        // Check cooldown (don't spam)
        const lastContact = this.lastOutreach.get(profileId) || 0;
        const timeSince = Date.now() - lastContact;
        const minGap = profile.role === "owner" ? 3600000 : 86400000; // 1h for owner, 24h for others

        if (timeSince < minGap) {
            return { shouldReach: false, reason: "Too soon since last outreach" };
        }

        // Get mood influence
        const moodInfluence = this.heartManager.getMoodInfluence();
        if (moodInfluence.proactivityBoost < -0.2) {
            return { shouldReach: false, reason: "Mood not conducive to outreach" };
        }

        // For owner, be more proactive
        if (profile.role === "owner") {
            return {
                shouldReach: true,
                reason: `Want to check in: ${reason}`,
            };
        }

        // For others, be more selective
        const probability = 0.3 + moodInfluence.proactivityBoost;
        if (Math.random() < probability) {
            return {
                shouldReach: true,
                reason,
            };
        }

        return { shouldReach: false, reason: "Decided not to this time" };
    }

    /**
     * Generate a check-in message for someone
     * @param {string} profileId
     * @param {string} reason
     * @returns {Promise<string>}
     */
    async generateCheckInMessage(profileId, reason) {
        const profile = this.profileManager.getProfile(profileId);
        const { systemPrompt } = this.heartManager.getDirectives({ profile });

        const prompt = `Generate a casual check-in message.

Context: ${reason}
Person: ${profile?.displayName || "Someone"}
Relationship: ${profile?.role || "stranger"}

Keep it natural and genuine. Don't be overly formal. 1-2 sentences.`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(prompt),
            ]);

            return response.content || "Hey, just checking in!";
        } catch {
            return "Hey, was thinking about you. How are things?";
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Notifications
    // ─────────────────────────────────────────────────────────────

    /**
     * Notify owner about something
     * @param {string} subject - What to notify about
     * @param {string} details - More info
     * @param {'info' | 'question' | 'approval'} type
     */
    async notifyOwner(subject, details, type = "info") {
        const owner = this.profileManager.findByRole("owner");
        if (!owner) {
            console.log("[Proactive] No owner profile found, can't notify");
            return;
        }

        let message;
        switch (type) {
            case "question":
                message = `Quick question: ${subject}\n\n${details}`;
                break;
            case "approval":
                message = `Need your approval: ${subject}\n\n${details}\n\nLet me know if this is okay.`;
                break;
            default:
                message = `FYI: ${subject}\n\n${details}`;
        }

        await this.sendToProfile(owner.id, message);
    }

    /**
     * Notify about blocked goals needing approval
     */
    async notifyBlockedGoals() {
        const blocked = this.goalManager.getBlockedGoals();
        const needsApproval = blocked.filter((g) => g.blockedBy?.includes("approval"));

        if (needsApproval.length === 0) return;

        const summary = needsApproval
            .map((g) => `- ${g.description}`)
            .join("\n");

        await this.notifyOwner(
            `${needsApproval.length} goal(s) waiting for approval`,
            summary,
            "approval"
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Message Delivery
    // ─────────────────────────────────────────────────────────────

    /**
     * Send a proactive message to a profile
     * @param {string} profileId
     * @param {string} message
     */
    async sendToProfile(profileId, message) {
        try {
            // Get the best channel/conversation for this profile
            const router = getPresenceRouter();
            const route = await router.getBestRoute(profileId);

            if (!route) {
                console.log(`[Proactive] No route found for profile ${profileId}`);
                return;
            }

            await sendProactiveMessage(route.channelId, route.conversationId, message);
            this.lastOutreach.set(profileId, Date.now());

            console.log(`[Proactive] Sent message to ${profileId} via ${route.channelId}`);
        } catch (e) {
            console.error("[Proactive] Error sending message:", e);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Scheduled Reminders
    // ─────────────────────────────────────────────────────────────

    /**
     * Check for and send due reminders
     */
    async processReminders() {
        // TODO: Implement reminder storage and processing
        // For now, this is a placeholder for future functionality
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {ProactiveCommunication|null} */
let instance = null;

export function getProactiveCommunication() {
    if (!instance) {
        instance = new ProactiveCommunication();
    }
    return instance;
}
