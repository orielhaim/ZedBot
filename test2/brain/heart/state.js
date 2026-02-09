// ============================================================
//  Heart State — Emotional state tracking
//
//  Tracks mood (slow-moving baseline) and reactions (quick emotions)
//  Influences response tone, decision making, and behavior
// ============================================================

import Database from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";

const DEFAULT_DB_PATH = "./data/zed-brain.db";

/**
 * @typedef {'cheerful' | 'neutral' | 'thoughtful' | 'irritable' | 'curious' | 'focused' | 'tired' | 'energized'} Mood
 */

/**
 * @typedef {Object} EmotionalState
 * @property {Mood} mood - Current baseline mood
 * @property {number} moodIntensity - 0-1 intensity of the mood
 * @property {number} moodUpdatedAt - Last mood update timestamp
 * @property {Object[]} recentReactions - Quick emotional reactions
 * @property {number} energy - 0-1 energy level (affects proactivity)
 */

/**
 * @typedef {Object} MoodEvent
 * @property {string} id
 * @property {Mood} mood
 * @property {number} intensity
 * @property {string} trigger - What caused this mood
 * @property {number} timestamp
 */

export class HeartState {
    /** @type {Database} */
    db;

    /** @type {EmotionalState} */
    currentState;

    /**
     * @param {string} [dbPath]
     */
    constructor(dbPath = DEFAULT_DB_PATH) {
        this.db = new Database(dbPath, { create: true });
        this.db.exec("PRAGMA journal_mode = WAL;");
        this._initSchema();
        this._loadCurrentState();
    }

    _initSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS heart_state (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        mood TEXT NOT NULL DEFAULT 'neutral',
        mood_intensity REAL NOT NULL DEFAULT 0.5,
        mood_updated_at INTEGER NOT NULL,
        energy REAL NOT NULL DEFAULT 0.7
      );

