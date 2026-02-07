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

## 3. Brain Stack

### 3.1 LangChain / LangGraph
- LangChain provides the foundational abstractions for working with LLMs: chains, tools, output parsers, retrievers.
- LangGraph provides the graph-based orchestration layer for complex agent workflows: stateful, multi-step, branching, looping execution graphs.
- Used as the backbone of the Brain's cognitive architecture.

### 3.2 Deep Agents
- Used alongside LangChain/LangGraph for advanced agentic patterns: planning, reflection, self-critique, tool orchestration.

## 4. Internal Communication
The specific technology for the internal event fabric between centers (Gateway, Brain, Body, Model Center) is not yet locked. Candidates include direct in-process event emitters (for a monorepo/single-process dev mode), Redis Streams or NATS for a multi-process deployment, or a simple HTTP/WebSocket RPC layer. The choice will be driven by deployment topology and performance requirements.

## 5. Storage & Persistence
Not yet fully specified. The principle is: each center owns its own data. The Gateway owns channel configs and identity mappings. The Brain owns memories and plans. The Model Center owns routing policies and usage logs. Storage backends will be chosen per-center based on the data's nature (structured, unstructured, time-series, vector, etc.).