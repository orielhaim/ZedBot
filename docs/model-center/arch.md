# Model Center - Architecture

## 1. Purpose

The Model Center is Zed's raw cognitive capacity. It is not intelligence - that is the Brain. The Model Center is the neural substrate that the Brain thinks with, the eyes that the Brain sees through, the voice that the Brain speaks with.

Think of it as raw materials. The Brain is a person. The Model Center is the biological neural network, the retinas, the vocal cords. The person decides what to think and what to say. The neural hardware makes it physically possible.

The Model Center provides a unified internal interface to every type of model capability Zed might need: text generation, vision analysis, embeddings, speech-to-text, text-to-speech, image generation, video generation, reranking, and anything else that a model can do. It abstracts away the details of which vendor, which API, which model version - callers ask for a capability and get a result.

## 2. Core Principle: Raw Material, Not Decision Maker

The Model Center does not decide what to generate. It does not manage conversations. It does not choose goals. It does not have personality. It is a service layer: the Brain (or code running in the Body) says "generate text given this prompt" and the Model Center returns the generation. The Brain says "analyze this image" and the Model Center returns the analysis.

This separation is fundamental. The Model Center is replaceable. If a better model comes out tomorrow, Zed swaps it in and the Brain doesn't change. If a provider goes down, the Model Center falls back to another provider and the Brain doesn't notice. If Zed builds its own model infrastructure (by buying GPU servers and running open models), those become just another provider in the Model Center. The Brain is permanent. The models are tools.

## 3. Architecture Overview

### 3.1 LiteLLM as the Core Engine
The Model Center is built on LiteLLM, running as a proxy server. LiteLLM provides:
- A single OpenAI-compatible API endpoint that routes to 100+ model providers.
- Unified request/response format across providers (OpenAI, Anthropic, Google, Mistral, Cohere, local models via Ollama, and many more).
- Load balancing across multiple deployments of the same model.
- Automatic fallbacks when a provider fails.
- Retry with exponential backoff.
- Cost tracking per request, per model, per API key.
- Rate limit awareness and routing around rate-limited deployments.
- Streaming support.
- Logging and observability.

LiteLLM handles the complexity of multi-provider management. Zed's code doesn't need to know whether it's talking to OpenAI or Anthropic or a local Ollama instance - it sends a request to the Model Center's endpoint and gets a response.

### 3.2 The Model Center Layer on Top
While LiteLLM handles provider abstraction and operational concerns, the Model Center adds a Zed-specific layer:

**Capability Registry** - A structured map of what capabilities are available and which models serve them. Not just "text generation" but specific capability profiles: "fast text generation for quick replies", "deep reasoning for complex problems", "vision analysis for understanding images", "code generation for the Body's execution scripts." See [capabilities.md](capabilities.md).

**Provider Management** - The configuration and lifecycle of model providers (API keys, endpoints, quotas). Critically, this is manageable by Zed itself - Zed can add new providers, rotate keys, adjust routing, and expand its own model access. See [providers.md](providers.md).

**Budget Awareness** - Cost tracking and budget management. Zed knows how much it's spending on models, can set budgets for different types of work, and can make cost-aware routing decisions (use a cheaper model for simple tasks, save the expensive model for complex reasoning).

**Internal API** - The interface that the Brain and the Body's scripts call. Exposed as the `@zed/models` standard library module and as an internal API endpoint. All model access in Zed flows through this interface.

## 4. Who Calls the Model Center

### 4.1 The Brain
The Brain is the primary consumer. Every reasoning step, every conversation response, every reflection, every evaluation - these all involve model calls through the Model Center. The Brain uses the LangChain/LangGraph integration which connects to the Model Center's LiteLLM endpoint as its model backend.

### 4.2 The Body (Scripts)
Code running in the Body's Execution Engine can call models directly via `@zed/models`. This is how a single script can include AI reasoning without routing back through the Brain. Example: a script captures a screenshot, sends it to a vision model for analysis, and acts on the result - all within one execution, no Brain round-trip.

### 4.3 Internal Systems
The Memory System uses embedding models for vectorizing memories. The Evaluator may use a model to check outputs. Consolidation may use a model to summarize. These are all internal callers that go through the Model Center.

## 5. Configuration

The Model Center's configuration lives in `config/models/`. This includes:
- Provider definitions (API keys, endpoints, model names).
- Routing rules (which model to use for which capability profile).
- Fallback chains (if model A fails, try model B, then model C).
- Budget settings (spending limits per period, per category).
- Performance preferences (latency vs. quality trade-offs per capability profile).

This configuration is readable and writable at runtime. Zed can modify its own model configuration - adding providers, changing routing, adjusting budgets - through the internal control API or by directly editing config files via the Body.

## 6. Related Documents

- [Capabilities & Routing](capabilities.md)
- [Providers & Self-Expansion](providers.md)
