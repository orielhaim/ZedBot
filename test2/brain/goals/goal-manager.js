// ============================================================
//  Goal System — Manager
//
//  Handles goal lifecycle: creation, decomposition, prioritization,
//  progress tracking, and completion
// ============================================================

import { getGoalStore } from "./goal-store.js";
import { DRIVES, evaluateDrives, generateGoalFromDrive } from "./drives.js";

/**
 * @typedef {import('./goal-store.js').Goal} Goal
 * @typedef {import('./goal-store.js').GoalStatus} GoalStatus
 * @typedef {import('./goal-store.js').GoalPriority} GoalPriority
 * @typedef {import('./goal-store.js').GoalSource} GoalSource
 */

export class GoalManager {
    constructor() {
        this.store = getGoalStore();
    }

    // ─────────────────────────────────────────────────────────────
    // Goal Creation
    // ─────────────────────────────────────────────────────────────

    /**
     * Create a self-generated goal (from Zed's own drives)
     * @param {string} description
     * @param {Object} [options]
     * @returns {Goal}
     */
    createSelfGoal(description, options = {}) {
        console.log(`[Goals] Creating self-goal: ${description}`);
        return this.store.create({
            description,
            priority: options.priority || "normal",
            source: "self_generated",
            driveType: options.driveType || null,
        });
    }

    /**
     * Adopt a goal from a conversation (Zed chooses to help)
     * @param {string} description
     * @param {Object} [options]
     * @returns {Goal}
     */
    adoptGoal(description, options = {}) {
        console.log(`[Goals] Adopting goal: ${description}`);
        return this.store.create({
            description,
            priority: options.priority || "normal",
            source: "adopted",
        });
    }

    /**
     * Create an emergent goal (arose from reflection/observation)
     * @param {string} description
     * @param {Object} [options]
     * @returns {Goal}
     */
    createEmergentGoal(description, options = {}) {
        console.log(`[Goals] Emergent goal: ${description}`);
        return this.store.create({
            description,
            priority: options.priority || "background",
            source: "emergent",
        });
    }

    /**
     * Generate goals from active drives based on context
     * @param {Object} context - Current awareness context
     * @returns {Goal[]}
     */
    generateFromDrives(context) {
        const activeDrives = evaluateDrives(context);
        const newGoals = [];

        for (const { drive, relevance, suggestedGoal } of activeDrives) {
            if (relevance > 0.6 && suggestedGoal) {
                // Check if similar goal already exists
                const existing = this.findSimilar(suggestedGoal);
                if (!existing) {
                    const goal = this.createSelfGoal(suggestedGoal, {
                        driveType: drive.type,
                        priority: relevance > 0.8 ? "normal" : "background",
                    });
                    newGoals.push(goal);
                }
            }
        }

        return newGoals;
    }

    // ─────────────────────────────────────────────────────────────
    // Goal Decomposition
    // ─────────────────────────────────────────────────────────────

    /**
     * Decompose a goal into sub-tasks
     * @param {string} goalId
     * @param {string[]} subTasks - Descriptions of sub-tasks
     * @returns {Goal[]}
     */
    decompose(goalId, subTasks) {
        const parent = this.store.getById(goalId);
        if (!parent) throw new Error(`Goal ${goalId} not found`);

        console.log(`[Goals] Decomposing "${parent.description}" into ${subTasks.length} sub-tasks`);

        const subGoals = subTasks.map((desc) =>
            this.store.create({
                description: desc,
                priority: parent.priority,
                source: parent.source,
                parentGoalId: goalId,
            })
        );

        // Mark parent as in-progress
        this.store.update(goalId, { status: "in_progress" });

        return subGoals;
    }

    // ─────────────────────────────────────────────────────────────
    // Status Management
    // ─────────────────────────────────────────────────────────────

    /**
     * Start working on a goal
     * @param {string} goalId
     */
    start(goalId) {
        console.log(`[Goals] Starting: ${goalId}`);
        this.store.update(goalId, { status: "in_progress" });
    }

    /**
     * Mark a goal as blocked
     * @param {string} goalId
     * @param {string} blockedBy - What's blocking it
     */
    block(goalId, blockedBy) {
        console.log(`[Goals] Blocked: ${goalId} by "${blockedBy}"`);
        this.store.update(goalId, { status: "blocked", blockedBy });
    }

    /**
     * Unblock a goal
     * @param {string} goalId
     */
    unblock(goalId) {
        console.log(`[Goals] Unblocked: ${goalId}`);
        this.store.update(goalId, { status: "in_progress", blockedBy: null });
    }

    /**
     * Complete a goal
     * @param {string} goalId
     */
    complete(goalId) {
        console.log(`[Goals] Completed: ${goalId}`);
        this.store.update(goalId, { status: "completed", completedAt: Date.now() });

        // Check if parent goal should be completed
        const goal = this.store.getById(goalId);
        if (goal?.parentGoalId) {
            this._checkParentCompletion(goal.parentGoalId);
        }
    }

    /**
     * Abandon a goal
     * @param {string} goalId
     * @param {string} [reason]
     */
    abandon(goalId, reason = "no longer relevant") {
        console.log(`[Goals] Abandoned: ${goalId} - ${reason}`);
        this.store.update(goalId, { status: "abandoned" });
    }

    /**
     * Check if parent goal should be auto-completed
     * @param {string} parentId
     */
    _checkParentCompletion(parentId) {
        const subGoals = this.store.getSubGoals(parentId);
        const allComplete = subGoals.every((g) => g.status === "completed" || g.status === "abandoned");

        if (allComplete && subGoals.length > 0) {
            this.complete(parentId);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Retrieval
    // ─────────────────────────────────────────────────────────────

    /**
     * Get all active goals (for awareness)
     * @returns {Goal[]}
     */
    getActiveGoals() {
        return this.store.getActive();
    }

    /**
     * Get blocked goals
     * @returns {Goal[]}
     */
    getBlockedGoals() {
        return this.store.getBlocked();
    }

    /**
     * Get count of goals completed today
     * @returns {number}
     */
    getCompletedToday() {
        return this.store.getCompletedToday().length;
    }

    /**
     * Get the current focus (highest priority in-progress goal)
     * @returns {Goal|null}
     */
    getCurrentFocus() {
        const active = this.store.getByStatus("in_progress");
        if (active.length === 0) return null;

        // Priority order: urgent > normal > background
        const priorityOrder = { urgent: 0, normal: 1, background: 2 };
        active.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return active[0];
    }

    /**
     * Find a similar existing goal
     * @param {string} description
     * @returns {Goal|null}
     */
    findSimilar(description) {
        const active = this.store.getActive();
        const normalized = description.toLowerCase();

        // Simple similarity check - could be enhanced with embeddings
        return active.find((g) => {
            const goalNorm = g.description.toLowerCase();
            return goalNorm.includes(normalized) || normalized.includes(goalNorm);
        }) || null;
    }

    /**
     * Get a text summary for context injection
     * @returns {string}
     */
    getContextSummary() {
        const active = this.getActiveGoals();
        const focus = this.getCurrentFocus();
        const blocked = this.getBlockedGoals();

        const lines = [];

        if (focus) {
            lines.push(`Currently focused on: ${focus.description}`);
        }

        if (active.length > 1) {
            lines.push(`${active.length} active goals total.`);
        }

        if (blocked.length > 0) {
            lines.push(`${blocked.length} goal(s) blocked.`);
        }

        return lines.join(" ");
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {GoalManager|null} */
let instance = null;

export function getGoalManager() {
    if (!instance) {
        instance = new GoalManager();
    }
    return instance;
}
