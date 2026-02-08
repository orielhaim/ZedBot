# Model Center - Providers & Self-Expansion

## 1. What is a Provider

A provider is a source of model capabilities. It is an API endpoint with credentials that the Model Center can send requests to.

Examples of providers:
- **OpenAI** - API key, access to GPT models, Whisper, embeddings.
- **Anthropic** - API key, access to Claude models.
- **Google** - API key, access to Gemini models, Imagen.
- **Mistral** - API key, access to Mistral models.
- **Cohere** - API key, access to Command models, rerankers, embeddings.
- **Ollama (local)** - Local endpoint, access to any model Zed has downloaded and is running.
- **Custom/Self-hosted** - Any OpenAI-compatible API endpoint. This includes models Zed runs on its own GPU servers.

Each provider has:
- An identifier (name/type).
- Connection details (API base URL, API key).
- A list of models available through it.
- Rate limits and quotas.
- Pricing information (cost per token, per request, per image, etc.).

## 2. Provider Configuration

Provider definitions live in the litellm instance.

## 3. Self-Managed Providers

This is where the Model Center connects to Zed's autonomy. Zed can manage its own model providers.

### 3.1 Adding a New Provider
Zed can add a new model provider entirely on its own. The process:

1. **Decide it needs more capacity.** The Brain notices it's hitting rate limits, or costs are too high with current providers, or it wants access to a model that its current providers don't offer.
2. **Acquire access.** Zed navigates to the provider's website (using desktop control via a Node, or using the provider's API), creates an account, adds a payment method, and obtains an API key. If Zed has its own funds, it uses them. If not, it can ask the owner for authorization.
3. **Configure.** Zed writes a new provider configuration file and updates the routing rules.
4. **Reload.** Zed signals the Model Center to reload its configuration. The new provider is live.

No human intervention required. Zed identifies a need, acquires the resource, and integrates it.

### 3.2 Running Its Own Models
The most powerful form of self-expansion: Zed runs models on its own infrastructure.

If Zed has acquired GPU servers (through the Body's Node expansion - see body/nodes.md), it can:
1. Download open-source models (Llama, Mistral, Qwen, etc.) onto its GPU server.
2. Run them using Ollama or vLLM or any serving framework.
3. Register the server as a provider in the Model Center.
4. Route requests to its own models.

This gives Zed:
- **Cost independence** - No per-token fees for self-hosted models.
- **Unlimited capacity** - No rate limits except hardware limits.
- **Privacy** - Prompts don't leave Zed's infrastructure.
- **Customization** - Zed can fine-tune models on its own data (conversations, memories, specialized knowledge).

### 3.3 Provider Portfolio Management
Over time, Zed builds a portfolio of providers - some commercial (OpenAI, Anthropic), some self-hosted (Zed's own GPU servers). The Brain manages this portfolio like a resource manager:
- "OpenAI is getting expensive - let me route more traffic to my self-hosted Llama for simple tasks."
- "I need the best reasoning for this problem - route to Claude, even though it costs more."
- "My GPU server is idle - let me run some embedding batch jobs there instead of paying Cohere."
- "A new open model just came out that benchmarks well on code - let me download it, test it, and maybe make it my default for code generation."

This is active resource management. Zed doesn't just use models - it manages its model infrastructure as part of its self-sufficiency drive.

## 4. Key Rotation & Security

API keys are sensitive. Zed manages them:
- Keys are stored in the litellm instance.
- Zed can rotate keys on its own - generate a new key at the provider, update the litellm instance, deprecate the old key.
- If a key is compromised (detected by unusual usage patterns or a provider alert), Zed can respond automatically: rotate the key, investigate the anomaly, notify the owner.

## 5. Observability

The Model Center tracks everything:

**Per-request logging:**
- Which model was called, which provider served it.
- Token usage (prompt tokens, completion tokens).
- Latency (time to first token, total time).
- Cost.
- Success/failure status and error details.
- Which capability/profile was requested vs. which model was actually used.

**Aggregate metrics:**
- Total spend over time, broken down by provider, model, capability, profile, and caller.
- Request volume and patterns.
- Error rates per provider.
- Latency distributions.
- Cache hit rates.

**Alerts and awareness:**
- Budget approaching limits.
- Provider error rate spike (a provider might be having issues).
- Unusual cost patterns (a rogue script burning tokens).

These metrics are available to the Brain. The Brain can query "how much have I spent this week?" or "which provider has been most reliable?" and get concrete answers. This data feeds into the Brain's decision-making about provider management, budget allocation, and model selection.

LiteLLM provides much of this observability natively. The Model Center extends it with Zed-specific context (linking requests to goals, conversations, and callers).

## 6. Local Models

Local models (via Ollama or similar) deserve special mention because they represent Zed's most independent capability:

**Always available** - Local models don't depend on internet connectivity or external services. If every cloud provider goes down, Zed can still think (at reduced capability) using local models.

**Zero marginal cost** - Once the hardware exists and the model is downloaded, every inference is free. This makes local models ideal for high-volume, low-stakes tasks: embedding generation, simple classification, draft generation, ambient processing.

**Privacy** - Nothing leaves the machine. For sensitive operations (processing the owner's private data, internal reasoning), local models provide complete privacy.

**Experimentation** - Zed can download and test new open-source models at zero cost. If a model works well, it gets promoted in the routing table. If not, it gets removed.

The Brain should be aware of the trade-offs: local models are typically smaller and less capable than frontier commercial models. The routing engine handles this naturally - local models serve the "fast" profile, commercial models serve "deep."

## 7. Future: Self-Trained Models

The ultimate form of model self-sufficiency: Zed fine-tunes or trains its own models. This is speculative but architecturally supported:

- Zed accumulates data over time (conversations, memories, task outcomes, code executions).
- Zed has (or acquires) GPU resources.
- Zed fine-tunes an open base model on its own data, creating a model that is uniquely attuned to Zed's personality, knowledge, and interaction patterns.
- The fine-tuned model is registered as a provider and routed to.

This would make Zed's cognition increasingly personalized over time - not just through prompting and memory, but through the actual model weights. The Brain would literally be running on a model shaped by its own experience.

This is a long-horizon possibility. The architecture doesn't need to support it today, but it should not prevent it either. The provider system is open enough that a self-trained model is just another provider.
