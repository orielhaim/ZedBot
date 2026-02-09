// ============================================================
//  Switchboard Manager — Cross-branch awareness
//  Provides a snapshot of all active conversations
// ============================================================

import { getBranchStore } from "../stores/index.js";
import { getProfileManager } from "./profile-manager.js";
import { v4 as uuidv4 } from "uuid";

/**
 * @typedef {import('../../lib/types.js').SwitchboardState} SwitchboardState
 * @typedef {import('../../lib/types.js').SwitchboardEntry} SwitchboardEntry
 * @typedef {import('../../lib/types.js').CrossBranchNote} CrossBranchNote
 * @typedef {import('../../lib/types.js').Branch} Branch
 */

// In-memory storage for cross-branch notes (could be persisted later)
/** @type {CrossBranchNote[]} */
let crossBranchNotes = [];

export class SwitchboardManager {
    constructor() {
        this.branchStore = getBranchStore();
        this.profileManager = getProfileManager();
    }

    /**
     * Get the current switchboard state — a snapshot of all active conversations.
     * @returns {SwitchboardState}
     */
    getSwitchboardState() {
        const activeBranches = this.branchStore.getActive();

        return {
            timestamp: Date.now(),
            activeBranches: activeBranches.map((branch) => this._toBranchEntry(branch)),
            crossBranchNotes: this._getPendingNotes(),
        };
    }

    /**
     * Get a text representation of the switchboard for context injection.
     * @returns {string}
     */
    getTextRepresentation() {
        const state = this.getSwitchboardState();
        const lines = [];

        if (state.activeBranches.length === 0) {
            return "=== ACTIVE CONVERSATIONS ===\nNo active conversations.\n";
        }

        lines.push("=== ACTIVE CONVERSATIONS ===");

        for (const entry of state.activeBranches) {
            const participants = entry.participants
                .map((p) => `${p.displayName} (${p.role})`)
                .join(", ");

            const ago = this._timeAgo(entry.lastActivityAt);
            const topic = entry.currentTopic || "idle";

            lines.push(
                `[Branch ${entry.branchId.slice(0, 8)}] ${entry.channelType} with ${participants} — ${topic} — ${ago} — ${entry.mood}`
            );
        }

        // Add pending notes if any
        const pendingNotes = state.crossBranchNotes.filter((n) => n.status === "pending");
        if (pendingNotes.length > 0) {
            lines.push("");
            lines.push("=== PENDING NOTES ===");
            for (const note of pendingNotes) {
                const target = note.toBranchId
                    ? `Branch ${note.toBranchId.slice(0, 8)}`
                    : note.toProfileId || "all";
                lines.push(`- "${note.content}" [from Branch ${note.fromBranchId.slice(0, 8)} → ${target}]`);
            }
        }

        return lines.join("\n");
    }

    /**
     * Add a cross-branch note (e.g., "tell user_42 I said hi").
     * @param {{fromBranchId: string, toBranchId?: string, toProfileId?: string, content: string}} note
     * @returns {CrossBranchNote}
     */
    addCrossBranchNote(note) {
        const fullNote = {
            id: uuidv4(),
            fromBranchId: note.fromBranchId,
            toBranchId: note.toBranchId,
            toProfileId: note.toProfileId,
            content: note.content,
            createdAt: Date.now(),
            status: "pending",
        };

        crossBranchNotes.push(fullNote);
        console.log(`[Switchboard] Added note: "${note.content}" from ${note.fromBranchId}`);
        return fullNote;
    }

    /**
     * Get pending notes for a specific branch or profile.
     * @param {{branchId?: string, profileId?: string}} filter
     * @returns {CrossBranchNote[]}
     */
    getPendingNotesFor(filter) {
        return crossBranchNotes.filter((note) => {
            if (note.status !== "pending") return false;

            // Match by branch
            if (filter.branchId && note.toBranchId === filter.branchId) return true;

            // Match by profile
            if (filter.profileId && note.toProfileId === filter.profileId) return true;

            // Broadcast notes (no specific target)
            if (!note.toBranchId && !note.toProfileId) return true;

            return false;
        });
    }

    /**
     * Mark a note as delivered.
     * @param {string} noteId
     */
    markNoteDelivered(noteId) {
        const note = crossBranchNotes.find((n) => n.id === noteId);
        if (note) {
            note.status = "delivered";
            note.deliveredAt = Date.now();
        }
    }

    /**
     * Deliver pending notes for a branch and return them.
     * Call this when processing a branch to get notes addressed to it.
     * @param {string} branchId
     * @param {string} profileId
     * @returns {CrossBranchNote[]}
     */
    deliverPendingNotes(branchId, profileId) {
        const notes = this.getPendingNotesFor({ branchId, profileId });

        for (const note of notes) {
            this.markNoteDelivered(note.id);
        }

        return notes;
    }

    /**
     * Clean up old delivered/expired notes.
     * @param {number} [maxAgeMs] - Default 24 hours
     */
    cleanupOldNotes(maxAgeMs = 24 * 60 * 60 * 1000) {
        const cutoff = Date.now() - maxAgeMs;
        crossBranchNotes = crossBranchNotes.filter((note) => {
            if (note.status === "pending") return true;
            return note.createdAt > cutoff;
        });
    }

    /**
     * Convert a branch to a switchboard entry.
     * @private
     */
    _toBranchEntry(branch) {
        return {
            branchId: branch.id,
            channelType: branch.channelType,
            participants: branch.participants.map((p) => {
                const profile = this.profileManager.getById(p.profileId);
                return {
                    profileId: p.profileId,
                    displayName: profile?.displayName || "Unknown",
                    role: profile?.role || "stranger",
                };
            }),
            currentTopic: branch.currentTopic || "",
            mood: branch.mood?.tone || "neutral",
            lastActivityAt: branch.lastActivityAt,
            status: branch.status,
            pendingActions: branch.pendingActions.map((a) => a.description),
            responseDecision: this._formatResponseDecision(branch.responseDecision),
        };
    }

    /**
     * Format response decision for display.
     * @private
     */
    _formatResponseDecision(decision) {
        if (!decision) return undefined;
        if (decision.action === "respond_now") return "responding";
        if (decision.action === "respond_later") return `delayed: ${decision.reason}`;
        if (decision.action === "acknowledge_silent") return `silent: ${decision.reason}`;
        if (decision.action === "ignore") return `ignoring: ${decision.reason}`;
        return undefined;
    }

    /**
     * Get pending notes.
     * @private
     */
    _getPendingNotes() {
        return crossBranchNotes.filter((n) => n.status === "pending");
    }

    /**
     * Format a timestamp as "X ago".
     * @private
     */
    _timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return "just now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared SwitchboardManager instance.
 * @returns {SwitchboardManager}
 */
export function getSwitchboardManager() {
    if (!_instance) {
        _instance = new SwitchboardManager();
    }
    return _instance;
}
