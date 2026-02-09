// ============================================================
//  Branch Store — SQLite-backed branch/conversation storage
//  Tables: branches, stored_messages
// ============================================================

import Database from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";

/**
 * @typedef {import('../../lib/types.js').Branch} Branch
 * @typedef {import('../../lib/types.js').BranchParticipant} BranchParticipant
 * @typedef {import('../../lib/types.js').BranchMood} BranchMood
 * @typedef {import('../../lib/types.js').StoredMessage} StoredMessage
 * @typedef {import('../../lib/types.js').ResponseDecision} ResponseDecision
 * @typedef {import('../../lib/types.js').PendingAction} PendingAction
 */

const DEFAULT_DB_PATH = "./data/zed-brain.db";

export class BranchStore {
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
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        channel_type TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        participants TEXT DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        mood TEXT DEFAULT '{}',
        current_topic TEXT,
        summary TEXT,
        summary_up_to_message_id TEXT,
        pending_actions TEXT DEFAULT '[]',
        response_decision TEXT,
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        last_zed_response_at INTEGER,
        UNIQUE(channel_id, conversation_id)
      );

      CREATE INDEX IF NOT EXISTS idx_branch_lookup 
        ON branches(channel_id, conversation_id);
      
      CREATE INDEX IF NOT EXISTS idx_branch_status 
        ON branches(status);

      CREATE TABLE IF NOT EXISTS stored_messages (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        sender_profile_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_branch 
        ON stored_messages(branch_id, timestamp DESC);
    `);
    }

    /**
     * Get a branch by ID.
     * @param {string} branchId
     * @returns {Branch | null}
     */
    getById(branchId) {
        const row = this.db.query("SELECT * FROM branches WHERE id = ?").get(branchId);
        if (!row) return null;
        return this._hydrateBranch(row);
    }

    /**
     * Find a branch by channel and conversation IDs.
     * @param {string} channelId
     * @param {string} conversationId
     * @returns {Branch | null}
     */
    getByConversation(channelId, conversationId) {
        const row = this.db.query(`
      SELECT * FROM branches WHERE channel_id = ? AND conversation_id = ?
    `).get(channelId, conversationId);

        if (!row) return null;
        return this._hydrateBranch(row);
    }

    /**
     * Create a new branch.
     * @param {Omit<Branch, 'id' | 'messages'>} data
     * @returns {Branch}
     */
    create(data) {
        const id = uuidv4();
        const now = Date.now();

        this.db.query(`
      INSERT INTO branches (
        id, channel_type, channel_id, conversation_id, participants, status,
        mood, current_topic, summary, summary_up_to_message_id, pending_actions,
        response_decision, created_at, last_activity_at, last_zed_response_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            id,
            data.channelType,
            data.channelId,
            data.conversationId,
            JSON.stringify(data.participants || []),
            data.status || "active",
            JSON.stringify(data.mood || { tone: "neutral", confidence: 0.5, updatedAt: now }),
            data.currentTopic || null,
            data.summary || null,
            data.summaryUpToMessageId || null,
            JSON.stringify(data.pendingActions || []),
            data.responseDecision ? JSON.stringify(data.responseDecision) : null,
            data.createdAt || now,
            data.lastActivityAt || now,
            data.lastZedResponseAt || null
        );

        return this.getById(id);
    }

    /**
     * Update a branch.
     * @param {string} branchId
     * @param {Partial<Branch>} updates
     * @returns {Branch | null}
     */
    update(branchId, updates) {
        const sets = [];
        const values = [];

        if (updates.status !== undefined) {
            sets.push("status = ?");
            values.push(updates.status);
        }
        if (updates.mood !== undefined) {
            sets.push("mood = ?");
            values.push(JSON.stringify(updates.mood));
        }
        if (updates.currentTopic !== undefined) {
            sets.push("current_topic = ?");
            values.push(updates.currentTopic);
        }
        if (updates.summary !== undefined) {
            sets.push("summary = ?");
            values.push(updates.summary);
        }
        if (updates.summaryUpToMessageId !== undefined) {
            sets.push("summary_up_to_message_id = ?");
            values.push(updates.summaryUpToMessageId);
        }
        if (updates.pendingActions !== undefined) {
            sets.push("pending_actions = ?");
            values.push(JSON.stringify(updates.pendingActions));
        }
        if (updates.responseDecision !== undefined) {
            sets.push("response_decision = ?");
            values.push(JSON.stringify(updates.responseDecision));
        }
        if (updates.lastActivityAt !== undefined) {
            sets.push("last_activity_at = ?");
            values.push(updates.lastActivityAt);
        }
        if (updates.lastZedResponseAt !== undefined) {
            sets.push("last_zed_response_at = ?");
            values.push(updates.lastZedResponseAt);
        }
        if (updates.participants !== undefined) {
            sets.push("participants = ?");
            values.push(JSON.stringify(updates.participants));
        }

        if (sets.length > 0) {
            values.push(branchId);
            this.db.query(`UPDATE branches SET ${sets.join(", ")} WHERE id = ?`).run(...values);
        }

        return this.getById(branchId);
    }

    /**
     * Update just the last activity time.
     * @param {string} branchId
     */
    touch(branchId) {
        this.db.query(`UPDATE branches SET last_activity_at = ? WHERE id = ?`).run(Date.now(), branchId);
    }

    /**
     * Mark a branch as dormant.
     * @param {string} branchId
     */
    markDormant(branchId) {
        this.update(branchId, { status: "dormant" });
    }

    /**
     * Reactivate a dormant branch.
     * @param {string} branchId
     * @returns {Branch | null}
     */
    reactivate(branchId) {
        return this.update(branchId, { status: "active", lastActivityAt: Date.now() });
    }

    /**
     * Close a branch.
     * @param {string} branchId
     */
    close(branchId) {
        this.update(branchId, { status: "closed" });
    }

    /**
     * Get all active branches.
     * @returns {Branch[]}
     */
    getActive() {
        const rows = this.db.query(`
      SELECT * FROM branches WHERE status = 'active' ORDER BY last_activity_at DESC
    `).all();
        return rows.map((row) => this._hydrateBranch(row));
    }

    /**
     * Get branches by status.
     * @param {string} status
     * @param {number} [limit]
     * @returns {Branch[]}
     */
    getByStatus(status, limit = 50) {
        const rows = this.db.query(`
      SELECT * FROM branches WHERE status = ? ORDER BY last_activity_at DESC LIMIT ?
    `).all(status, limit);
        return rows.map((row) => this._hydrateBranch(row));
    }

    // ── Message Operations ──

    /**
     * Add a message to a branch.
     * @param {Omit<StoredMessage, 'id'>} message
     * @returns {StoredMessage}
     */
    addMessage(message) {
        const id = uuidv4();

        this.db.query(`
      INSERT INTO stored_messages (id, branch_id, sender_profile_id, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            id,
            message.branchId,
            message.senderProfileId,
            JSON.stringify(message.content),
            message.timestamp || Date.now(),
            message.metadata ? JSON.stringify(message.metadata) : null
        );

        // Update branch activity
        this.touch(message.branchId);

        return { id, ...message, timestamp: message.timestamp || Date.now() };
    }

    /**
     * Get recent messages for a branch.
     * @param {string} branchId
     * @param {number} [limit]
     * @returns {StoredMessage[]}
     */
    getRecentMessages(branchId, limit = 50) {
        const rows = this.db.query(`
      SELECT * FROM stored_messages 
      WHERE branch_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(branchId, limit);

        // Return in chronological order
        return rows.reverse().map(this._hydrateMessage);
    }

    /**
     * Get messages after a certain point.
     * @param {string} branchId
     * @param {string} afterMessageId
     * @returns {StoredMessage[]}
     */
    getMessagesAfter(branchId, afterMessageId) {
        // Get the timestamp of the reference message
        const ref = this.db.query(`
      SELECT timestamp FROM stored_messages WHERE id = ?
    `).get(afterMessageId);

        if (!ref) return [];

        const rows = this.db.query(`
      SELECT * FROM stored_messages 
      WHERE branch_id = ? AND timestamp > ? 
      ORDER BY timestamp ASC
    `).all(branchId, ref.timestamp);

        return rows.map(this._hydrateMessage);
    }

    /**
     * Get a specific message.
     * @param {string} messageId
     * @returns {StoredMessage | null}
     */
    getMessage(messageId) {
        const row = this.db.query(`SELECT * FROM stored_messages WHERE id = ?`).get(messageId);
        return row ? this._hydrateMessage(row) : null;
    }

    /**
     * Count messages in a branch.
     * @param {string} branchId
     * @returns {number}
     */
    countMessages(branchId) {
        const result = this.db.query(`
      SELECT COUNT(*) as count FROM stored_messages WHERE branch_id = ?
    `).get(branchId);
        return result?.count || 0;
    }

    /**
     * Get branches with messages from a specific profile.
     * @param {string} profileId
     * @returns {Branch[]}
     */
    getBranchesForProfile(profileId) {
        const rows = this.db.query(`
      SELECT DISTINCT b.* FROM branches b
      INNER JOIN stored_messages m ON b.id = m.branch_id
      WHERE m.sender_profile_id = ?
      ORDER BY b.last_activity_at DESC
    `).all(profileId);
        return rows.map((row) => this._hydrateBranch(row));
    }

    // ── Hydration ──

    /**
     * @private
     */
    _hydrateBranch(row) {
        return {
            id: row.id,
            channelType: row.channel_type,
            channelId: row.channel_id,
            conversationId: row.conversation_id,
            participants: JSON.parse(row.participants || "[]"),
            status: row.status,
            mood: JSON.parse(row.mood || '{"tone":"neutral","confidence":0.5}'),
            currentTopic: row.current_topic,
            summary: row.summary,
            summaryUpToMessageId: row.summary_up_to_message_id,
            pendingActions: JSON.parse(row.pending_actions || "[]"),
            responseDecision: row.response_decision ? JSON.parse(row.response_decision) : undefined,
            createdAt: row.created_at,
            lastActivityAt: row.last_activity_at,
            lastZedResponseAt: row.last_zed_response_at,
            messages: [], // Loaded separately
        };
    }

    /**
     * @private
     */
    _hydrateMessage(row) {
        return {
            id: row.id,
            branchId: row.branch_id,
            senderProfileId: row.sender_profile_id,
            content: JSON.parse(row.content),
            timestamp: row.timestamp,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        };
    }

    close() {
        this.db.close();
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared BranchStore instance.
 * @param {string} [dbPath]
 * @returns {BranchStore}
 */
export function getBranchStore(dbPath) {
    if (!_instance) {
        _instance = new BranchStore(dbPath);
    }
    return _instance;
}
