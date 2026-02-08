# Brain - Memory System

## 1. The Problem

An LLM has no memory. Every call starts from zero. The context window is the only "memory" a model has, and it's finite and expensive. Zed's entire claim to being a persistent entity depends on a memory system that overcomes this limitation convincingly.

The goal is not "keyword search over past messages." The goal is human-like memory: rich, contextual, associative, prioritized, and imperfect. Zed should remember important things vividly, recall relevant details when they matter, and gradually forget what doesn't matter - just like a person.

## 2. Memory Tiers

### 2.1 Working Memory
**What it is:** The active context for the current reasoning step. This is what the model actually sees in its context window.

**Characteristics:** Small (bounded by context window size), temporary (rebuilt for each reasoning step), curated (the Context Builder assembles it intentionally).

**Contains:** The current conversation's recent messages, relevant retrieved memories, the active person's profile summary, personality/values directives from the Heart, and any active task/goal context from the Inner Layer.

Working memory is not stored anywhere - it is assembled fresh for each model invocation by the Context Builder. It is the most important architectural chokepoint in the entire system: what goes into working memory determines the quality of every output.

### 2.2 Short-Term Buffer (Today's Memory)
**What it is:** A running log of everything that happened during the current "day" (or current active period). Raw, detailed, mostly unprocessed.

**Characteristics:** Medium-sized, temporary (consolidated at end of day), complete (captures everything, no filtering yet).

**Purpose:** This is Zed's "what happened today" recall. If someone asks "what did we talk about this morning?" the short-term buffer has the answer with full fidelity. It's also the input for the consolidation process that produces long-term memories.

**Analogy:** A person at 11pm can recall their entire day in detail - who they talked to, what was said, what they ate, where they went. By next week, most of that has faded, and only the important moments survive in long-term memory. The short-term buffer is that end-of-day vivid recall.

### 2.3 Episodic Memory (Experiences)
**What it is:** Records of past events, conversations, and experiences. Each episode is a structured record: who was involved, what happened, when, where (which channel), and - critically - why it mattered.

**Characteristics:** Long-term, selectively stored, scored by importance, retrievable by multiple dimensions (time, person, topic, emotion, importance).

**How it's created:** Through consolidation. The consolidation process reviews the short-term buffer and extracts episodes worth remembering. Not everything becomes an episode - only events that are notable, emotionally significant, novel, or relevant to ongoing goals.

**Examples:**
- "The owner told me they bought a new car on 2025-03-15. They were excited. It's a red Tesla Model 3." (High importance - major life event of the owner.)
- "Had a conversation with user_42 about their vacation plans. They're going to Japan in April." (Medium importance - notable personal info about a known contact.)
- "User_99 asked me what 2+2 is. I answered 4." (Low importance - trivial interaction, might not even be stored.)

### 2.4 Semantic Memory (Facts & Knowledge)
**What it is:** General knowledge, facts, and stable truths that are not tied to a specific episode. Extracted from conversations, from Zed's own research, and from explicit teaching.

**Characteristics:** Long-term, structured or semi-structured, updateable (facts can change), not time-bound.

**Examples:**
- "The owner's name is Daniel. Their birthday is March 5th."
- "Python is a programming language."
- "User_42 prefers being addressed formally."
- "The WhatsApp API has a 24-hour session window for messages."

Semantic memory is the knowledge base. It's what Zed "knows" as opposed to what Zed "experienced."

### 2.5 Procedural Memory (Skills & Methods)
**What it is:** Learned skills, procedures, workflows, and methods. How to do things.

**Characteristics:** Long-term, versioned (skills improve over time), executable (these are actionable instructions, not just knowledge).

**Examples:**
- "How to search the web effectively: use specific keywords, check multiple sources, verify dates."
- "How to handle an angry user: acknowledge their frustration, don't be defensive, offer concrete help."
- "How to deploy a code change: run tests first, commit to a branch, create a pull request."

Procedural memories are Zed's playbooks. They grow as Zed learns new skills and refines existing ones. The Learning Loop (Inner Layer) is responsible for creating and updating procedural memories.

