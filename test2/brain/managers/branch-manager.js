// ============================================================
//  Branch Manager — Conversation lifecycle & routing
// ============================================================

import { getBranchStore } from "../stores/index.js";
import { getProfileManager } from "./profile-manager.js";
import { createBranch, BRANCH_STATUS } from "../../lib/types.js";

/**
 * @typedef {import('../../lib/types.js').Branch} Branch
 * @typedef {import('../../lib/types.js').BranchParticipant} BranchParticipant
 * @typedef {import('../../lib/types.js').StoredMessage} StoredMessage
 * @typedef {import('../../lib/types.js').ResponseDecision} ResponseDecision
 * @typedef {import('../../lib/types.js').ZedEvent} ZedEvent
 * @typedef {import('../../lib/types.js').IncomingMessagePayload} IncomingMessagePayload
 */

export class BranchManager {
    constructor() {
        this.store = getBranchStore();
        this.profileManager = getProfileManager();
    }

    /**
     * Get or create a branch for an incoming message event.
     * This is the main entry point when processing messages.
     * @param {ZedEvent<IncomingMessagePayload>} event
     * @returns {{branch: Branch, profile: import('../../lib/types.js').Profile, isNew: boolean}}
     */
    getOrCreateBranch(event) {
        const { payload } = event;
        const { channelType, channelId, conversationId } = payload;

        // Resolve profile
        const { profile, isNew: isNewProfile } = this.profileManager.resolveFromMessage(payload);

        // Look for existing branch
        let branch = this.store.getByConversation(channelId, conversationId);
        let isNewBranch = false;

        if (branch) {
            if (branch.status === BRANCH_STATUS.DORMANT) {
                // Reactivate dormant branch
                branch = this.store.reactivate(branch.id);
                console.log(`[BranchManager] Reactivated branch: ${branch.id}`);
            } else {
                // Update activity time
                this.store.touch(branch.id);
            }

            // Ensure participant is registered
            this._ensureParticipant(branch.id, profile.id);
        } else {
            // Create new branch
            branch = this.store.create({
                channelType,
                channelId,
                conversationId,
                participants: [
                    {
                        profileId: profile.id,
                        role: "primary",
                        joinedAt: Date.now(),
                    },
                ],
                status: BRANCH_STATUS.ACTIVE,
                mood: { tone: "neutral", confidence: 0.5, updatedAt: Date.now() },
                pendingActions: [],
            });
            isNewBranch = true;
            console.log(`[BranchManager] Created new branch: ${branch.id} for ${profile.displayName} (New Profile: ${isNewProfile})`);
        }

        // It is effectively "new" for the hook if the profile is new OR if it's a new branch for a Stranger
        // If it's a new branch for a known user, we don't need the "Intro yourself" hook.
        const isNewContext = isNewProfile;

        return { branch, profile, isNew: isNewContext };
    }

    /**
     * Get a branch by ID.
     * @param {string} branchId
     * @returns {Branch | null}
     */
    getById(branchId) {
        return this.store.getById(branchId);
    }

    /**
     * Get a branch with its recent messages.
     * @param {string} branchId
     * @param {number} [messageLimit]
     * @returns {{branch: Branch, messages: StoredMessage[]} | null}
     */
    getBranchWithMessages(branchId, messageLimit = 50) {
        const branch = this.store.getById(branchId);
        if (!branch) return null;

        const messages = this.store.getRecentMessages(branchId, messageLimit);
        return { branch, messages };
    }

    /**
     * Add a message to a branch.
     * @param {Omit<StoredMessage, 'id'>} message
     * @returns {StoredMessage}
     */
    addMessage(message) {
        return this.store.addMessage(message);
    }

    /**
     * Get recent messages from a branch.
     * @param {string} branchId
     * @param {number} [limit]
     * @returns {StoredMessage[]}
     */
    getRecentMessages(branchId, limit = 50) {
        return this.store.getRecentMessages(branchId, limit);
    }

