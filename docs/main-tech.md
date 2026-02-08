# Technology

## 1. Runtime: Bun

### 1.1 Why Bun
- High performance - fast startup, fast execution. Just Awesome.
- Batteries-included philosophy: native TypeScript support, built-in bundler, built-in test runner, built-in SQLite, native HTTP/WebSocket server. Fewer external dependencies, fewer moving parts.
- Native package manager with extremely fast install times.
- Active development with strong momentum.

### 1.2 Known Risks
- **Compatibility gaps:** While Bun's Node.js compatibility is broad, edge cases exist - especially with native addons and some npm packages that rely on Node-specific internals. Each dependency must be tested on Bun.
- **Breaking changes:** Bun is still evolving rapidly. Minor version updates can introduce behavioral changes. Pinning versions and testing upgrades carefully is necessary.

## 2. Platform Libraries

### 2.1 Telegram - grammY
- The Telegram Bot Framework for TypeScript/JavaScript.
- Runs natively on Bun.
- Plugin ecosystem: `runner` for concurrent long-polling, `conversations` for stateful flows, `menu` for inline keyboards, and many more.
- Clean, composable middleware architecture.
- Excellent TypeScript types and autocompletion.
- Used in Zed as the connector implementation for `telegram` type channels. Each Telegram channel instantiates its own grammY `Bot` instance with its own token.

### 2.2 WhatsApp - Baileys
- WebSocket-based TypeScript library for interacting with the WhatsApp Web multi-device API.
- No browser or Puppeteer dependency (unlike whatsapp-web.js).
- Supports text, media, groups, reactions, read receipts, presence, and more.
- Requires session state persistence (auth keys, registration info) across restarts.
- Used in Zed as the connector implementation for `whatsapp` type channels. Each WhatsApp channel is one linked session (one phone number).

### 2.3 Discord - discord.js
- The most popular Discord API library for Node.js/TypeScript.
- Full coverage of the Discord API: messages, slash commands, voice, threads, embeds, components.
- Mature, well-documented, large community.
- Used in Zed as the connector implementation for `discord` type channels.

### 2.4 Web - Bun Native
- Bun's built-in HTTP and WebSocket server is used for the `web` channel type.
- No external framework needed for basic serving. If routing complexity grows, a lightweight layer (like Hono or Elysia) can be added.

## 3. Body & Execution

### 3.1 Code Execution Model
Zed does not use a traditional tool registry. The Body's execution model is direct code execution: the Brain writes Bun/TypeScript scripts and the Body runs them as subprocesses via `Bun.spawn`. Results are captured and returned to the Brain.

### 3.2 Desktop Automation - nut.js
For Nodes with desktop control capability, nut.js provides cross-platform desktop automation: mouse control, keyboard control, screen capture, and image-based element location. It runs on the Node client and is exposed to Zed's scripts through the `@zed/nodes` standard library.

### 3.3 Remote Execution
Node clients connect to Zed's Body Core over persistent WebSocket connections. Remote code execution on Nodes is handled by the Node client, which receives instructions over the WebSocket and executes them locally.

### 3.4 Package Ecosystem
Zed has full access to npm via Bun's package manager. Any npm package can be installed and used in execution scripts. This is the primary mechanism for Zed to acquire new capabilities without architectural changes.

## 4. Model Center Stack

### 4.1 LiteLLM
The Model Center is built on LiteLLM, running as a proxy server. LiteLLM provides a unified OpenAI-compatible API over 100+ model providers (OpenAI, Anthropic, Google, Mistral, Cohere, Ollama, and more). It handles load balancing, fallbacks, retries, cost tracking, rate limit awareness, and streaming - all out of the box.

Zed's entire model access - from the Brain (via LangChain/LangGraph), from the Body (via `@zed/models`), and from internal systems - routes through the LiteLLM proxy.

### 4.2 Ollama
For local model inference. Ollama runs open-source models on Zed's own hardware with zero external dependencies. Used as a fallback provider when cloud providers are unavailable, and as the primary provider for high-volume low-cost tasks (embeddings, classification, drafting). Also used on self-provisioned GPU Nodes for expanded local capacity.

### 4.3 LangChain Model Integration
The Brain uses LangChain's model abstractions, configured to point at the Model Center's LiteLLM endpoint. This means the Brain's LangGraph cognitive workflows are decoupled from any specific model provider - they call the Model Center, and the Model Center routes to the best available provider.

## 5. Brain Stack

### 5.1 LangChain / LangGraph
- LangChain provides the foundational abstractions for working with LLMs: chains, tools, output parsers, retrievers.
- LangGraph provides the graph-based orchestration layer for complex agent workflows: stateful, multi-step, branching, looping execution graphs.
- Used as the backbone of the Brain's cognitive architecture.

### 5.2 Deep Agents
- Used alongside LangChain/LangGraph for advanced agentic patterns: planning, reflection, self-critique, tool orchestration.

## 6. Internal Communication
The specific technology for the internal event fabric between centers (Gateway, Brain, Body, Model Center) is not yet locked. Candidates include direct in-process event emitters (for a monorepo/single-process dev mode), Redis Streams or NATS for a multi-process deployment, or a simple HTTP/WebSocket RPC layer. The choice will be driven by deployment topology and performance requirements.

## 7. Storage & Persistence
Not yet fully specified. The principle is: each center owns its own data. The Gateway owns channel configs and identity mappings. The Brain owns memories and plans. The Model Center owns routing policies and usage logs. Storage backends will be chosen per-center based on the data's nature (structured, unstructured, time-series, vector, etc.).

## 8. Body Stack

### 8.1 Browser Automation
For headless browser control, the primary candidate is Playwright (cross-browser, headless, strong automation API).

### 8.2 Desktop Control (Remote Nodes)
Desktop control on remote nodes works through a screenshot-and-input loop: the node client captures screenshots and sends them to Zed, Zed analyzes them through the Model Center's vision capabilities, and sends back mouse/keyboard commands. The node client implementation uses platform-native APIs for input simulation (e.g., xdotool on Linux, Core Graphics on macOS, Windows Input Simulator on Windows).

### 8.3 Node Client
The node client is a lightweight, cross-platform application. Primary implementation in TypeScript/Bun for portability. Communicates with Zed's Body Core via WebSocket over TLS. Designed to be minimal - most of the intelligence lives in Zed's Brain, not in the node.

### 8.4 IoT / Embedded Nodes
For resource-constrained devices (Raspberry Pi, ESP32), the node client may need a lighter implementation. A minimal protocol adapter in Python or C could serve as the client, exposing device capabilities through the standard node protocol.