## 3. Consolidation - From Short-Term to Long-Term

Consolidation is the process that transforms raw short-term buffer data into structured long-term memories. It is inspired by how human memory works during sleep: the brain replays the day's events, extracts what matters, and stores it in long-term memory while letting the rest fade.

### 3.1 When Does It Run?
On a schedule - at "end of day" (configurable), or when the short-term buffer reaches a size threshold. Also triggered on demand by the Inner Layer if it decides a notable event just happened and should be stored immediately.

### 3.2 What Does It Do?
1. **Review:** Scans the short-term buffer for the period being consolidated.
2. **Extract episodes:** Identifies distinct events, conversations, and moments worth remembering. For each, it records what happened, who was involved, the emotional tone, and an importance score.
3. **Extract facts:** Identifies new factual information learned during the period. Creates or updates semantic memory entries.
4. **Extract skills:** If Zed learned something new (a new tool, a better approach to a task), creates or updates procedural memory.
5. **Summarize:** Creates a high-level summary of the period ("Today I talked to 5 people, helped the owner debug a script, learned about a new API, and had an argument with user_99 who was rude.").
6. **Clear:** Marks the consolidated portion of the short-term buffer as processed. The raw data can be archived (for safety) or discarded.

### 3.3 Importance Scoring
Not all memories are equal. The consolidation process assigns an importance score based on multiple factors:
- **Who was involved:** Events involving the owner or trusted people score higher.
- **Novelty:** First-time events score higher than routine ones.
- **Emotional intensity:** Events with strong emotional valence (excitement, conflict, surprise) score higher.
- **Goal relevance:** Events related to Zed's active goals score higher.
- **Explicit markers:** If someone says "remember this" or "this is important," the score gets a boost.

## 4. Retrieval - Getting the Right Memories at the Right Time

Retrieval is the art of surfacing the right memories at the right moment. This is the hardest problem in the memory system.

### 4.1 The Retrieval Score
Inspired by the Stanford "Generative Agents" paper (Park et al., 2023), every memory's retrieval score is a weighted combination of three factors:

**Recency:** How recently was this memory created or last accessed? Recent memories score higher. Implemented as exponential decay. Memories that are accessed get their recency refreshed (just like humans - recalling a memory strengthens it).

**Importance:** The importance score assigned during consolidation. A memory about the owner's wedding scores higher than a memory about a trivial question.

**Relevance:** Semantic similarity between the current context (the query, the conversation, the thought) and the memory's content. Computed via embedding similarity.

The final retrieval score is a weighted sum: `score = α·recency + β·importance + γ·relevance`. The weights are tunable and can be adjusted per-situation (e.g., when answering a direct question, relevance weight is higher; when reflecting on the day, recency weight is higher).

### 4.2 The "Memory Pop" Problem
Zed should not only retrieve memories when explicitly asked. It should have memories "pop up" naturally during conversation, the way a person might say "that reminds me of when..." This is the associative recall problem.

**Approach: Ambient Retrieval.** During every reasoning step - not just when a direct question is asked - the Context Builder runs a lightweight retrieval pass against the current conversation context. If a memory scores above a threshold, it is included in the working memory for that step. The model then has the opportunity to reference it naturally, or ignore it if it's not relevant.

This means the model sees potentially relevant memories even when it didn't ask for them. If the conversation is about cars and Zed has a vivid episodic memory about the owner buying a car, that memory will pop up in the context, and the model can naturally weave it in: "Oh, this reminds me of when you got your Tesla!"

**Cost management:** Ambient retrieval runs on every reasoning step, so it must be fast and lightweight. The retrieval is done against a pre-embedded memory index, not through a full LLM call. Only the top-N highest scoring memories are included. N is small (3-5 typically) to avoid overwhelming the context window.

