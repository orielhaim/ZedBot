# Gateway - Architecture

## 1. Purpose

The Gateway is Zed's sensory system. It is the only boundary between Zed and the outside world. Every signal that enters Zed - a text message, a photo, a voice note, a webhook event - arrives through the Gateway. Every response Zed sends back - a reply, a media file, a reaction - exits through the Gateway.

The Gateway does not think. It does not decide what to say. It translates the outside world into a language Zed's Brain can understand, and translates the Brain's intentions back into the language of each external platform.

## 2. Core Principles

### 2.1 Unlimited Channels
The Gateway is not configured for "a Telegram bot." It manages an unbounded registry of **channels**. A channel is a single connection point to the outside world: one Telegram bot token, one WhatsApp session, one Discord bot, one camera feed, one API webhook. There is no hardcoded limit. The system should handle ten channels the same way it handles ten thousand.

### 2.2 Platform Agnosticism
Every channel has a **type** (telegram, whatsapp, discord, web, camera, microphone, custom...) and a **connector** that knows how to speak that platform's protocol. But once a message crosses the connector boundary, it becomes a single canonical format. The Brain never deals with Telegram-specific objects or Discord-specific payloads. It deals with Zed events.

### 2.3 Brain Awareness
The Gateway is not a black box that silently pipes messages. Every event forwarded to the Brain carries rich context: which channel it came from, the channel's type and identity, who sent it (mapped to an internal profile), and any relevant metadata. The Brain always knows exactly which "mouth" and which "ear" it is using.

### 2.4 Self-Controllable
Zed itself - through the Brain - can manage the Gateway. It can register new channels, deactivate existing ones, modify channel configurations, and observe channel health. The Gateway exposes an internal control API that the Brain (and only the Brain, or system operator) can invoke. Zed builds and maintains itself.

## 3. High-Level Components

### 3.1 Channel Registry
The source of truth for all configured channels. Stores channel definitions: type, credentials, status (active/paused/error), metadata, and connector-specific settings. Backed by configuration files on disk (`config/channels/*.json`) with the option to be managed dynamically at runtime. The Brain can read, create, update, and delete channel entries through the internal control API.

### 3.2 Connector Layer
One connector implementation per platform type. Each connector is a self-contained module that knows how to:
- Establish and maintain a connection to the external platform (long polling, WebSocket, webhook listener, etc.).
- Receive raw platform events and translate them into canonical inbound events.
- Accept canonical outbound events and translate them into platform-specific API calls (respecting format quirks, media limits, markdown dialects, rate limits).
- Report its own health and status back to the Gateway core.

Connectors are loaded dynamically based on the Channel Registry. When a new channel is registered, the Gateway spins up the appropriate connector. When a channel is deactivated, the connector is gracefully torn down.

### 3.3 Normalizer
The translation layer between raw platform data and Zed's canonical event format. The normalizer handles:
- Message content extraction (text, media, documents, location, contacts, etc.).
- Sender identification and mapping to internal profile IDs (via the Identity system).
- Thread/conversation context (reply chains, group info, topic, etc.).
- Metadata enrichment (timestamps, platform-native message IDs, delivery status).

### 3.4 Event Emitter (Inbound Pipeline)
After normalization, events are pushed into the internal event fabric toward the Brain. The inbound pipeline is responsible for:
- Ordered, reliable delivery to the Brain.
- Deduplication (same platform event arriving twice should not produce two internal events).
- Backpressure handling (if the Brain is overloaded, the pipeline buffers or applies flow control rather than dropping events).

### 3.5 Dispatch (Outbound Pipeline)
When the Brain decides to send a message or perform an outbound action, it emits an outbound event targeting a specific channel (or set of channels). The dispatch pipeline:
- Routes the event to the correct connector(s).
- Applies platform-specific formatting (the connector handles the details).
- Handles retries on transient failures.
- Reports delivery status back (sent, delivered, read, failed) when the platform supports it.

### 3.6 Control API
An internal-only API that allows the Brain (or authorized tools) to:
- List all channels and their status.
- Register a new channel (provide type + credentials + settings).
- Update a channel's configuration.
- Activate / pause / remove a channel.
- Query channel health metrics (uptime, error rate, latency, message counts).

This API is not exposed to the outside world. It is part of the internal event/RPC fabric between Zed's centers.

## 4. Lifecycle of an Inbound Message

1. External platform delivers a raw event to the connector (e.g., Telegram sends an Update via long polling).
2. The connector parses the raw event and produces a pre-normalized structure.
3. The normalizer enriches it: resolves the sender to an internal profile (creating one if new), attaches channel context, standardizes content types.
4. The event is stamped with a unique event ID and pushed into the inbound pipeline.
5. The inbound pipeline delivers the event to the Brain via the internal event fabric.

## 5. Lifecycle of an Outbound Message

1. The Brain emits an outbound event specifying: target channel ID (or criteria), content (in canonical format), and any directives (e.g., reply-to a specific inbound event).
2. The dispatch pipeline routes the event to the correct connector.
3. The connector translates the canonical content into the platform's format and sends it via the platform API.
4. The connector reports the delivery result back through the event fabric (success, failure, platform message ID).

## 6. Scaling Considerations

The Gateway must support a growing number of channels without architectural changes. Key strategies:
- Each connector instance is independent. Adding a channel means adding a connector instance, not modifying shared state.
- Connectors can run in separate workers/processes if resource isolation is needed.
- The Channel Registry is the single coordination point; connectors are stateless beyond their live connection.
- Rate limiting and backpressure are per-connector, so one overloaded channel does not affect others.

## 7. Fault Tolerance

- If a connector crashes or loses connection, the Gateway detects this through health checks and attempts automatic reconnection with exponential backoff.
- Persistent delivery: inbound events that have been normalized but not yet acknowledged by the Brain are buffered and retried.
- Channel status is tracked and exposed - the Brain can observe that a channel is in an error state and decide how to react (alert the owner, try a different channel, etc.).

## 8. Related Documents

- [Channels](channels.md) - Channel registry, dynamic management, connector lifecycle.
- [Identity](identity.md) - Profile resolution, identity mapping, permissions.
