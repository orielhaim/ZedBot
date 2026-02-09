// ============================================================
//  Memory — cross-thread memory using LangGraph MemoryStore
//  Stores: skill usage patterns, user preferences, facts
// ============================================================

import { InMemoryStore } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";

// Single shared store instance
export const memoryStore = new InMemoryStore();

// ── Namespaces ──
const NS_SKILL_USAGE = "skill_usage";       // which skills worked for which queries
const NS_USER_PREFS  = "user_preferences";  // learned user preferences
const NS_FACTS       = "facts";             // extracted facts about the user

/**
 * Record that a skill was used successfully for a particular
 * type of request. This builds a "shortcut" cache.
 */
export async function recordSkillUsage(userId, skillName, queryPattern) {
  const namespace = [userId, NS_SKILL_USAGE];
  await memoryStore.put(namespace, uuidv4(), {
    skill: skillName,
    pattern: queryPattern,
    usedAt: new Date().toISOString(),
  });
}

/**
 * Find skills that have been useful for similar requests in the past.
 * Returns skill names that were previously successful.
 */
export async function findPastSkillUsage(userId, limit = 10) {
  const namespace = [userId, NS_SKILL_USAGE];
  const results = await memoryStore.search(namespace, { limit });
  return results.map((r) => r.value);
}

/**
 * Save a user preference.
 */
export async function saveUserPref(userId, key, value) {
  const namespace = [userId, NS_USER_PREFS];
  // Use the key as the memory ID so it gets overwritten on update
  await memoryStore.put(namespace, key, { value, updatedAt: new Date().toISOString() });
}

/**
 * Get all user preferences.
 */
export async function getUserPrefs(userId) {
  const namespace = [userId, NS_USER_PREFS];
  const results = await memoryStore.search(namespace);
  const prefs = {};
  for (const r of results) {
    prefs[r.key] = r.value.value;
  }
  return prefs;
}

/**
 * Save a fact about the user.
 */
export async function saveFact(userId, fact) {
  const namespace = [userId, NS_FACTS];
  await memoryStore.put(namespace, uuidv4(), {
    fact,
    savedAt: new Date().toISOString(),
  });
}

/**
 * Retrieve known facts about the user.
 */
export async function getFacts(userId, limit = 20) {
  const namespace = [userId, NS_FACTS];
  const results = await memoryStore.search(namespace, { limit });
  return results.map((r) => r.value.fact);
}
