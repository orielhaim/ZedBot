// ============================================================
//  Inner Layer — Background Loop
//
//  The core of Zed's autonomy: continuously running background
//  process that thinks, plans, reflects, and acts independently.
//
//  Dynamic tick scheduling based on:
//  - Activity level (more frequent when busy)
//  - Time of day (slower at night)
//  - Energy level (slower when tired)
//  - Pending actions (faster when work to do)
// ============================================================

import { getAwareness } from "./awareness.js";
import { getReflectionEngine } from "./reflection.js";
import { getPlanner } from "./planner.js";
import { getGoalManager } from "../goals/index.js";
import { getHeartManager, getHeartState } from "../heart/index.js";
import { sendProactiveMessage } from "../index.js";
import { reasoningModel } from "../../lib/models.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

/**
 * @typedef {Object} TickResult
 * @property {string} activity - What was done this tick
 * @property {number} duration - How long the tick took
 * @property {string[]} actions - Actions executed
 * @property {number} nextTickDelay - Suggested delay before next tick
 */

export class InnerLoop {
    /** @type {boolean} */
    running = false;

    /** @type {NodeJS.Timeout|null} */
    timer = null;

    /** @type {number} */
    tickCount = 0;

    /** @type {number} */
    lastTickAt = 0;

    /** @type {number} */
    baseTickInterval = 60000; // 1 minute base

    constructor() {
        this.awareness = getAwareness();
        this.reflection = getReflectionEngine();
        this.planner = getPlanner();
        this.goalManager = getGoalManager();
        this.heartManager = getHeartManager();
        this.heartState = getHeartState();
    }

    // ─────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────

    /**
     * Start the inner loop
     */
    start() {
        if (this.running) {
            console.log("[InnerLoop] Already running");
            return;
        }

        this.running = true;
        console.log("[InnerLoop] ▶ Started background loop");

        // Run first tick immediately
        this._scheduleNextTick(1000);
    }

    /**
     * Stop the inner loop
     */
    stop() {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        console.log("[InnerLoop] ⏹ Stopped background loop");
    }

    /**
     * Schedule the next tick with dynamic delay
     * @param {number} [forceDelay] - Force a specific delay
     */
    _scheduleNextTick(forceDelay = null) {
        if (!this.running) return;

        const delay = forceDelay ?? this._calculateTickDelay();

        this.timer = setTimeout(() => {
            this._tick().then((result) => {
                if (this.running) {
                    this._scheduleNextTick(result.nextTickDelay);
                }
            });
        }, delay);
    }

    // ─────────────────────────────────────────────────────────────
    // Dynamic Tick Calculation
    // ─────────────────────────────────────────────────────────────

    /**
     * Calculate delay until next tick based on current state
     * @returns {number} - Delay in milliseconds
     */
    _calculateTickDelay() {
        const awareness = this.awareness.getFullAwareness();
        let delay = this.baseTickInterval;

        // Faster when busy (goals in progress)
        if (awareness.task.activeGoals.length > 2) {
            delay *= 0.5; // 30 sec when busy
        }

        // Faster when people need attention
        if (awareness.social.needsAttention.length > 0) {
            delay *= 0.3; // ~20 sec
        }

        // Slower at night
        if (awareness.time.timeOfDay === "night") {
            delay *= 3; // 3 min at night
        }

        // Slower when low energy
        if (awareness.self.energy < 0.3) {
            delay *= 2;
        }

        // Faster when energized
        if (awareness.self.energy > 0.8) {
            delay *= 0.7;
        }

        // Clamp between 10 sec and 5 min
        return Math.max(10000, Math.min(300000, delay));
    }

    // ─────────────────────────────────────────────────────────────
    // Main Tick
    // ─────────────────────────────────────────────────────────────

