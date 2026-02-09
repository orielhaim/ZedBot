// ============================================================
//  Goal System — Storage
//
//  SQLite-backed storage for goals with full lifecycle tracking
// ============================================================

import Database from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_DB_PATH = "./data/zed-brain.db";

/**
 * @typedef {'not_started' | 'in_progress' | 'blocked' | 'completed' | 'abandoned'} GoalStatus
 * @typedef {'urgent' | 'normal' | 'background'} GoalPriority
 * @typedef {'self_generated' | 'adopted' | 'emergent'} GoalSource
 */

/**
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} description
 * @property {GoalPriority} priority
 * @property {GoalSource} source
 * @property {GoalStatus} status
 * @property {string|null} parentGoalId - For sub-goals
 * @property {string|null} driveType - Which drive generated this
 * @property {string|null} blockedBy - What's blocking this goal
 * @property {number|null} deadline
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number|null} completedAt
 */

export class GoalStore {
    /** @type {Database} */
    db;

    /**
     * @param {string} [dbPath]
     */
    constructor(dbPath = DEFAULT_DB_PATH) {
        this.db = new Database(dbPath, { create: true });
        this.db.exec("PRAGMA journal_mode = WAL;");
        this._initSchema();
    }

    _initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        source TEXT NOT NULL DEFAULT 'self_generated',
        status TEXT NOT NULL DEFAULT 'not_started',
        parent_goal_id TEXT,
        drive_type TEXT,
        blocked_by TEXT,
        deadline INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (parent_goal_id) REFERENCES goals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
      CREATE INDEX IF NOT EXISTS idx_goals_priority ON goals(priority);
      CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_goal_id);
    `);
    }

    // ─────────────────────────────────────────────────────────────
    // CRUD Operations
    // ─────────────────────────────────────────────────────────────

    /**
     * Create a new goal
     * @param {Object} data
     * @returns {Goal}
     */
    create(data) {
        const now = Date.now();
        const goal = {
            id: uuidv4(),
            description: data.description,
            priority: data.priority || "normal",
            source: data.source || "self_generated",
            status: data.status || "not_started",
            parentGoalId: data.parentGoalId || null,
            driveType: data.driveType || null,
            blockedBy: data.blockedBy || null,
            deadline: data.deadline || null,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
        };

        this.db.run(
            `INSERT INTO goals (id, description, priority, source, status, parent_goal_id, drive_type, blocked_by, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                goal.id,
                goal.description,
                goal.priority,
                goal.source,
                goal.status,
                goal.parentGoalId,
                goal.driveType,
                goal.blockedBy,
                goal.deadline,
                goal.createdAt,
                goal.updatedAt,
            ]
        );

        return goal;
    }

    /**
     * Get goal by ID
     * @param {string} id
     * @returns {Goal|null}
     */
    getById(id) {
        const row = this.db.query("SELECT * FROM goals WHERE id = ?").get(id);
        return row ? this._rowToGoal(row) : null;
    }

    /**
     * Update goal
     * @param {string} id
     * @param {Partial<Goal>} updates
     * @returns {Goal|null}
     */
    update(id, updates) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            const dbKey = this._toSnakeCase(key);
            fields.push(`${dbKey} = ?`);
            values.push(value);
        }

        fields.push("updated_at = ?");
        values.push(Date.now());
        values.push(id);

        this.db.run(`UPDATE goals SET ${fields.join(", ")} WHERE id = ?`, values);
        return this.getById(id);
    }

    /**
     * Get goals by status
     * @param {GoalStatus} status
     * @returns {Goal[]}
     */
    getByStatus(status) {
        const rows = this.db.query("SELECT * FROM goals WHERE status = ? ORDER BY priority, created_at").all(status);
        return rows.map(this._rowToGoal);
    }

    /**
     * Get active goals (not_started or in_progress)
     * @returns {Goal[]}
     */
    getActive() {
        const rows = this.db.query(
            "SELECT * FROM goals WHERE status IN ('not_started', 'in_progress') ORDER BY priority, created_at"
        ).all();
        return rows.map(this._rowToGoal);
    }

    /**
     * Get blocked goals
     * @returns {Goal[]}
     */
    getBlocked() {
        const rows = this.db.query("SELECT * FROM goals WHERE status = 'blocked' ORDER BY created_at").all();
        return rows.map(this._rowToGoal);
    }

    /**
     * Get sub-goals for a parent
     * @param {string} parentId
     * @returns {Goal[]}
     */
    getSubGoals(parentId) {
        const rows = this.db.query("SELECT * FROM goals WHERE parent_goal_id = ? ORDER BY created_at").all(parentId);
        return rows.map(this._rowToGoal);
    }

    /**
     * Get goals completed today
     * @returns {Goal[]}
     */
    getCompletedToday() {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const rows = this.db.query(
            "SELECT * FROM goals WHERE status = 'completed' AND completed_at >= ? ORDER BY completed_at DESC"
        ).all(startOfDay.getTime());
        return rows.map(this._rowToGoal);
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    _rowToGoal(row) {
        return {
            id: row.id,
            description: row.description,
            priority: row.priority,
            source: row.source,
            status: row.status,
            parentGoalId: row.parent_goal_id,
            driveType: row.drive_type,
            blockedBy: row.blocked_by,
            deadline: row.deadline,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            completedAt: row.completed_at,
        };
    }

    _toSnakeCase(str) {
        return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {GoalStore|null} */
let instance = null;

export function getGoalStore() {
    if (!instance) {
        instance = new GoalStore();
    }
    return instance;
}
