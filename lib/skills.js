// ============================================================
//  Skill index — vector-based semantic search using OpenAI
//  embeddings. Loads skills from disk, embeds on first use,
//  caches in memory.
// ============================================================

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import { embeddingModel } from "./models.js";

// ── Internal state ────────────────────────────────────────
let _skills = null;    // [{ name, description, content }]
let _vectors = null;   // [Float64Array] — one per skill
let _ready = false;

// ── Load raw skill files from disk ────────────────────────
function loadFromDisk(skillsDir = "./skills") {
  const skills = [];
  if (!existsSync(skillsDir)) return skills;

  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const path = join(skillsDir, dir.name, "SKILL.md");
    if (!existsSync(path)) continue;

    const raw = readFileSync(path, "utf-8");
    const { data, content } = matter(raw);

    skills.push({
      name: data.name,
      description: data.description,
      content: content.trim(),
    });
  }

  return skills;
}

function normalizeVector(vec) {
  // If it's a typed array (Float32Array, Float64Array), convert
  if (ArrayBuffer.isView(vec)) {
    return Array.from(vec);
  }

  // If it's a regular array, ensure all elements are numbers
  if (Array.isArray(vec)) {
    // Check if first element is also an array (double nested)
    if (vec.length > 0 && Array.isArray(vec[0])) {
      return vec[0].map(Number);
    }
    return vec.map(Number);
  }

  // If it's an object with an embedding property
  if (vec && typeof vec === "object") {
    if (vec.embedding) return normalizeVector(vec.embedding);
    if (vec.values) return normalizeVector(vec.values);
    if (vec.data) return normalizeVector(vec.data);
  }

  console.error("  ⚠️ Unknown vector format:", typeof vec, vec?.constructor?.name);
  return null;
}

// ── Cosine similarity ─────────────────────────────────────
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    if (typeof va !== "number" || typeof vb !== "number" || isNaN(va) || isNaN(vb)) {
      return 0;
    }
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function ensureReady(skillsDir = "./skills") {
  if (_ready) return;

  if (!embeddingModel) {
    throw new Error("No embeddings model. Call setEmbeddingsModel() first.");
  }

  _skills = loadFromDisk(skillsDir);

  if (_skills.length === 0) {
    _vectors = [];
    _ready = true;
    return;
  }

  const texts = _skills.map((s) => {
    const firstLine = s.content.split("\n").find((l) => l.trim()) || "";
    return `${s.name}. ${s.description}. ${firstLine}`;
  });

  console.log(`  🔤 Embedding ${texts.length} skills...`);
  for (const t of texts) {
    console.log(`     → "${t.slice(0, 80)}..."`);
  }

  const rawVectors = await embeddingModel.embedDocuments(texts);

  // ── Debug: inspect what we got back ──
  console.log(`  🔬 embedDocuments returned: ${typeof rawVectors}, isArray: ${Array.isArray(rawVectors)}, length: ${rawVectors?.length}`);
  if (rawVectors?.length > 0) {
    const first = rawVectors[0];
    console.log(`  🔬 first element: type=${typeof first}, isArray=${Array.isArray(first)}, constructor=${first?.constructor?.name}, length=${first?.length}`);
    if (Array.isArray(first) || ArrayBuffer.isView(first)) {
      console.log(`  🔬 first[0..4]: [${Array.from(first).slice(0, 5).join(", ")}]`);
    } else if (first && typeof first === "object") {
      console.log(`  🔬 first keys: ${Object.keys(first).join(", ")}`);
    }
  }

  // Normalize all vectors
  _vectors = rawVectors.map((v, i) => {
    const normalized = normalizeVector(v);
    if (!normalized) {
      console.error(`  ❌ Failed to normalize vector ${i}`);
      return [];
    }
    return normalized;
  });

  const dim = _vectors[0]?.length || 0;
  console.log(`  ✅ Skill index ready (${_skills.length} skills, ${dim}d vectors)`);

  // Verify first vector has valid numbers
  if (dim > 0) {
    const sample = _vectors[0].slice(0, 3);
    const allNumbers = sample.every((v) => typeof v === "number" && !isNaN(v));
    console.log(`  🔬 Vector sanity check: [${sample.join(", ")}] allNumbers=${allNumbers}`);
  }

  _ready = true;
}

// ── Public API ────────────────────────────────────────────

export async function searchSkills(query, { topK = 10 } = {}) {
  await ensureReady();
  if (_skills.length === 0) return [];

  const rawQueryVec = await embeddingModel.embedQuery(query);

  // ── Debug query vector ──
  console.log(`  🔬 embedQuery returned: type=${typeof rawQueryVec}, isArray=${Array.isArray(rawQueryVec)}, length=${rawQueryVec?.length}`);
  if (rawQueryVec?.length > 0 && (Array.isArray(rawQueryVec) || ArrayBuffer.isView(rawQueryVec))) {
    console.log(`  🔬 query[0..4]: [${Array.from(rawQueryVec).slice(0, 5).join(", ")}]`);
  }

  const queryVec = normalizeVector(rawQueryVec);
  if (!queryVec) {
    console.error("  ❌ Failed to normalize query vector");
    return [];
  }

  const scored = _skills.map((skill, i) => ({
    name: skill.name,
    description: skill.description,
    score: cosineSim(queryVec, _vectors[i]),
  }));

  scored.sort((a, b) => b.score - a.score);

  console.log(`  🔍 Search: "${query}"`);
  for (const s of scored) {
    console.log(`     ${s.score.toFixed(4)} — ${s.name}: ${s.description.slice(0, 60)}`);
  }

  return scored.slice(0, topK);
}

export function getSkill(name) {
  if (!_skills) _skills = loadFromDisk();
  return _skills.find(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  ) || null;
}

/**
 * List all skills (name + description).
 */
export function listSkills() {
  if (!_skills) _skills = loadFromDisk();
  return _skills.map((s) => ({ name: s.name, description: s.description }));
}

/**
 * Pre-warm the index (call at startup so first search is fast).
 */
export async function warmup(skillsDir = "./skills") {
  await ensureReady(skillsDir);
}
