// ============================================================
//  Memory Store — SQLite-backed memory storage with embeddings
//  Supports episodic, semantic, and procedural memories
//  Retrieval scoring: recency × importance × relevance
// ============================================================

import Database from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";
import { embeddingModel } from "../../lib/models.js";

/**
 * @typedef {import('../../lib/types.js').MemoryRecord} MemoryRecord
 * @typedef {import('../../lib/types.js').MemoryType} MemoryType
 * @typedef {import('../../lib/types.js').RetrievalQuery} RetrievalQuery
 * @typedef {import('../../lib/types.js').ScoredMemory} ScoredMemory
 * @typedef {import('../../lib/types.js').RetrievalWeights} RetrievalWeights
 */

const DEFAULT_DB_PATH = "./data/zed-brain.db";

// Decay rate for recency scoring (λ in exponential decay)
// Chosen so: 1 hour ago ≈ 0.97, 24 hours ≈ 0.53, 7 days ≈ 0.02
const RECENCY_DECAY_RATE = 0.025;

export class MemoryStore {
    /** @type {Database} */
    db;

    embeddings;

    /**
     * @param {string} [dbPath]
     */
    constructor(dbPath = DEFAULT_DB_PATH) {
        this.db = new Database(dbPath, { create: true });
        this.db.exec("PRAGMA journal_mode = WAL;");
        this._initSchema();

        // Initialize embeddings model
        this.embeddings = embeddingModel;
    }

