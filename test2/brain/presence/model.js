// ============================================================
//  Presence Model — Tracking
//
//  Tracks presence signals for each profile:
//  - Last seen times per channel
//  - Activity patterns
//  - Availability windows
// ============================================================

import Database from "bun:sqlite";

const DEFAULT_DB_PATH = "./data/zed-brain.db";

/**
 * @typedef {Object} PresenceSignal
 * @property {string} profileId
 * @property {string} channelType
 * @property {string} channelId
 * @property {string} conversationId
 * @property {number} lastSeenAt
 * @property {number} messageCount - Messages in last 24h
 */

export class PresenceModel {
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
      CREATE TABLE IF NOT EXISTS presence (
        profile_id TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        last_seen_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 1,
        PRIMARY KEY (profile_id, channel_type, conversation_id)
      );

      CREATE INDEX IF NOT EXISTS idx_presence_profile ON presence(profile_id);
      CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen_at);
    `);
    }

    // ─────────────────────────────────────────────────────────────
    // Signal Recording
    // ─────────────────────────────────────────────────────────────

    /**
     * Record a presence signal (saw user on a channel)
     * @param {Object} signal
     * @param {string} signal.profileId
     * @param {string} signal.channelType
     * @param {string} signal.channelId
     * @param {string} signal.conversationId
     */
    recordSignal(signal) {
        const { profileId, channelType, channelId, conversationId } = signal;
        const now = Date.now();

        this.db.run(
            `INSERT INTO presence (profile_id, channel_type, channel_id, conversation_id, last_seen_at, message_count)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT (profile_id, channel_type, conversation_id) DO UPDATE SET
         last_seen_at = ?,
         channel_id = ?,
         message_count = message_count + 1`,
            [profileId, channelType, channelId, conversationId, now, now, channelId]
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Presence Queries
    // ─────────────────────────────────────────────────────────────

    /**
     * Get all presence signals for a profile
     * @param {string} profileId
     * @returns {PresenceSignal[]}
     */
    getForProfile(profileId) {
        const rows = this.db.query(
            "SELECT * FROM presence WHERE profile_id = ? ORDER BY last_seen_at DESC"
        ).all(profileId);

        return rows.map(this._rowToSignal);
    }

    /**
     * Get the most recent presence for a profile
     * @param {string} profileId
     * @returns {PresenceSignal|null}
     */
    getMostRecent(profileId) {
        const row = this.db.query(
            "SELECT * FROM presence WHERE profile_id = ? ORDER BY last_seen_at DESC LIMIT 1"
        ).get(profileId);

        return row ? this._rowToSignal(row) : null;
    }

    /**
     * Get the best channel for a profile (most active)
     * @param {string} profileId
     * @returns {PresenceSignal|null}
     */
    getBestChannel(profileId) {
        // Recent + high message count = best channel
        const cutoff = Date.now() - 7 * 86400000; // Last 7 days

        const row = this.db.query(`
      SELECT * FROM presence
      WHERE profile_id = ? AND last_seen_at > ?
      ORDER BY message_count DESC, last_seen_at DESC
      LIMIT 1
    `).get([profileId, cutoff]);

        return row ? this._rowToSignal(row) : null;
    }

    /**
     * Check if a profile is likely online
     * @param {string} profileId
     * @returns {boolean}
     */
    isLikelyOnline(profileId) {
        const recent = this.getMostRecent(profileId);
        if (!recent) return false;

        // Consider online if seen in last 10 minutes
        return (Date.now() - recent.lastSeenAt) < 600000;
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    _rowToSignal(row) {
        return {
            profileId: row.profile_id,
            channelType: row.channel_type,
            channelId: row.channel_id,
            conversationId: row.conversation_id,
            lastSeenAt: row.last_seen_at,
            messageCount: row.message_count,
        };
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {PresenceModel|null} */
let instance = null;

export function getPresenceModel() {
    if (!instance) {
        instance = new PresenceModel();
    }
    return instance;
}