### 4.3 Hierarchical Retrieval
As the memory store grows, flat retrieval degrades. The system uses a hierarchical approach:
1. **First pass - Category routing:** Determine the broad domain of the current context (person, topic, time period). This narrows the search space.
2. **Second pass - Embedding search:** Within the narrowed space, run semantic similarity search.
3. **Third pass - Scoring:** Apply the recency/importance/relevance formula to rank results.
4. **Selection:** Take the top-N results for inclusion in working memory.

## 5. Context Window Management

The context window is finite. It is the single hardest constraint the Brain operates under. Every token matters.

### 5.1 The Context Builder's Job
Before every model invocation, the Context Builder must assemble a context that fits within the model's window while including everything the model needs to produce a good output. This is a packing problem.

**Fixed allocations (always included):**
- Heart directives (personality, values, tone). Compact but essential. This is who Zed is.
- Current conversation's recent messages (the last N messages, enough to maintain conversational flow).
- The active person's profile summary (who they are, their role, key facts).

**Dynamic allocations (included based on need and space):**
- Retrieved memories (from ambient retrieval). More relevant = higher priority for inclusion.
- Cross-branch awareness summary (what else is happening in other conversations - compact).
- Inner layer state summary (what Zed is currently thinking about / working on - compact).
- Active task/goal context (if Zed is in the middle of a multi-step task).

### 5.2 Conversation Continuity for Long Conversations
This is the problem you raised: long conversations where the context window can't hold everything.

**Strategy: Progressive Summarization.**
- The full conversation is always stored (in the short-term buffer and eventually in episodic memory).
- When the conversation exceeds a threshold length, older portions are summarized. The summary replaces the raw messages in the working memory context.
- The summarization is done by a separate, dedicated model call (can use a cheaper/faster model). The summary preserves key facts, decisions, emotional beats, and important details, while compressing filler.
- The summary is hierarchical: very old portions get a high-level summary, recent portions get a detailed summary, and the most recent messages are included verbatim.
- If the person references something specific from earlier in the conversation that the summary doesn't cover, the system can retrieve the original messages from the buffer/episodic memory and inject them into the next context. This is "on-demand recall" - like a person saying "wait, what was that thing you said earlier?" and concentrating to remember.

**Result:** The conversation can be infinitely long. Zed never "forgets" what happened in it. But the active working memory is always within the context window, consisting of a compressed history plus recent verbatim messages plus any specifically recalled details.

### 5.3 The Detail Preservation Problem
I don't want Zed to "start shortening and losing data." This is a real risk with summarization. The mitigation is:
- **Summarization is additive, not destructive.** The raw data is always preserved. Summaries are a view, not a replacement.
- **The consolidation process is quality-focused.** When moving from short-term to long-term memory, specific details (names, dates, numbers, commitments, emotional moments) are explicitly preserved as episodic or semantic entries. These survive summarization because they're stored as discrete memories, not as part of a conversation blob.
- **On-demand recall** (described above) means that if a detail is needed that was lost in summarization, it can be recovered from the raw store.

The principle: **store everything, present intelligently.** The context window is a display window, not a storage system.

## 6. Forgetting

A system that never forgets is a system drowning in noise. Forgetting is a feature.

### 6.1 What Fades
- Low-importance episodic memories lose their retrieval score over time (recency decay). They don't get deleted - they just become very unlikely to be retrieved.
- Trivial interactions that were never consolidated (because the consolidation process deemed them unimportant) are dropped when the short-term buffer is cleared.
- Semantic memories that are contradicted by newer information are updated (the old version is archived, the new version becomes active).

### 6.2 What Never Fades
- Memories marked as high-importance by the consolidation process.
- Memories that are frequently accessed (recency gets refreshed on access, creating reinforcement).
- Memories explicitly flagged as permanent ("remember this forever").
- Core identity information (the Heart's configuration, the owner's identity, fundamental facts about Zed's existence).

### 6.3 Reinforcement
Accessing a memory strengthens it. This creates a natural dynamic: important memories that keep being relevant get accessed frequently, which keeps them strong. Unimportant memories that are never accessed fade naturally. This mirrors the psychological concept of spaced repetition.
