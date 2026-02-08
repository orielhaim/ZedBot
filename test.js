// ============================================================
//  Embeddings Debug Test
//  Run: bun run test-embeddings.js
//
//  Tests your LM Studio embeddings endpoint directly
//  to find out exactly what works and what doesn't.
// ============================================================

// ── CONFIG — change these to match your setup ─────────────
const LM_STUDIO_URL = "http://localhost:1234";
const MODEL_NAME = "text-embedding-gemma-300m";  // ← your model name in LM Studio
// ──────────────────────────────────────────────────────────

const TEST_TEXTS = [
  "Search the web for real-time information and news",
  "Perform mathematical calculations and data analysis",
  "What is the weather in Tokyo?",
];

function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function inspectVector(label, vec) {
  console.log(`\n  ${label}:`);
  console.log(`    type: ${typeof vec}`);
  console.log(`    isArray: ${Array.isArray(vec)}`);
  console.log(`    constructor: ${vec?.constructor?.name}`);
  console.log(`    length: ${vec?.length}`);

  if (Array.isArray(vec) || ArrayBuffer.isView(vec)) {
    const arr = Array.from(vec);
    const nonZero = arr.filter((v) => v !== 0).length;
    const hasNaN = arr.some((v) => isNaN(v));
    console.log(`    first 10: [${arr.slice(0, 10).map((v) => v.toFixed(6)).join(", ")}]`);
    console.log(`    non-zero values: ${nonZero}/${arr.length}`);
    console.log(`    has NaN: ${hasNaN}`);
    console.log(`    min: ${Math.min(...arr).toFixed(6)}, max: ${Math.max(...arr).toFixed(6)}`);
  } else if (vec && typeof vec === "object") {
    console.log(`    keys: ${Object.keys(vec).slice(0, 20).join(", ")}`);
    console.log(`    JSON preview: ${JSON.stringify(vec).slice(0, 200)}`);
  }
}