    /**
     * Execute one tick of the background loop
     * @returns {Promise<TickResult>}
     */
    async _tick() {
        const startTime = Date.now();
        this.tickCount++;
        this.lastTickAt = startTime;

        const actions = [];
        let activity = "idle";

        try {
            const awareness = this.awareness.getFullAwareness();
            this.awareness.setCurrentActivity("thinking");

            console.log(`\n[InnerLoop] ─── Tick #${this.tickCount} ───`);

            // 1. Check scheduled actions
            const scheduled = this.planner.getScheduledActions();
            if (scheduled.length > 0) {
                console.log(`[InnerLoop] Scheduled: ${scheduled.join(", ")}`);
                actions.push(...scheduled);
            }

            // 2. Generate goals from drives if idle
            // Relaxed threshold: Generate if less than 5 active goals
            if (awareness.task.activeGoals.length < 5) {
                // Check if we SHOULD generate based on boredom/idle
                const isBored = awareness.time.timeSinceAnyMessage > 30000; // 30s idle

                if (isBored || this.tickCount % 5 === 0) {
                    activity = "generating_goals";
                    this.awareness.setCurrentActivity("generating goals from drives");

                    const context = {
                        isIdle: true,
                        idleDuration: awareness.time.timeSinceAnyMessage,
                        timeSinceOwnerMessage: awareness.time.timeSinceOwnerMessage,
                        systemHealth: 1.0,
                    };

                    const newGoals = this.goalManager.generateFromDrives(context);
                    if (newGoals.length > 0) {
                        console.log(`[InnerLoop] Generated ${newGoals.length} new goals from drives`);
                        actions.push(`generated ${newGoals.length} goals`);
                    }
                }
            }

            // 3. Decide what to work on
            const { goal, reasoning } = await this.planner.decideNextFocus();
            if (goal) {
                console.log(`[InnerLoop] Focus: ${goal.description} (${reasoning})`);

                // If goal needs decomposition
                if (goal.status === "not_started") {
                    activity = "planning";
                    this.awareness.setCurrentActivity("planning: " + goal.description);

                    const plan = await this.planner.decompose(goal.id);
                    if (plan.steps.length > 0) {
                        console.log(`[InnerLoop] Decomposed into ${plan.steps.length} steps`);
                        actions.push(`decomposed goal into ${plan.steps.length} steps`);
                    }
                }
            }

            // 4. Periodic reflection (every 10 ticks when not busy)
            if (this.tickCount % 10 === 0 && !awareness.self.isBusy) {
                activity = "reflecting";
                this.awareness.setCurrentActivity("reflecting");

                const reflections = await this.reflection.reflectOnRecentEvents({});
                if (reflections.length > 0) {
                    console.log(`[InnerLoop] Reflected: ${reflections[0].content.slice(0, 50)}...`);
                    actions.push("reflected on recent events");
                }
            }

            // 5. Self-evaluation (every 50 ticks)
            if (this.tickCount % 50 === 0) {
                activity = "self_evaluating";
                this.awareness.setCurrentActivity("self-evaluation");

                const evaluation = await this.reflection.selfEvaluate();
                if (evaluation) {
                    console.log(`[InnerLoop] Self-eval: ${evaluation.content.slice(0, 50)}...`);
                    actions.push("completed self-evaluation");
                }
            }

            // 6. Proactive communication check
            const proactiveAction = await this._checkProactiveCommunication(awareness);
            if (proactiveAction) {
                actions.push(proactiveAction);
            }

            // 6.5. Boredom / Deep Thought
            // If we did nothing else this tick, and it's been a few ticks, force a thought
            if (actions.length === 0 && this.tickCount % 3 === 0) {
                // TODO: Wire this up to the LLM to actually "think" a thought
                // For now, we just log it to show the loop is alive
                const thought = "wondering about current state...";
                // console.log(`[InnerLoop] Idle thought: ${thought}`);
                // Not pushing to actions to avoid spamming energy updates, but it proves the loop is checking
            }

            // 7. Decay old reactions
            this.heartState.decayReactions();

            // Update energy based on activity
            if (actions.length > 0) {
                this.heartState.adjustEnergy(-0.02, "tick activity");
            } else {
                this.heartState.adjustEnergy(0.01, "resting");
            }

            this.awareness.setCurrentActivity(activity);

        } catch (error) {
            console.error("[InnerLoop] Tick error:", error);
            activity = "error";
        }

        const duration = Date.now() - startTime;
        console.log(`[InnerLoop] Tick complete in ${duration}ms, ${actions.length} actions`);

        return {
            activity,
            duration,
            actions,
            nextTickDelay: null, // Use calculated delay
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Proactive Communication
    // ─────────────────────────────────────────────────────────────

    /**
     * Check if Zed should reach out to someone
     * @param {import('./awareness.js').FullAwareness} awareness
     * @returns {Promise<string|null>}
     */
    async _checkProactiveCommunication(awareness) {
        // Don't be proactive if low energy
        if (awareness.self.energy < 0.3) return null;

        // Check if owner hasn't been seen in a while
        if (
            awareness.social.ownerStatus.lastSeen &&
            awareness.time.timeSinceOwnerMessage > 86400000 && // 24 hours
            this.tickCount % 20 === 0 // Don't check every tick
        ) {
            // Zed might want to check in with owner
            const shouldReachOut = await this._decideToReachOut("owner", "haven't talked in a while");

            if (shouldReachOut) {
                // TODO: Get owner's preferred channel and conversation ID
                // This would come from the presence model
                console.log("[InnerLoop] Would send proactive message to owner");
                return "considered reaching out to owner";
            }
        }

        // Check for pending goals that need owner approval
        const blocked = this.goalManager.getBlockedGoals();
        const needsOwnerApproval = blocked.filter((g) => g.blockedBy?.includes("owner approval"));

        if (needsOwnerApproval.length > 0 && this.tickCount % 5 === 0) {
            // TODO: Send notification to owner about pending approvals
            console.log(`[InnerLoop] ${needsOwnerApproval.length} goals need owner approval`);
            return `${needsOwnerApproval.length} goals pending owner approval`;
        }

        return null;
    }

    /**
     * Decide whether to proactively reach out
     * @param {string} who - Who to reach out to
     * @param {string} reason - Why considering reaching out
     * @returns {Promise<boolean>}
     */
    async _decideToReachOut(who, reason) {
        const moodInfluence = this.heartManager.getMoodInfluence();

        // Low proactivity boost means less likely to reach out
        if (moodInfluence.proactivityBoost < 0) {
            return false;
        }

        // Simple decision for now - could use LLM for more nuanced decisions
        // Probability based on proactivity boost and connection drive
        const probability = 0.3 + moodInfluence.proactivityBoost;
        return Math.random() < probability;
    }

    // ─────────────────────────────────────────────────────────────
    // Status
    // ─────────────────────────────────────────────────────────────

    /**
     * Get loop status
     */
    getStatus() {
        return {
            running: this.running,
            tickCount: this.tickCount,
            lastTickAt: this.lastTickAt,
            nextTickIn: this.timer ? this._calculateTickDelay() : null,
        };
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {InnerLoop|null} */
let instance = null;

export function getInnerLoop() {
    if (!instance) {
        instance = new InnerLoop();
    }
    return instance;
}

/**
 * Start the inner loop (convenience function)
 */
export function startInnerLoop() {
    getInnerLoop().start();
}

/**
 * Stop the inner loop (convenience function)
 */
export function stopInnerLoop() {
    getInnerLoop().stop();
}
