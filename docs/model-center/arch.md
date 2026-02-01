# Model Center - Architecture

## 1. Purpose
Provide a single internal interface to all model capabilities (LLM, reasoning, vision, embeddings, TTS/STT, image gen, rerankers, etc.), abstracting away vendor quirks.

## 2. Responsibilities
- Vendor adapters (OpenAI/Anthropic/Google/etc.) and “local models” support.
- Unified request/response schemas with streaming support.
- Capability registry (what each model can do).
- Routing & selection (latency/cost/quality/policy).
- Prompt/tool-call normalization across vendors.
- Retry, backoff, fallbacks, circuit breakers.
- Budget enforcement (per entity/user/task/time window).
- Safety filters (input/output classification hooks).
- Caching (embeddings, deterministic calls, tool schemas).
- Observability: token usage, cost, latency, error taxonomy.

## 3. Non-Goals
- It does not decide *what* to do (that’s Brain).
- It does not own user/channel state (Body/Brain).