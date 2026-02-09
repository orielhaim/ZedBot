// ============================================================
//  Inner Layer — Awareness
//
//  Maintains situational awareness across all dimensions:
//  - Time: current time, durations, schedules
//  - Social: who's active, who needs attention, relationships
//  - Task: active goals, blockers, progress
//  - Self: mood, energy, what I'm doing
// ============================================================

import { getBranchManager, getSwitchboardManager, getProfileManager } from "../managers/index.js";
import { getHeartState } from "../heart/index.js";
import { getGoalManager } from "../goals/goal-manager.js";

/**
 * @typedef {Object} TimeAwareness
 * @property {number} currentTime - Current timestamp
 * @property {string} timeOfDay - 'morning' | 'afternoon' | 'evening' | 'night'
 * @property {string} dayOfWeek - Day name
 * @property {number} uptimeMs - How long Zed has been running
 * @property {number} timeSinceOwnerMessage - Ms since owner last messaged
 * @property {number} timeSinceAnyMessage - Ms since any message
 */

/**
 * @typedef {Object} SocialAwareness
 * @property {Object[]} activeConversations - Currently active branches
 * @property {Object[]} needsAttention - People who might need a response
 * @property {Object} ownerStatus - Owner's current state
 * @property {number} totalActivePeople - Count of active people
 */

/**
 * @typedef {Object} TaskAwareness
 * @property {Object[]} activeGoals - Currently in-progress goals
 * @property {Object[]} blockedGoals - Blocked goals
 * @property {Object} currentFocus - What Zed is focused on right now
 * @property {number} completedToday - Goals completed today
 */

/**
 * @typedef {Object} SelfAwareness
 * @property {string} currentActivity - What Zed is doing right now
 * @property {string} mood
 * @property {number} energy
 * @property {boolean} isBusy
 * @property {boolean} isIdle
 */

/**
 * @typedef {Object} FullAwareness
 * @property {TimeAwareness} time
 * @property {SocialAwareness} social
 * @property {TaskAwareness} task
 * @property {SelfAwareness} self
 * @property {number} generatedAt
 */

export class Awareness {
    /** @type {number} */
    startTime;

    /** @type {string} */
    currentActivity;

    constructor() {
        this.startTime = Date.now();
        this.currentActivity = "initializing";
    }

    // ─────────────────────────────────────────────────────────────
    // Time Awareness
    // ─────────────────────────────────────────────────────────────

