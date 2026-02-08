# Model Center - Capabilities & Routing

## 1. Capability Types

Models are not interchangeable. A vision model cannot generate speech. A fast chat model is not the best choice for deep mathematical reasoning. The Model Center organizes models by capability - what they can do - and by profile - how well they do it.

### 1.1 Core Capability Types

**Text Generation** - The foundational capability. Given a prompt (system message, conversation history, instructions), generate text. This is what powers the Brain's reasoning, conversation, planning, and reflection.

**Vision** - Given an image (and optionally a text prompt), analyze and describe what's in it. Used by the Body for desktop control (screenshot analysis), camera feeds, document understanding, and any task that requires seeing.

**Embeddings** - Given text, produce a vector representation. The backbone of the Memory System's semantic search. Also used for similarity comparison, clustering, and retrieval scoring.

**Speech-to-Text (STT)** - Given audio, produce a text transcription. Used when Zed receives voice messages or audio input through the Gateway.

**Text-to-Speech (TTS)** - Given text, produce audio. Used when Zed wants to respond with voice, or when interacting through audio-capable channels.

**Image Generation** - Given a text prompt, generate an image. Used for creative tasks, visual communication, or when Zed wants to create visual content.

**Video Generation** - Given a text prompt (and optionally a reference image), generate video. Emerging capability, available through some providers.

**Reranking** - Given a query and a set of candidate documents, reorder them by relevance. Used to improve memory retrieval precision.

**Code Generation** - Technically a subset of text generation, but some models are specifically optimized for code. Relevant for the Body's execution scripts.

**Reasoning** - Deep, multi-step reasoning over complex problems. Some models (reasoning models) are specifically designed for this and produce higher-quality results on hard problems at the cost of higher latency and price.

**Multimodal** - Models that handle multiple input/output types in a single call (text + image input, text + audio output, etc.). As models evolve, the boundaries between capability types blur.

### 1.2 Capability Profiles
Within each capability type, there are different quality/cost/speed profiles:

**Fast** - Optimized for speed and low cost. Good enough for simple tasks. Used for quick classification, short responses, simple summarization, ambient retrieval scoring.

**Standard** - The default. Good balance of quality, speed, and cost. Used for most conversational responses, general reasoning, routine code generation.

**Deep** - Optimized for quality. Higher latency, higher cost. Used for complex reasoning, important decisions, nuanced analysis, sophisticated code.

**Specialized** - Models fine-tuned for specific domains or tasks. Medical, legal, mathematical, creative writing - when a specialized model exists and is better for the task, it should be preferred.

The Brain does not need to specify a particular model. It specifies a capability and a profile: "I need text generation, deep quality" or "I need vision, fast." The Model Center's routing engine resolves this to a specific model and provider.

## 2. Routing

### 2.1 How Routing Works
When a model request arrives at the Model Center, the routing engine:

1. **Identifies the capability type** - What kind of model is needed (text, vision, embeddings, etc.).
2. **Identifies the profile** - What quality level is needed (fast, standard, deep).
3. **Looks up the routing table** - The configuration maps each (capability, profile) pair to one or more model deployments.
4. **Selects a deployment** - If multiple deployments are available for the same (capability, profile), LiteLLM's router selects one based on the active routing strategy.
5. **Executes the request** - Sends the request to the selected provider. If it fails, falls back to the next deployment in the chain.

### 2.2 Routing Strategies
LiteLLM provides several routing strategies that the Model Center leverages:

**Cost-based** - Route to the cheapest available deployment. Used when budget is a concern and quality differences between options are minimal.

**Latency-based** - Route to the deployment with the lowest recent latency. Used when speed matters (real-time conversation, time-sensitive tasks).

**Rate-limit-aware** - Avoid deployments that are currently rate-limited. Spread load across providers to stay under limits.

**Weighted** - Distribute requests across deployments according to configured weights. Useful for gradual migration or A/B testing of models.

The default strategy is latency-based with cost awareness - prefer the fastest option that isn't significantly more expensive than alternatives.

### 2.3 Fallbacks
Every capability/profile mapping has a fallback chain. If the primary model is unavailable (provider down, rate limited, error), the request automatically falls to the next model in the chain. Fallback chains are configured per capability.

The Brain never sees fallback mechanics. It asked for "standard text generation" and got a response. The Model Center handled the rest.

### 2.4 Brain-Requested Overrides
The Brain can override routing when it has a reason to. If the Brain wants a specific model for a specific task (e.g., "I know Claude is better at this particular kind of analysis"), it can specify the model directly. The routing engine respects explicit model requests while still handling retries and fallbacks.

## 3. Budget & Cost Management

### 3.1 Cost Tracking
Every model request is logged with its token usage and estimated cost. LiteLLM provides per-request cost calculation based on each provider's pricing. The Model Center aggregates this into:
- Total spend per time period (hour, day, week, month).
- Spend per capability type (how much on text generation vs. vision vs. embeddings).
- Spend per profile (how much on deep reasoning vs. fast classification).
- Spend per caller (Brain vs. Body scripts vs. internal systems).

### 3.2 Budget Enforcement
Zed can set budgets at various levels:
- Global budget (total monthly spend).
- Per-capability budget (don't spend more than X on image generation).
- Per-profile budget (limit deep reasoning spend to avoid runaway costs).

When a budget is approached, the Model Center can:
- Downgrade requests to cheaper models (use fast instead of standard).
- Queue non-urgent requests.
- Notify the Brain ("I'm running low on model budget for this month").
- Hard-stop if a limit is exceeded (configurable - Zed can choose to override its own limits).

### 3.3 Cost-Aware Reasoning
The Brain itself is cost-aware. It knows that deep reasoning models cost more than fast ones. It makes trade-offs: "This is a simple question from a stranger - use the fast model. This is a complex problem the owner asked about - use the deep model." The Model Center provides the cost data. The Brain makes the judgment.

## 4. Streaming

Many use cases require streaming (tokens arriving one at a time rather than all at once):
- Conversational responses - the person sees Zed "typing" in real time.
- Long generations - the Brain can begin processing partial output before the full response arrives.
- Code generation - the Body can start analyzing generated code as it streams in.

The Model Center supports streaming end-to-end. LiteLLM's proxy streams from the provider, and the Model Center's internal API exposes the stream to callers. The Brain/Body can consume the stream incrementally or wait for the full response.

## 5. Caching

Some model calls produce deterministic or near-deterministic results and can be cached:

**Embedding caching** - The same text always produces the same embedding (for a given model). Embeddings are cached to avoid redundant computation. This is especially important for the Memory System, which may re-embed the same content during retrieval operations.

**Repeated prompt caching** - If the Brain sends the same prompt twice (e.g., a system prompt component that doesn't change), the response can be cached. This is limited to truly deterministic cases (temperature 0, identical prompt).

**Provider-level caching** - Some providers offer their own caching (Anthropic's prompt caching, Google's context caching). The Model Center leverages these when available, structuring prompts to maximize cache hits.

Caching is managed transparently. Callers don't need to think about it - the Model Center returns cached results when available and makes fresh calls when not.
