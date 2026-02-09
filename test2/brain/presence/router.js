// ============================================================
//  Presence Router
//
//  Intelligent channel selection for proactive messaging:
//  - Choose best platform based on presence
//  - Respect availability patterns
//  - Handle cross-channel continuity
// ============================================================

import { getPresenceModel } from "./model.js";
import { getBranchManager } from "../managers/index.js";

/**
 * @typedef {Object} Route
 * @property {string} channelType
 * @property {string} channelId
 * @property {string} conversationId
 * @property {number} confidence - 0-1 how confident we are this is good
 * @property {string} reason
 */

export class PresenceRouter {
    constructor() {
        this.presenceModel = getPresenceModel();
        this.branchManager = getBranchManager();
    }

    // ─────────────────────────────────────────────────────────────
    // Route Selection
    // ─────────────────────────────────────────────────────────────

    /**
     * Get the best route to reach a profile
     * @param {string} profileId
     * @returns {Promise<Route|null>}
     */
    async getBestRoute(profileId) {
        // Try most recent presence first
        const recent = this.presenceModel.getMostRecent(profileId);

        if (recent && this.presenceModel.isLikelyOnline(profileId)) {
            return {
                channelType: recent.channelType,
                channelId: recent.channelId,
                conversationId: recent.conversationId,
                confidence: 0.9,
                reason: "Currently online on this channel",
            };
        }

        // Try best channel (most active historically)
        const best = this.presenceModel.getBestChannel(profileId);
        if (best) {
            return {
                channelType: best.channelType,
                channelId: best.channelId,
                conversationId: best.conversationId,
                confidence: 0.7,
                reason: "Most active channel historically",
            };
        }

        // Fallback: look for any branch with this profile
        const branches = this.branchManager.getBranchesForProfile(profileId);
        if (branches.length > 0) {
            const mostRecent = branches.sort((a, b) =>
                (b.lastActivityAt || 0) - (a.lastActivityAt || 0)
            )[0];

            return {
                channelType: mostRecent.channelType,
                channelId: mostRecent.channelId,
                conversationId: mostRecent.conversationId,
                confidence: 0.5,
                reason: "Last known conversation",
            };
        }

        return null;
    }

    /**
     * Get all available routes for a profile (for fallback)
     * @param {string} profileId
     * @returns {Route[]}
     */
    getAllRoutes(profileId) {
        const signals = this.presenceModel.getForProfile(profileId);

        return signals.map((s) => ({
            channelType: s.channelType,
            channelId: s.channelId,
            conversationId: s.conversationId,
            confidence: this._calculateConfidence(s),
            reason: `Seen ${this._formatTimeSince(s.lastSeenAt)} ago, ${s.messageCount} messages`,
        }));
    }

    /**
     * Calculate confidence score for a presence signal
     * @param {import('./model.js').PresenceSignal} signal
     * @returns {number}
     */
    _calculateConfidence(signal) {
        const timeSince = Date.now() - signal.lastSeenAt;

        // Base confidence from recency
        let confidence = 0;
        if (timeSince < 600000) confidence = 0.9; // 10 min
        else if (timeSince < 3600000) confidence = 0.7; // 1 hour
        else if (timeSince < 86400000) confidence = 0.5; // 24 hours
        else if (timeSince < 604800000) confidence = 0.3; // 7 days
        else confidence = 0.1;

        // Boost for high message count
        if (signal.messageCount > 10) confidence += 0.1;
        if (signal.messageCount > 50) confidence += 0.1;

        return Math.min(1, confidence);
    }

    /**
     * Format time since for human display
     * @param {number} timestamp
     * @returns {string}
     */
    _formatTimeSince(timestamp) {
        const ms = Date.now() - timestamp;
        if (ms < 60000) return "just now";
        if (ms < 3600000) return `${Math.floor(ms / 60000)} min`;
        if (ms < 86400000) return `${Math.floor(ms / 3600000)} hours`;
        return `${Math.floor(ms / 86400000)} days`;
    }

    // ─────────────────────────────────────────────────────────────
    // Continuity
    // ─────────────────────────────────────────────────────────────

    /**
     * Check if a conversation should continue on a different channel
     * @param {string} branchId
     * @param {string} profileId
     * @returns {Route|null}
     */
    checkForBetterRoute(branchId, profileId) {
        const branch = this.branchManager.getBranch(branchId);
        if (!branch) return null;

        const bestRoute = this.getBestRoute(profileId);

        // If current channel is different from best and confidence is high
        if (
            bestRoute &&
            bestRoute.conversationId !== branch.conversationId &&
            bestRoute.confidence > 0.8
        ) {
            return bestRoute;
        }

        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {PresenceRouter|null} */
let instance = null;

export function getPresenceRouter() {
    if (!instance) {
        instance = new PresenceRouter();
    }
    return instance;
}