    /**
     * @returns {TimeAwareness}
     */
    getTimeAwareness() {
        const now = Date.now();
        const date = new Date(now);
        const hour = date.getHours();

        let timeOfDay;
        if (hour >= 5 && hour < 12) timeOfDay = "morning";
        else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";
        else if (hour >= 17 && hour < 21) timeOfDay = "evening";
        else timeOfDay = "night";

        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        // Get time since owner message
        const profileManager = getProfileManager();
        const branchManager = getBranchManager();

        let timeSinceOwnerMessage = Infinity;
        let timeSinceAnyMessage = Infinity;

        try {
            const ownerProfile = profileManager.findByRole("owner");
            if (ownerProfile) {
                const ownerBranches = branchManager.getBranchesForProfile(ownerProfile.id);
                for (const branch of ownerBranches) {
                    const lastActivity = branch.lastActivityAt || 0;
                    timeSinceOwnerMessage = Math.min(timeSinceOwnerMessage, now - lastActivity);
                }
            }

            const allBranches = branchManager.getActiveBranches();
            for (const branch of allBranches) {
                const lastActivity = branch.lastActivityAt || 0;
                timeSinceAnyMessage = Math.min(timeSinceAnyMessage, now - lastActivity);
            }
        } catch (e) {
            // Managers might not be ready yet
        }

        return {
            currentTime: now,
            timeOfDay,
            dayOfWeek: days[date.getDay()],
            uptimeMs: now - this.startTime,
            timeSinceOwnerMessage: timeSinceOwnerMessage === Infinity ? -1 : timeSinceOwnerMessage,
            timeSinceAnyMessage: timeSinceAnyMessage === Infinity ? -1 : timeSinceAnyMessage,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Social Awareness
    // ─────────────────────────────────────────────────────────────

    /**
     * @returns {SocialAwareness}
     */
    getSocialAwareness() {
        const switchboard = getSwitchboardManager();
        const profileManager = getProfileManager();
        const now = Date.now();

        const state = switchboard.getSwitchboardState();
        const activeConversations = state.activeBranches.map((b) => ({
            branchId: b.branchId,
            topic: b.topic,
            participant: b.participant,
            lastActivity: b.lastActivity,
            mood: b.mood,
        }));

        // Find people who might need attention
        const needsAttention = activeConversations
            .filter((c) => {
                const timeSince = now - c.lastActivity;
                // If they messaged within last 10 min and we haven't responded
                return timeSince > 60000 && timeSince < 600000;
            })
            .map((c) => ({
                participant: c.participant,
                topic: c.topic,
                waitingFor: now - c.lastActivity,
            }));

        // Owner status
        let ownerStatus = { present: false, lastSeen: null };
        try {
            const owner = profileManager.findByRole("owner");
            if (owner) {
                const branchManager = getBranchManager();
                const ownerBranches = branchManager.getBranchesForProfile(owner.id);
                const mostRecent = ownerBranches.reduce((latest, b) =>
                    (b.lastActivityAt || 0) > (latest?.lastActivityAt || 0) ? b : latest
                    , null);
                ownerStatus = {
                    present: mostRecent && (now - mostRecent.lastActivityAt) < 600000,
                    lastSeen: mostRecent?.lastActivityAt || null,
                };
            }
        } catch (e) {
            // Owner might not exist yet
        }

        return {
            activeConversations,
            needsAttention,
            ownerStatus,
            totalActivePeople: activeConversations.length,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Task Awareness
    // ─────────────────────────────────────────────────────────────

    /**
     * @returns {TaskAwareness}
     */
    getTaskAwareness() {
        let activeGoals = [];
        let blockedGoals = [];
        let completedToday = 0;

        try {
            const goalManager = getGoalManager();
            activeGoals = goalManager.getActiveGoals();
            blockedGoals = goalManager.getBlockedGoals();
            completedToday = goalManager.getCompletedToday();
        } catch (e) {
            // Goal system might not be ready yet
        }

        return {
            activeGoals: activeGoals.slice(0, 5), // Top 5
            blockedGoals: blockedGoals.slice(0, 3),
            currentFocus: activeGoals[0] || null,
            completedToday,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Self Awareness
    // ─────────────────────────────────────────────────────────────

    /**
     * @returns {SelfAwareness}
     */
    getSelfAwareness() {
        const heartState = getHeartState();
        const state = heartState.getState();

        const time = this.getTimeAwareness();
        const social = this.getSocialAwareness();
        const task = this.getTaskAwareness();

        const isBusy = task.activeGoals.length > 2 || social.needsAttention.length > 0;
        const isIdle = !isBusy && time.timeSinceAnyMessage > 300000; // 5 min

        return {
            currentActivity: this.currentActivity,
            mood: state.mood,
            energy: state.energy,
            isBusy,
            isIdle,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Full Awareness
    // ─────────────────────────────────────────────────────────────

    /**
     * Get complete awareness snapshot
     * @returns {FullAwareness}
     */
    getFullAwareness() {
        return {
            time: this.getTimeAwareness(),
            social: this.getSocialAwareness(),
            task: this.getTaskAwareness(),
            self: this.getSelfAwareness(),
            generatedAt: Date.now(),
        };
    }

    /**
     * Set what Zed is currently doing
     * @param {string} activity
     */
    setCurrentActivity(activity) {
        this.currentActivity = activity;
    }

    /**
     * Get a text summary for context injection
     * @returns {string}
     */
    getContextSummary() {
        const awareness = this.getFullAwareness();
        const lines = [];

        lines.push(`Current time: ${awareness.time.timeOfDay}, ${awareness.time.dayOfWeek}`);
        lines.push(`Uptime: ${Math.floor(awareness.time.uptimeMs / 60000)} minutes`);

        if (awareness.social.ownerStatus.present) {
            lines.push("Owner is active.");
        } else if (awareness.social.ownerStatus.lastSeen) {
            const ago = Math.floor((Date.now() - awareness.social.ownerStatus.lastSeen) / 60000);
            lines.push(`Owner last seen ${ago} minutes ago.`);
        }

        if (awareness.social.totalActivePeople > 0) {
            lines.push(`${awareness.social.totalActivePeople} active conversation(s).`);
        }

        if (awareness.task.currentFocus) {
            lines.push(`Currently focused on: ${awareness.task.currentFocus.description}`);
        }

        if (awareness.self.isBusy) {
            lines.push("Currently busy.");
        } else if (awareness.self.isIdle) {
            lines.push("Currently idle - open to new activities.");
        }

        return lines.join("\n");
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {Awareness|null} */
let instance = null;

export function getAwareness() {
    if (!instance) {
        instance = new Awareness();
    }
    return instance;
}