// ── TEST 1: Direct fetch to LM Studio API ─────────────────
async function testDirectFetch() {
  console.log("\n" + "═".repeat(60));
  console.log("  TEST 1: Direct fetch to LM Studio /v1/embeddings");
  console.log("═".repeat(60));

  try {
    const response = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: TEST_TEXTS[0],
      }),
    });

    console.log(`\n  Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log(`  Response keys: ${Object.keys(data).join(", ")}`);
    console.log(`  Model: ${data.model}`);
    console.log(`  Data length: ${data.data?.length}`);

    if (data.data?.[0]) {
      const emb = data.data[0];
      console.log(`  data[0] keys: ${Object.keys(emb).join(", ")}`);
      console.log(`  data[0].embedding type: ${typeof emb.embedding}`);
      console.log(`  data[0].embedding length: ${emb.embedding?.length}`);
      
      if (emb.embedding) {
        inspectVector("data[0].embedding", emb.embedding);
      }
    }

    // Test batch
    console.log("\n  --- Batch test (2 inputs) ---");
    const batchResponse = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: [TEST_TEXTS[0], TEST_TEXTS[1]],
      }),
    });

    const batchData = await batchResponse.json();
    console.log(`  Batch data length: ${batchData.data?.length}`);
    if (batchData.data?.length >= 2) {
      inspectVector("batch[0]", batchData.data[0].embedding);
      inspectVector("batch[1]", batchData.data[1].embedding);

      const sim = cosineSim(batchData.data[0].embedding, batchData.data[1].embedding);
      console.log(`\n  Cosine similarity between text 0 and 1: ${sim.toFixed(6)}`);
    }

    return true;
  } catch (err) {
    console.error(`\n  ❌ Error: ${err.message}`);
    return false;
  }
}

// ── TEST 2: OpenAIEmbeddings with custom baseURL ──────────
async function testOpenAIEmbeddings() {
  console.log("\n" + "═".repeat(60));
  console.log("  TEST 2: @langchain/openai OpenAIEmbeddings → LM Studio");
  console.log("═".repeat(60));

  try {
    const { OpenAIEmbeddings } = await import("@langchain/openai");

    const embeddings = new OpenAIEmbeddings({
      model: MODEL_NAME,
      encodingFormat: "float",
      configuration: {
        baseURL: `${LM_STUDIO_URL}/v1`,
      },
      apiKey: "lm-studio", // LM Studio doesn't need a real key
    });

    console.log("\n  embedQuery...");
    const queryVec = await embeddings.embedQuery(TEST_TEXTS[0]);
    inspectVector("embedQuery result", queryVec);

    console.log("\n  embedDocuments...");
    const docVecs = await embeddings.embedDocuments([TEST_TEXTS[0], TEST_TEXTS[1]]);
    console.log(`  embedDocuments returned: length=${docVecs?.length}`);
    if (docVecs?.length > 0) {
      inspectVector("embedDocuments[0]", docVecs[0]);
    }

    if (docVecs?.length >= 2) {
      const sim = cosineSim(docVecs[0], docVecs[1]);
      console.log(`\n  Cosine sim [0] vs [1]: ${sim.toFixed(6)}`);
    }

    return true;
  } catch (err) {
    console.error(`\n  ❌ Error: ${err.message}`);
    if (err.stack) console.error(`  ${err.stack.split("\n").slice(1, 4).join("\n  ")}`);
    return false;
  }
}

// ── TEST 3: OllamaEmbeddings ──────────────────────────────
async function testOllamaEmbeddings() {
  console.log("\n" + "═".repeat(60));
  console.log("  TEST 3: @langchain/ollama OllamaEmbeddings → LM Studio");
  console.log("═".repeat(60));

  try {
    const { OllamaEmbeddings } = await import("@langchain/ollama");

    const embeddings = new OllamaEmbeddings({
      model: MODEL_NAME,
      baseUrl: LM_STUDIO_URL,
    });

    console.log("\n  embedQuery...");
    const queryVec = await embeddings.embedQuery(TEST_TEXTS[0]);
    inspectVector("embedQuery result", queryVec);

    console.log("\n  embedDocuments...");
    const docVecs = await embeddings.embedDocuments([TEST_TEXTS[0], TEST_TEXTS[1]]);
    console.log(`  embedDocuments returned: length=${docVecs?.length}`);
    if (docVecs?.length > 0) {
      inspectVector("embedDocuments[0]", docVecs[0]);
    }

    return true;
  } catch (err) {
    console.error(`\n  ❌ Error: ${err.message}`);
    return false;
  }
}

// ── TEST 4: Similarity sanity check ───────────────────────
async function testSimilarity() {
  console.log("\n" + "═".repeat(60));
  console.log("  TEST 4: Similarity sanity check (direct fetch)");
  console.log("═".repeat(60));

  try {
    const vecs = [];
    for (const text of TEST_TEXTS) {
      const res = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL_NAME, input: text }),
      });
      const data = await res.json();
      vecs.push(data.data[0].embedding);
    }

    console.log("\n  Texts:");
    TEST_TEXTS.forEach((t, i) => console.log(`    [${i}] "${t}"`));

    console.log("\n  Similarity matrix:");
    for (let i = 0; i < vecs.length; i++) {
      const row = [];
      for (let j = 0; j < vecs.length; j++) {
        row.push(cosineSim(vecs[i], vecs[j]).toFixed(4));
      }
      console.log(`    [${i}] ${row.join("  ")}`);
    }

    const allZero = vecs.every((v) => v.every((x) => x === 0));
    if (allZero) {
      console.log("\n  🚨 ALL VECTORS ARE ZEROS!");
      console.log("  This means the embeddings model is not working.");
      console.log("  Possible causes:");
      console.log("    1. Model not loaded in LM Studio");
      console.log("    2. Wrong model name (check LM Studio UI)");
      console.log("    3. LM Studio doesn't support embeddings for this model");
      console.log("    4. Model needs different input format");
      console.log(`\n  Current model: "${MODEL_NAME}"`);
      console.log(`  Current URL: "${LM_STUDIO_URL}"`);
      console.log("\n  Try:");
      console.log("    - Open LM Studio → check which model is loaded");
      console.log("    - Go to Developer tab → check the model identifier");
      console.log("    - Try a different embedding model");
    }

    return true;
  } catch (err) {
    console.error(`\n  ❌ Error: ${err.message}`);
    return false;
  }
}

// ── RUN ALL TESTS ─────────────────────────────────────────
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  EMBEDDINGS DEBUG TEST                                    ║
║  LM Studio URL: ${LM_STUDIO_URL.padEnd(40)}║
║  Model: ${MODEL_NAME.padEnd(49)}║
╚═══════════════════════════════════════════════════════════╝`);

  await testDirectFetch();
  await testOpenAIEmbeddings();
  await testOllamaEmbeddings();
  await testSimilarity();

  console.log("\n" + "═".repeat(60));
  console.log("  DONE — check output above for the working method.");
  console.log("═".repeat(60) + "\n");
}

main();
