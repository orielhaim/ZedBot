# Gateway - Channels

## 1. What is a Channel

A channel is a single, configured connection between Zed and the outside world. It is the most granular unit the Gateway manages.

Examples of channels:
- A Telegram bot with token `abc123` operating under the username `@zed_assistant_bot`.
- A second Telegram bot with a different token, serving a different purpose or audience.
- A WhatsApp session linked to phone number `+972-xxx`.
- A Discord bot connected to a specific guild.
- A web chat widget embedded on a website.
- A camera feed from a local device.
- A microphone stream for voice interaction.
- An email inbox.
- A custom webhook endpoint that receives events from an external system.

Each channel is independent. There is no assumption that Zed has "one Telegram bot." Zed may have hundreds of Telegram bots, each with its own token, its own audience, and its own personality nuance (driven by the Brain's awareness of which channel it's speaking through).

## 2. Channel Definition

Every channel has the following conceptual properties:

**Core identity:**
- `id` - Unique internal identifier (auto-generated).
- `type` - The platform type (telegram, whatsapp, discord, web, camera, custom...).
- `name` - A human/Brain-readable label (e.g., "Main personal Telegram", "Work WhatsApp", "Security camera - front door").
- `description` - Optional free-text description of the channel's purpose.

**Connection:**
- `credentials` - Platform-specific credentials (bot token, session data, API keys...). Stored securely.
- `connector_config` - Any connector-specific settings (polling interval, webhook URL, proxy, etc.).

**State:**
- `status` - Current lifecycle status: `active`, `paused`, `error`, `initializing`.
- `error_info` - If status is `error`, details about what went wrong.

**Context for the Brain:**
- `audience` - What kind of interaction this channel serves. Is it one-on-one? A group? A broadcast? A sensor?
- `tags` - Freeform tags the Brain can use for reasoning (e.g., "personal", "work", "monitoring", "hebrew-speaking").
- `notes` - Brain-writable notes about this channel (the Brain can annotate its own channels as it learns about them).

## 3. Channel Registry

The Channel Registry is the Gateway's internal store of all channel definitions. On startup, the Gateway reads channel definitions from configuration files in `config/channels/`. Each file defines one or more channels.

The registry is also writable at runtime through the Gateway's Control API. This means:
- Zed (the Brain) can add a new channel by calling the Control API with the channel's type and credentials.
- Zed can pause or remove a channel.
- Zed can update a channel's tags, notes, or even credentials (e.g., rotating a token).
- An operator can also manually place a JSON file in the config directory and signal a reload.

The registry is the source of truth. Connectors are derived from it. If a channel is in the registry and marked `active`, the Gateway ensures a connector is running for it. If a channel is removed or paused, the connector is stopped.

## 4. Connector Lifecycle

When the Gateway starts (or when a channel is dynamically registered):

1. The registry entry is validated (type is known, credentials are present).
2. The appropriate connector module for the channel type is loaded.
3. The connector is initialized with the channel's credentials and config.
4. The connector establishes its connection to the external platform.
5. The channel status is updated to `active` (or `error` if initialization fails).
6. The connector begins listening for inbound events and is ready to dispatch outbound events.

When a channel is paused or removed:

1. The connector is signaled to shut down gracefully (finish in-flight operations).
2. The connection to the external platform is closed.
3. The channel status is updated accordingly.

When a connector encounters a persistent error:

1. The connector attempts reconnection with exponential backoff.
2. If recovery fails after a configured number of attempts, the channel status is set to `error`.
3. An internal event is emitted so the Brain is aware of the channel failure.
4. The Brain can decide to alert the owner, attempt remediation, or simply wait.

## 5. Multi-Channel Awareness

The Brain always knows which channel an event came from. This is critical because:
- The Brain may adopt different tones or languages depending on the channel (a "work" Telegram bot might be formal; a "personal" one might be casual).
- The Brain can cross-reference information across channels (e.g., recognizing the same person on Telegram and WhatsApp via their profile).
- The Brain can choose which channel to proactively send a message through (e.g., reaching out to the owner via their preferred channel).
- The Brain can manage channels as part of its self-improvement (e.g., "I should set up a new Telegram bot for handling customer inquiries separately").