    /**
     * Update the mood of a branch.
     * @param {string} branchId
     * @param {{tone: string, confidence: number}} mood
     */
    updateMood(branchId, mood) {
        this.store.update(branchId, {
            mood: { ...mood, updatedAt: Date.now() },
        });
    }

    /**
     * Update the current topic of a branch.
     * @param {string} branchId
     * @param {string} topic
     */
    updateTopic(branchId, topic) {
        this.store.update(branchId, { currentTopic: topic });
    }

    /**
     * Set the response decision for a branch.
     * @param {string} branchId
     * @param {ResponseDecision} decision
     */
    setResponseDecision(branchId, decision) {
        this.store.update(branchId, { responseDecision: decision });
    }

    /**
     * Record that Zed responded in this branch.
     * @param {string} branchId
     */
    recordZedResponse(branchId) {
        this.store.update(branchId, {
            lastZedResponseAt: Date.now(),
            responseDecision: undefined, // Clear pending decision
        });
    }

    /**
     * Save a summary for the branch (progressive summarization).
     * @param {string} branchId
     * @param {string} summary
     * @param {string} upToMessageId
     */
    saveSummary(branchId, summary, upToMessageId) {
        this.store.update(branchId, {
            summary,
            summaryUpToMessageId: upToMessageId,
        });
    }

    /**
     * Mark a branch as dormant.
     * @param {string} branchId
     */
    markDormant(branchId) {
        this.store.markDormant(branchId);
        console.log(`[BranchManager] Branch marked dormant: ${branchId}`);
    }

    /**
     * Reactivate a dormant branch.
     * @param {string} branchId
     * @returns {Branch | null}
     */
    reactivate(branchId) {
        const branch = this.store.reactivate(branchId);
        if (branch) {
            console.log(`[BranchManager] Branch reactivated: ${branchId}`);
        }
        return branch;
    }

    /**
     * Close a branch (conversation ended).
     * @param {string} branchId
     */
    close(branchId) {
        this.store.close(branchId);
        console.log(`[BranchManager] Branch closed: ${branchId}`);
    }

    /**
     * Get all active branches.
     * @returns {Branch[]}
     */
    getActiveBranches() {
        return this.store.getActive();
    }

    /**
     * Get branches for a specific profile.
     * @param {string} profileId
     * @returns {Branch[]}
     */
    getBranchesForProfile(profileId) {
        return this.store.getBranchesForProfile(profileId);
    }

    /**
     * Ensure a participant is registered in a branch.
     * @private
     */
    _ensureParticipant(branchId, profileId) {
        const branch = this.store.getById(branchId);
        if (!branch) return;

        const exists = branch.participants.some((p) => p.profileId === profileId);
        if (!exists) {
            const participants = [
                ...branch.participants,
                { profileId, role: "primary", joinedAt: Date.now() },
            ];
            this.store.update(branchId, { participants });
        }
    }

    /**
     * Check if old active branches should become dormant.
     * Call this periodically.
     * @param {number} [inactiveThresholdMs] - Default 4 hours
     */
    sweepInactiveBranches(inactiveThresholdMs = 4 * 60 * 60 * 1000) {
        const activeBranches = this.store.getActive();
        const now = Date.now();
        let count = 0;

        for (const branch of activeBranches) {
            if (now - branch.lastActivityAt > inactiveThresholdMs) {
                this.markDormant(branch.id);
                count++;
            }
        }

        if (count > 0) {
            console.log(`[BranchManager] Swept ${count} inactive branches to dormant`);
        }
    }

    /**
     * Get the message count for a branch.
     * @param {string} branchId
     * @returns {number}
     */
    getMessageCount(branchId) {
        return this.store.countMessages(branchId);
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared BranchManager instance.
 * @returns {BranchManager}
 */
export function getBranchManager() {
    if (!_instance) {
        _instance = new BranchManager();
    }
    return _instance;
}