    _initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance REAL DEFAULT 0.5,
        last_accessed INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        source TEXT NOT NULL,
        related_profile_ids TEXT DEFAULT '[]',
        related_branch_ids TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        embedding TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        status TEXT DEFAULT 'active',
        extra_data TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_memory_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memory_status ON memories(status);
      CREATE INDEX IF NOT EXISTS idx_memory_importance ON memories(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_created ON memories(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_accessed ON memories(last_accessed DESC);

      -- Short-term buffer for consolidation
      CREATE TABLE IF NOT EXISTS memory_buffer (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        event_type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_buffer_timestamp ON memory_buffer(timestamp);
    `);
    }

    // ── Core Storage ──

    /**
     * Store a memory record.
     * @param {Omit<MemoryRecord, 'id' | 'embedding'> & {embedding?: number[]}} memory
     * @returns {Promise<MemoryRecord>}
     */
    async store(memory) {
        const id = uuidv4();
        const now = Date.now();

        // Generate embedding if not provided
        let embedding = memory.embedding;
        if (!embedding || embedding.length === 0) {
            embedding = await this._generateEmbedding(memory.content);
        }

        this.db.query(`
      INSERT INTO memories (
        id, type, content, importance, last_accessed, access_count,
        source, related_profile_ids, related_branch_ids, tags,
        embedding, created_at, expires_at, status, extra_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            id,
            memory.type,
            memory.content,
            memory.importance || 0.5,
            memory.lastAccessed || now,
            memory.accessCount || 0,
            JSON.stringify(memory.source),
            JSON.stringify(memory.relatedProfileIds || []),
            JSON.stringify(memory.relatedBranchIds || []),
            JSON.stringify(memory.tags || []),
            JSON.stringify(embedding),
            memory.createdAt || now,
            memory.expiresAt || null,
            memory.status || "active",
            this._packExtraData(memory)
        );

        return { id, ...memory, embedding, createdAt: memory.createdAt || now };
    }

    /**
     * Store multiple memories at once.
     * @param {Array<Omit<MemoryRecord, 'id' | 'embedding'>>} memories
     * @returns {Promise<MemoryRecord[]>}
     */
    async storeMany(memories) {
        const results = [];
        for (const memory of memories) {
            results.push(await this.store(memory));
        }
        return results;
    }

    /**
     * Get a memory by ID.
     * @param {string} id
     * @returns {MemoryRecord | null}
     */
    getById(id) {
        const row = this.db.query("SELECT * FROM memories WHERE id = ?").get(id);
        return row ? this._hydrateMemory(row) : null;
    }

    /**
     * Update a memory's access time (refreshes recency).
     * @param {string} id
     */
    recordAccess(id) {
        this.db.query(`
      UPDATE memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?
    `).run(Date.now(), id);
    }

    /**
     * Archive a memory (soft delete).
     * @param {string} id
     */
    archive(id) {
        this.db.query(`UPDATE memories SET status = 'archived' WHERE id = ?`).run(id);
    }

    /**
     * Update importance score.
     * @param {string} id
     * @param {number} importance
     */
    updateImportance(id, importance) {
        this.db.query(`UPDATE memories SET importance = ? WHERE id = ?`).run(importance, id);
    }

    // ── Retrieval ──

    /**
     * Retrieve memories matching a query with scoring.
     * @param {RetrievalQuery} query
     * @returns {Promise<ScoredMemory[]>}
     */
    async retrieve(query) {
        const now = Date.now();

        // Generate query embedding
        let queryEmbedding = query.queryEmbedding;
        if (!queryEmbedding) {
            queryEmbedding = await this._generateEmbedding(query.queryText);
        }

        // Default weights
        const weights = {
            recency: query.weights?.recency ?? 1.0,
            importance: query.weights?.importance ?? 1.0,
            relevance: query.weights?.relevance ?? 1.0,
        };

        // Build SQL query with filters
        let sql = `SELECT * FROM memories WHERE status = 'active'`;
        const params = [];

        if (query.type) {
            sql += ` AND type = ?`;
            params.push(query.type);
        }

        if (query.minImportance !== undefined) {
            sql += ` AND importance >= ?`;
            params.push(query.minImportance);
        }

        if (query.timeRange?.start !== undefined) {
            sql += ` AND created_at >= ?`;
            params.push(query.timeRange.start);
        }

        if (query.timeRange?.end !== undefined) {
            sql += ` AND created_at <= ?`;
            params.push(query.timeRange.end);
        }

        // Get more candidates than needed for scoring
        sql += ` ORDER BY importance DESC LIMIT ?`;
        params.push(query.limit * 5);

        const rows = this.db.query(sql).all(...params);

        // Score and filter
        const scored = rows
            .map((row) => {
                const memory = this._hydrateMemory(row);
                return this._calculateScore(memory, queryEmbedding, weights, now);
            })
            .filter((s) => {
                // Apply profile filter
                if (query.profileIds?.length) {
                    const hasProfile = query.profileIds.some((pid) =>
                        s.memory.relatedProfileIds.includes(pid)
                    );
                    if (!hasProfile) return false;
                }

                // Apply tag filter
                if (query.tags?.length) {
                    const hasTag = query.tags.some((tag) => s.memory.tags.includes(tag));
                    if (!hasTag) return false;
                }

                // Apply minimum score
                if (query.minScore !== undefined && s.score < query.minScore) {
                    return false;
                }

                return true;
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, query.limit);

        // Record access for retrieved memories
        for (const s of scored) {
            this.recordAccess(s.memory.id);
        }

        return scored;
    }

    /**
     * Get memories related to a specific profile.
     * @param {string} profileId
     * @param {{type?: MemoryType, limit?: number}} [options]
     * @returns {MemoryRecord[]}
     */
    getByProfile(profileId, options = {}) {
        let sql = `SELECT * FROM memories WHERE status = 'active' AND related_profile_ids LIKE ?`;
        const params = [`%"${profileId}"%`];

        if (options.type) {
            sql += ` AND type = ?`;
            params.push(options.type);
        }

        sql += ` ORDER BY last_accessed DESC LIMIT ?`;
        params.push(options.limit || 20);

        const rows = this.db.query(sql).all(...params);
        return rows.map(this._hydrateMemory);
    }

    /**
     * Get recent memories.
     * @param {number} [limit]
     * @param {MemoryType} [type]
     * @returns {MemoryRecord[]}
     */
    getRecent(limit = 20, type) {
        let sql = `SELECT * FROM memories WHERE status = 'active'`;
        const params = [];

        if (type) {
            sql += ` AND type = ?`;
            params.push(type);
        }

        sql += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);

        const rows = this.db.query(sql).all(...params);
        return rows.map(this._hydrateMemory);
    }

    // ── Short-term Buffer ──

    /**
     * Append to the short-term buffer.
     * @param {{branchId?: string, eventType: string, content: string, metadata?: object}} entry
     */
    appendToBuffer(entry) {
        const id = uuidv4();
        this.db.query(`
      INSERT INTO memory_buffer (id, branch_id, event_type, content, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            id,
            entry.branchId || null,
            entry.eventType,
            entry.content,
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            Date.now()
        );
    }

    /**
     * Get buffer entries since a timestamp.
     * @param {number} since
     * @returns {Array<{id: string, branchId?: string, eventType: string, content: string, metadata?: object, timestamp: number}>}
     */
    getBufferSince(since) {
        const rows = this.db.query(`
      SELECT * FROM memory_buffer WHERE timestamp >= ? ORDER BY timestamp ASC
    `).all(since);

        return rows.map((row) => ({
            id: row.id,
            branchId: row.branch_id,
            eventType: row.event_type,
            content: row.content,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            timestamp: row.timestamp,
        }));
    }

    /**
     * Clear buffer entries up to a timestamp.
     * @param {number} upTo
     */
    clearBuffer(upTo) {
        this.db.query(`DELETE FROM memory_buffer WHERE timestamp <= ?`).run(upTo);
    }

    // ── Scoring ──

    /**
     * Calculate retrieval score for a memory.
     * @private
     * @param {MemoryRecord} memory
     * @param {number[]} queryEmbedding
     * @param {RetrievalWeights} weights
     * @param {number} now
     * @returns {ScoredMemory}
     */
    _calculateScore(memory, queryEmbedding, weights, now) {
        // Recency: exponential decay based on hours since last access
        const hoursSinceAccess = (now - memory.lastAccessed) / (1000 * 60 * 60);
        const recencyScore = Math.exp(-RECENCY_DECAY_RATE * hoursSinceAccess);

        // Importance: directly from the memory
        const importanceScore = memory.importance;

        // Relevance: cosine similarity
        const relevanceScore = this._cosineSimilarity(queryEmbedding, memory.embedding);

        // Weighted combination (normalized)
        const totalWeight = weights.recency + weights.importance + weights.relevance;
        const score =
            (weights.recency * recencyScore +
                weights.importance * importanceScore +
                weights.relevance * relevanceScore) /
            totalWeight;

        return {
            memory,
            score,
            breakdown: { recencyScore, importanceScore, relevanceScore },
        };
    }

    /**
     * Cosine similarity between two vectors.
     * @private
     */
    _cosineSimilarity(a, b) {
        if (!a?.length || !b?.length || a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
    }

    /**
     * Generate embedding for text.
     * @private
     */
    async _generateEmbedding(text) {
        try {
            const result = await this.embeddings.embedQuery(text);
            return result;
        } catch (error) {
            console.error("[MemoryStore] Embedding error:", error.message);
            return [];
        }
    }

    // ── Hydration ──

    /**
     * @private
     */
    _hydrateMemory(row) {
        const base = {
            id: row.id,
            type: row.type,
            content: row.content,
            importance: row.importance,
            lastAccessed: row.last_accessed,
            accessCount: row.access_count,
            source: JSON.parse(row.source),
            relatedProfileIds: JSON.parse(row.related_profile_ids || "[]"),
            relatedBranchIds: JSON.parse(row.related_branch_ids || "[]"),
            tags: JSON.parse(row.tags || "[]"),
            embedding: JSON.parse(row.embedding || "[]"),
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            status: row.status,
        };

        // Unpack type-specific data
        if (row.extra_data) {
            const extra = JSON.parse(row.extra_data);
            if (extra.episodeData) base.episodeData = extra.episodeData;
            if (extra.factData) base.factData = extra.factData;
            if (extra.procedureData) base.procedureData = extra.procedureData;
        }

        return base;
    }

    /**
     * Pack type-specific data for storage.
     * @private
     */
    _packExtraData(memory) {
        const extra = {};
        if (memory.episodeData) extra.episodeData = memory.episodeData;
        if (memory.factData) extra.factData = memory.factData;
        if (memory.procedureData) extra.procedureData = memory.procedureData;
        return Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
    }

    close() {
        this.db.close();
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared MemoryStore instance.
 * @param {string} [dbPath]
 * @returns {MemoryStore}
 */
export function getMemoryStore(dbPath) {
    if (!_instance) {
        _instance = new MemoryStore(dbPath);
    }
    return _instance;
}
