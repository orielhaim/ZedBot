// ============================================================
//  Inner Layer — Planner
//
//  Goal decomposition and planning:
//  - Break goals into sub-tasks
//  - Prioritize and schedule work
//  - Track dependencies
// ============================================================

import { reasoningModel } from "../../lib/models.js";
import { getGoalManager } from "../goals/index.js";
import { getAwareness } from "./awareness.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * @typedef {Object} Plan
 * @property {string} goalId
 * @property {string[]} steps
 * @property {Object[]} dependencies
 * @property {string} estimatedDuration
 */

export class Planner {
    constructor() {
        this.goalManager = getGoalManager();
        this.awareness = getAwareness();
    }

    // ─────────────────────────────────────────────────────────────
    // Goal Decomposition
    // ─────────────────────────────────────────────────────────────

    /**
     * Decompose a goal into actionable steps
     * @param {string} goalId
     * @returns {Promise<Plan>}
     */
    async decompose(goalId) {
        const goal = this.goalManager.store.getById(goalId);
        if (!goal) throw new Error(`Goal ${goalId} not found`);

        const awareness = this.awareness.getFullAwareness();

        const prompt = `Break down this goal into concrete, actionable steps:

GOAL: ${goal.description}

Current context:
- Time: ${awareness.time.timeOfDay}
- Active conversations: ${awareness.social.totalActivePeople}
- Current energy: ${(awareness.self.energy * 100).toFixed(0)}%

Provide 3-7 specific steps. Each step should be:
1. Concrete and actionable
2. Completable in a single session
3. Have a clear success criteria

Format: Return a JSON array of step descriptions.
Example: ["Research the API documentation", "Write a test implementation", "Verify it works"]`;

        try {
            const response = await reasoningModel.invoke([
                new SystemMessage("You are helping plan a goal. Be practical and specific."),
                new HumanMessage(prompt),
            ]);

            // Parse steps from response
            const content = response.content || "";
            let steps = [];

            try {
                // Try to parse as JSON
                const match = content.match(/\[[\s\S]*\]/);
                if (match) {
                    steps = JSON.parse(match[0]);
                }
            } catch {
                // Fallback: split by newlines and clean
                steps = content
                    .split("\n")
                    .filter((line) => line.trim())
                    .map((line) => line.replace(/^[\d\.\-\*]\s*/, "").trim())
                    .filter((line) => line.length > 5)
                    .slice(0, 7);
            }

            // Create sub-goals in the goal manager
            if (steps.length > 0) {
                this.goalManager.decompose(goalId, steps);
            }

            return {
                goalId,
                steps,
                dependencies: [],
                estimatedDuration: this._estimateDuration(steps.length),
            };
        } catch (e) {
            console.error("[Planner] Error decomposing goal:", e);
            return { goalId, steps: [], dependencies: [], estimatedDuration: "unknown" };
        }
    }

    /**
     * Estimate duration based on step count
     * @param {number} stepCount
     * @returns {string}
     */
    _estimateDuration(stepCount) {
        if (stepCount <= 2) return "quick";
        if (stepCount <= 4) return "medium";
        return "extended";
    }

    // ─────────────────────────────────────────────────────────────
    // Priority Management
    // ─────────────────────────────────────────────────────────────

    /**
     * Decide what to work on next
     * @returns {Promise<{goal: import('../goals/goal-store.js').Goal|null, reasoning: string}>}
     */
    async decideNextFocus() {
        const active = this.goalManager.getActiveGoals();
        if (active.length === 0) {
            return { goal: null, reasoning: "No active goals" };
        }

        const awareness = this.awareness.getFullAwareness();

        // Quick heuristic decision for efficiency
        const urgent = active.filter((g) => g.priority === "urgent");
        if (urgent.length > 0) {
            return { goal: urgent[0], reasoning: "Urgent priority" };
        }

        // If owner is active, prioritize adopted goals
        if (awareness.social.ownerStatus.present) {
            const adopted = active.filter((g) => g.source === "adopted");
            if (adopted.length > 0) {
                return { goal: adopted[0], reasoning: "Owner is present, prioritizing their requests" };
            }
        }

        // Default: oldest in-progress
        const inProgress = active.filter((g) => g.status === "in_progress");
        if (inProgress.length > 0) {
            return { goal: inProgress[0], reasoning: "Continue current work" };
        }

        // Start something new
        return { goal: active[0], reasoning: "Starting next available goal" };
    }

    // ─────────────────────────────────────────────────────────────
    // Scheduled Actions
    // ─────────────────────────────────────────────────────────────

    /**
     * Get actions that should run based on current context
     * @returns {string[]}
     */
    getScheduledActions() {
        const actions = [];
        const awareness = this.awareness.getFullAwareness();

        // Check for overdue goals
        const active = this.goalManager.getActiveGoals();
        for (const goal of active) {
            if (goal.deadline && Date.now() > goal.deadline) {
                actions.push(`Goal overdue: ${goal.description}`);
            }
        }

        // Check if consolidation should run
        // (This would be managed by memory services in a full implementation)

        // Check if someone needs attention
        for (const person of awareness.social.needsAttention) {
            if (person.waitingFor > 300000) { // 5 min
                actions.push(`Consider responding to ${person.participant}`);
            }
        }

        return actions;
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {Planner|null} */
let instance = null;

export function getPlanner() {
    if (!instance) {
        instance = new Planner();
    }
    return instance;
}
