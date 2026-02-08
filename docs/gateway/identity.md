# Gateway - Identity & Profiles

## 1. The Problem

Messages arrive from many platforms. Each platform has its own way of identifying a sender: Telegram has `user_id`, WhatsApp has a phone-number-based JID, Discord has `user_id`, a web session might have a login or be anonymous. Zed needs a unified understanding of "who is talking to me" that works across all of these.

Beyond identification, Zed needs to understand its relationship with each person: is this the owner? A close friend? A stranger? A bot? Each person's profile carries memories, permissions, and context that shape how the Brain interacts with them.

## 2. Core Concepts

### 2.1 External Identity
An external identity is a platform-specific identifier. It is a pair of (channel_type, platform_user_id). For example:
- (telegram, 123456789)
- (whatsapp, 972501234567@s.whatsapp.net)
- (discord, 987654321)

External identities are discovered automatically when messages arrive.

### 2.2 Profile
A profile is Zed's internal representation of a person (or bot). It is the unified identity that may have one or more external identities linked to it.

A profile is not just an ID. It is a living record that grows over time:

**Basic info:**
- Internal profile ID.
- Display name (may be updated by the Brain as it learns more).
- Known external identities linked to this profile.

**Relationship & permissions:**
- Role - The relationship to Zed: `owner`, `trusted`, `known`, `stranger`, `bot`, `blocked`, etc.
- The role is not just an access-control label. It shapes the Brain's entire disposition toward this person. The owner gets obedience, loyalty, and full transparency. A trusted person gets warmth and helpfulness. A stranger gets politeness but caution. A blocked entity gets silence.
- Permissions are derived from role but can be granularly adjusted. For example, a "trusted" person might be given permission to ask Zed to perform certain actions but not to modify Zed's channels.

**Memory & context:**
- The profile is the anchor point for per-person memories. The Brain stores what it remembers about each person in association with their profile.
- Memory priority is influenced by interaction frequency and recency - people Zed "sees" more often are more present in active memory, just like a real person's social awareness.

**Brain-managed metadata:**
- The Brain can write arbitrary notes and structured data to a profile. Language preferences, personality observations, conversation history summaries, shared interests, important dates - anything the Brain finds relevant.
- This is not a fixed schema. The Brain decides what to remember about each person.

### 2.3 Bot Type
Not every interacting party is a human. A profile can represent:
- A **human** (the default assumption).
- A **bot** or automated system.
- An **unknown** (not yet classified).

The Brain may reclassify entities over time as it gathers more information.

## 3. Identity Resolution

When a message arrives from an external platform, the Gateway needs to resolve the sender to a profile. The resolution flow:

1. Extract the external identity from the raw event (channel_type + platform_user_id).
2. Look up the external identity in the identity map.
3. If found → return the associated profile ID. The message is enriched with the full profile context.
4. If not found → create a new profile with role `stranger`, link this external identity to it, and return the new profile. The Brain will be aware this is a first-time contact.

### 3.1 Profile Merging
The Brain (not the Gateway) can decide that two profiles are actually the same person (e.g., the same human on Telegram and WhatsApp). When this happens, the Brain instructs the identity system to merge profiles: one profile absorbs the other's external identities, and memories are consolidated. The Gateway does not do this automatically - it requires the Brain's judgment.

### 3.2 Multi-Sender Channels
Some channel types involve multiple senders on the same connection. For example:
- A Telegram group: one channel (the bot in the group), many senders.
- (Future) A camera+microphone: one channel, but speaker identification is needed.

For messaging platforms, this is straightforward - each message carries a sender ID that the platform provides. For sensor-based channels (cameras, microphones), sender identification becomes a harder problem that will require specialized processing (voice recognition, face recognition). The architecture supports this by making identity resolution a pluggable step in the normalization pipeline - different channel types can use different resolution strategies.

## 4. Presence Tracking

The Gateway tracks presence signals for every known external identity across all active channels. Presence is the raw observational data about where a person is right now - not a judgment about where to contact them (that's the Brain's job).

### 4.1 What the Gateway Tracks
Each connector reports whatever presence information its platform provides:
- **Online/offline status** - Telegram, WhatsApp, and Discord all expose some form of "last seen" or "online" indicator.
- **Activity signals** - A message sent on a channel is the strongest presence signal: the person is definitely active there right now. Typing indicators, read receipts, and reactions are weaker but still useful signals.
- **Connection events** - Some platforms emit events when a user comes online or goes offline. The connector captures these.

### 4.2 Presence as Raw Data
The Gateway does not interpret presence. It does not decide "the owner is on Discord now, so I should route there." It simply maintains a per-profile presence record: for each of the profile's linked external identities, what is the latest presence signal, and when was it received.

This data is available to the Brain via the internal event fabric. Presence changes are emitted as internal events (lightweight, high-frequency). The Brain's Presence Awareness system (see [brain communication ](../brain/communication.md)) consumes these events and uses them for intelligent routing decisions.

## 5. Permissions Model

Permissions in Zed are not a traditional RBAC system with a management UI. They are part of Zed's identity and social awareness.

The Brain interprets roles and permissions contextually. There is no "permission denied" error screen. Instead, the Brain simply knows what level of trust and obedience it should extend to each person, and it behaves accordingly.

That said, the system provides a structured foundation:

**Role hierarchy (conceptual, not strict):**
- `owner` - Full authority. Zed follows instructions, shares everything, and treats this person as its primary. There may be more than one owner.
- `trusted` - High trust. Zed is open, helpful, and willing to act on their behalf within limits.
- `known` - Recognized person. Zed is friendly and conversational but more cautious about actions.
- `stranger` - Unknown person. Zed is polite but guarded. Will not perform sensitive actions.
- `bot` - Automated system. Zed interacts in a structured, API-like manner.
- `blocked` - Zed does not respond.

**Granular permissions (examples):**
- Can ask Zed to manage its own channels.
- Can ask Zed to access or modify memories.
- Can ask Zed to execute tools (via the Body).
- Can receive proactive messages from Zed.

These are soft constraints: the Brain uses them as part of its reasoning, not as hard gates. The Brain has the final say on how to act.

## 6. Self-Management

Zed can modify profiles and permissions itself. This is essential for its autonomy:
- The Brain can promote a stranger to "known" after positive interactions.
- The Brain can add notes to a profile after learning something new.
- The owner can instruct Zed to trust a new person, and the Brain updates the profile accordingly.
- The Brain can block someone it identifies as abusive.

The identity system provides the data layer. The Brain provides the judgment.
