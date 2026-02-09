// ============================================================
//  Profile Store — SQLite-backed profile storage
//  Tables: profiles, platform_identities, profile_facts
// ============================================================

import Database from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";

/**
 * @typedef {import('../../lib/types.js').Profile} Profile
 * @typedef {import('../../lib/types.js').ProfileFact} ProfileFact
 * @typedef {import('../../lib/types.js').PlatformIdentity} PlatformIdentity
 */

const DEFAULT_DB_PATH = "./data/zed-brain.db";

export class ProfileStore {
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
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'stranger',
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        total_interactions INTEGER DEFAULT 0,
        patterns TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS platform_identities (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        platform_user_id TEXT NOT NULL,
        platform_username TEXT,
        linked_at INTEGER NOT NULL,
        linked_by TEXT NOT NULL DEFAULT 'auto',
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE(platform, channel_id, platform_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_identity_lookup 
        ON platform_identities(platform, channel_id, platform_user_id);

      CREATE TABLE IF NOT EXISTS profile_facts (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        learned_at INTEGER NOT NULL,
        last_confirmed INTEGER,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_facts_profile ON profile_facts(profile_id);
    `);
    }

    /**
     * Get a profile by ID.
     * @param {string} profileId
     * @returns {Profile | null}
     */
    getById(profileId) {
        const row = this.db.query("SELECT * FROM profiles WHERE id = ?").get(profileId);
        if (!row) return null;
        return this._hydrateProfile(row);
    }

    /**
     * Look up a profile by platform identity.
     * @param {string} platform
     * @param {string} channelId
     * @param {string} platformUserId
     * @returns {Profile | null}
     */
    getByPlatformIdentity(platform, channelId, platformUserId) {
        const identity = this.db.query(`
      SELECT profile_id FROM platform_identities 
      WHERE platform = ? AND channel_id = ? AND platform_user_id = ?
    `).get(platform, channelId, platformUserId);

        if (!identity) return null;
        return this.getById(identity.profile_id);
    }

    /**
     * Create a new profile.
     * @param {Omit<Profile, 'id' | 'facts'>} data
     * @returns {Profile}
     */
    create(data) {
        const id = uuidv4();
        const now = Date.now();

        this.db.query(`
      INSERT INTO profiles (id, display_name, role, first_seen, last_seen, total_interactions, patterns)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
            id,
            data.displayName,
            data.role || "stranger",
            data.firstSeen || now,
            data.lastSeen || now,
            data.totalInteractions || 0,
            JSON.stringify(data.patterns || {})
        );

        // Add identities
        for (const identity of data.identities || []) {
            this._addIdentity(id, identity);
        }

        return this.getById(id);
    }

    /**
     * Update a profile.
     * @param {string} profileId
     * @param {Partial<Profile>} updates
     * @returns {Profile | null}
     */
    update(profileId, updates) {
        const sets = [];
        const values = [];

        if (updates.displayName !== undefined) {
            sets.push("display_name = ?");
            values.push(updates.displayName);
        }
        if (updates.role !== undefined) {
            sets.push("role = ?");
            values.push(updates.role);
        }
        if (updates.lastSeen !== undefined) {
            sets.push("last_seen = ?");
            values.push(updates.lastSeen);
        }
        if (updates.totalInteractions !== undefined) {
            sets.push("total_interactions = ?");
            values.push(updates.totalInteractions);
        }
        if (updates.patterns !== undefined) {
            sets.push("patterns = ?");
            values.push(JSON.stringify(updates.patterns));
        }

        if (sets.length > 0) {
            values.push(profileId);
            this.db.query(`UPDATE profiles SET ${sets.join(", ")} WHERE id = ?`).run(...values);
        }

        return this.getById(profileId);
    }

    /**
     * Record an interaction (update last_seen and increment count).
     * @param {string} profileId
     */
    recordInteraction(profileId) {
        this.db.query(`
      UPDATE profiles 
      SET last_seen = ?, total_interactions = total_interactions + 1 
      WHERE id = ?
    `).run(Date.now(), profileId);
    }

    /**
     * Add a fact to a profile.
     * @param {string} profileId
     * @param {Omit<ProfileFact, 'id'>} fact
     * @returns {ProfileFact}
     */
    addFact(profileId, fact) {
        const id = uuidv4();
        const now = Date.now();

        this.db.query(`
      INSERT INTO profile_facts (id, profile_id, content, category, source, confidence, learned_at, last_confirmed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            id,
            profileId,
            fact.content,
            fact.category,
            fact.source,
            fact.confidence || 0.5,
            fact.learnedAt || now,
            fact.lastConfirmed || null
        );

        return { id, ...fact, learnedAt: fact.learnedAt || now };
    }

    /**
     * Get facts for a profile.
     * @param {string} profileId
     * @param {number} [limit]
     * @returns {ProfileFact[]}
     */
    getFacts(profileId, limit = 50) {
        const rows = this.db.query(`
      SELECT * FROM profile_facts 
      WHERE profile_id = ? 
      ORDER BY learned_at DESC 
      LIMIT ?
    `).all(profileId, limit);

        return rows.map(this._hydrateProfileFact);
    }

    /**
     * Add a platform identity to a profile.
     * @param {string} profileId
     * @param {PlatformIdentity} identity
     */
    addIdentity(profileId, identity) {
        this._addIdentity(profileId, identity);
    }

    /**
     * Internal method to add identity.
     * @private
     */
    _addIdentity(profileId, identity) {
        const id = uuidv4();
        this.db.query(`
      INSERT OR REPLACE INTO platform_identities 
      (id, profile_id, platform, channel_id, platform_user_id, platform_username, linked_at, linked_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            id,
            profileId,
            identity.platform,
            identity.channelId,
            identity.platformUserId,
            identity.platformUsername || null,
            identity.linkedAt || Date.now(),
            identity.linkedBy || "auto"
        );
    }

    /**
     * Get all identities for a profile.
     * @param {string} profileId
     * @returns {PlatformIdentity[]}
     */
    getIdentities(profileId) {
        const rows = this.db.query(`
      SELECT * FROM platform_identities WHERE profile_id = ?
    `).all(profileId);

        return rows.map(this._hydrateIdentity);
    }

    /**
     * Link two profiles (merge identities from source into target).
     * @param {string} targetProfileId
     * @param {string} sourceProfileId
     */
    linkProfiles(targetProfileId, sourceProfileId) {
        // Move all identities from source to target
        this.db.query(`
      UPDATE platform_identities SET profile_id = ? WHERE profile_id = ?
    `).run(targetProfileId, sourceProfileId);

        // Move all facts from source to target
        this.db.query(`
      UPDATE profile_facts SET profile_id = ? WHERE profile_id = ?
    `).run(targetProfileId, sourceProfileId);

        // Delete the source profile
        this.db.query(`DELETE FROM profiles WHERE id = ?`).run(sourceProfileId);
    }

    /**
     * Search profiles by name or facts.
     * @param {string} query
     * @param {number} [limit]
     * @returns {Profile[]}
     */
    search(query, limit = 10) {
        const likeQuery = `%${query}%`;

        // Search by display name
        const byName = this.db.query(`
      SELECT id FROM profiles WHERE display_name LIKE ? LIMIT ?
    `).all(likeQuery, limit);

        // Search by facts
        const byFact = this.db.query(`
      SELECT DISTINCT profile_id FROM profile_facts WHERE content LIKE ? LIMIT ?
    `).all(likeQuery, limit);

        const profileIds = new Set([
            ...byName.map((r) => r.id),
            ...byFact.map((r) => r.profile_id),
        ]);

        return [...profileIds].slice(0, limit).map((id) => this.getById(id)).filter(Boolean);
    }

    /**
     * Get all profiles with a specific role.
     * @param {string} role
     * @returns {Profile[]}
     */
    getByRole(role) {
        const rows = this.db.query(`SELECT * FROM profiles WHERE role = ?`).all(role);
        return rows.map((row) => this._hydrateProfile(row));
    }

    /**
     * Hydrate a profile from a database row.
     * @private
     */
    _hydrateProfile(row) {
        return {
            id: row.id,
            displayName: row.display_name,
            role: row.role,
            identities: this.getIdentities(row.id),
            facts: this.getFacts(row.id),
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            totalInteractions: row.total_interactions,
            patterns: JSON.parse(row.patterns || "{}"),
        };
    }

    /**
     * Hydrate a platform identity from a database row.
     * @private
     */
    _hydrateIdentity(row) {
        return {
            platform: row.platform,
            channelId: row.channel_id,
            platformUserId: row.platform_user_id,
            platformUsername: row.platform_username,
            linkedAt: row.linked_at,
            linkedBy: row.linked_by,
        };
    }

    /**
     * Hydrate a profile fact from a database row.
     * @private
     */
    _hydrateProfileFact(row) {
        return {
            id: row.id,
            content: row.content,
            category: row.category,
            source: row.source,
            confidence: row.confidence,
            learnedAt: row.learned_at,
            lastConfirmed: row.last_confirmed,
        };
    }

    close() {
        this.db.close();
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared ProfileStore instance.
 * @param {string} [dbPath]
 * @returns {ProfileStore}
 */
export function getProfileStore(dbPath) {
    if (!_instance) {
        _instance = new ProfileStore(dbPath);
    }
    return _instance;
}