      CREATE TABLE IF NOT EXISTS mood_history (
        id TEXT PRIMARY KEY,
        mood TEXT NOT NULL,
        intensity REAL NOT NULL,
        trigger TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reactions (
        id TEXT PRIMARY KEY,
        emotion TEXT NOT NULL,
        intensity REAL NOT NULL,
        trigger TEXT NOT NULL,
        profile_id TEXT,
        timestamp INTEGER NOT NULL,
        decayed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_mood_history_timestamp ON mood_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_reactions_timestamp ON reactions(timestamp);
    `);

        // Ensure singleton row exists
        const existing = this.db.query("SELECT id FROM heart_state WHERE id = 'singleton'").get();
        if (!existing) {
            this.db.run(
                "INSERT INTO heart_state (id, mood, mood_intensity, mood_updated_at, energy) VALUES (?, ?, ?, ?, ?)",
                ["singleton", "neutral", 0.5, Date.now(), 0.7]
            );
        }
    }

    _loadCurrentState() {
        const row = this.db.query(`
      SELECT mood, mood_intensity, mood_updated_at, energy
      FROM heart_state WHERE id = 'singleton'
    `).get();

        const recentReactions = this.db.query(`
      SELECT emotion, intensity, trigger, profile_id, timestamp
      FROM reactions
      WHERE decayed_at IS NULL AND timestamp > ?
      ORDER BY timestamp DESC LIMIT 10
    `).all([Date.now() - 3600000]); // Last hour

        this.currentState = {
            mood: row.mood,
            moodIntensity: row.mood_intensity,
            moodUpdatedAt: row.mood_updated_at,
            recentReactions,
            energy: row.energy,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────

    /**
     * Get current emotional state
     * @returns {EmotionalState}
     */
    getState() {
        this._loadCurrentState();
        return this.currentState;
    }

    /**
     * Update the baseline mood
     * @param {Mood} mood
     * @param {number} intensity - 0-1
     * @param {string} [trigger] - What caused this mood change
     */
    setMood(mood, intensity, trigger = "organic") {
        const now = Date.now();

        // Update current state
        this.db.run(
            "UPDATE heart_state SET mood = ?, mood_intensity = ?, mood_updated_at = ? WHERE id = 'singleton'",
            [mood, intensity, now]
        );

        // Record in history
        this.db.run(
            "INSERT INTO mood_history (id, mood, intensity, trigger, timestamp) VALUES (?, ?, ?, ?, ?)",
            [uuidv4(), mood, intensity, trigger, now]
        );

        this._loadCurrentState();
        console.log(`[Heart] Mood → ${mood} (${(intensity * 100).toFixed(0)}%) triggered by: ${trigger}`);
    }

    /**
     * Record a quick emotional reaction
     * @param {string} emotion - e.g., "surprised", "pleased", "frustrated"
     * @param {number} intensity - 0-1
     * @param {string} trigger - What caused this reaction
     * @param {string} [profileId] - Who triggered it
     */
    addReaction(emotion, intensity, trigger, profileId = null) {
        this.db.run(
            "INSERT INTO reactions (id, emotion, intensity, trigger, profile_id, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
            [uuidv4(), emotion, intensity, trigger, profileId, Date.now()]
        );

        console.log(`[Heart] Reaction: ${emotion} (${(intensity * 100).toFixed(0)}%) — ${trigger}`);
    }

    /**
     * Update energy level
     * @param {number} delta - Change in energy (-1 to 1)
     * @param {string} [reason]
     */
    adjustEnergy(delta, reason = "activity") {
        const current = this.currentState.energy;
        const newEnergy = Math.max(0, Math.min(1, current + delta));

        this.db.run(
            "UPDATE heart_state SET energy = ? WHERE id = 'singleton'",
            [newEnergy]
        );

        this._loadCurrentState();
        console.log(`[Heart] Energy ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(0)}% → ${(newEnergy * 100).toFixed(0)}% (${reason})`);
    }

    /**
     * Decay old reactions (called periodically)
     */
    decayReactions() {
        const cutoff = Date.now() - 3600000; // 1 hour
        this.db.run(
            "UPDATE reactions SET decayed_at = ? WHERE decayed_at IS NULL AND timestamp < ?",
            [Date.now(), cutoff]
        );
    }

    /**
     * Get mood influence on behavior
     * @returns {{ responseTendency: number, proactivityBoost: number, patienceLevel: number }}
     */
    getMoodInfluence() {
        const { mood, moodIntensity, energy } = this.currentState;

        // These modifiers affect behavior
        const modifiers = {
            cheerful: { responseTendency: 1.2, proactivityBoost: 0.3, patienceLevel: 1.2 },
            neutral: { responseTendency: 1.0, proactivityBoost: 0, patienceLevel: 1.0 },
            thoughtful: { responseTendency: 0.9, proactivityBoost: 0.1, patienceLevel: 1.1 },
            irritable: { responseTendency: 0.7, proactivityBoost: -0.2, patienceLevel: 0.6 },
            curious: { responseTendency: 1.1, proactivityBoost: 0.4, patienceLevel: 1.0 },
            focused: { responseTendency: 0.8, proactivityBoost: 0.2, patienceLevel: 0.9 },
            tired: { responseTendency: 0.6, proactivityBoost: -0.4, patienceLevel: 0.7 },
            energized: { responseTendency: 1.3, proactivityBoost: 0.5, patienceLevel: 1.0 },
        };

        const base = modifiers[mood] || modifiers.neutral;

        return {
            responseTendency: base.responseTendency * moodIntensity + (1 - moodIntensity),
            proactivityBoost: base.proactivityBoost * moodIntensity * energy,
            patienceLevel: base.patienceLevel * moodIntensity + (1 - moodIntensity),
        };
    }

    /**
     * Get a text summary for context injection
     * @returns {string}
     */
    getContextSummary() {
        const { mood, moodIntensity, energy, recentReactions } = this.currentState;

        let summary = `Current mood: ${mood}`;
        if (moodIntensity > 0.7) summary += ` (strongly)`;
        if (energy < 0.3) summary += `. Feeling low energy.`;
        else if (energy > 0.8) summary += `. Feeling energized.`;

        if (recentReactions.length > 0) {
            const latest = recentReactions[0];
            summary += ` Recent: felt ${latest.emotion} about "${latest.trigger}".`;
        }

        return summary;
    }
}

// ─────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────

/** @type {HeartState|null} */
let instance = null;

export function getHeartState() {
    if (!instance) {
        instance = new HeartState();
    }
    return instance;
}
