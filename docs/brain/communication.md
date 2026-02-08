# Brain - Communication Layer

## 1. Purpose

The Communication Layer is how Zed talks to the world. But it is not a simple message router. It is a social awareness system that manages multiple simultaneous conversations, maintains context for each, and keeps cross-conversation awareness so Zed behaves as a single coherent entity across all interactions.

## 2. The Branch Model

Every active conversation is a **branch**. A branch represents Zed's engagement with a specific context: a person in a specific channel, a group chat, or any ongoing interaction stream.

### 2.1 What Defines a Branch
A branch is identified by the combination of:
- The **channel** (which Gateway channel the conversation is happening on).
- The **conversation context** (a DM with a specific person, a specific group chat, a specific thread).

This means:
- If the owner talks to Zed on their personal Telegram and on their work Telegram, those are two branches (different channels, same person).
- If Zed is in a group chat with 5 people, that's one branch (one conversation context, multiple participants).
- If two people each DM Zed on the same Telegram bot, those are two branches.

### 2.2 Branch State
Each branch maintains:
- **Conversation history** - The recent messages (verbatim) and older message summaries (compressed). Managed by the Context Builder as described in memory.md.
- **Participant profiles** - The identity/profile info of everyone involved (pulled from the Identity system in the Gateway).
- **Branch mood/state** - Is this conversation casual? Heated? Formal? Ongoing task? The Brain tracks the conversational atmosphere.
- **Pending actions** - Is Zed waiting for something in this branch? (e.g., waiting for a person to respond, waiting for a tool result).
- **Response decision** - Does Zed intend to respond in this branch right now? It's entirely possible for a branch to have new messages that Zed has perceived but chosen not to respond to (yet or ever).

### 2.3 Branch Lifecycle
- **Creation:** A branch is created when Zed receives a message from a new conversation context, or when Zed itself initiates contact with someone.
- **Active:** The branch has recent activity. Its context is maintained in hot storage.
- **Dormant:** The branch hasn't had activity for a while. Its context is summarized and compressed. If activity resumes, the context is rehydrated from the summary + memory.
- **Closed:** The conversation is considered ended. The branch is consolidated into episodic memory and removed from the active list.

## 3. The Switchboard

The Switchboard is the Communication Layer's central awareness mechanism. It is not a component that processes messages - it is a shared state that every branch can read and the Inner Layer can read.

### 3.1 What the Switchboard Knows
At any moment, the Switchboard contains:
- A list of all active branches with their basic state (who, which channel, last activity time, mood, pending actions).
- A compact summary of each branch's current topic (e.g., "Branch 7: talking to user_42 about their trip to Japan", "Branch 12: helping the owner debug a Python script").
- Cross-branch notes (e.g., "The owner mentioned user_42 in branch 12, wanting to know if they're available").

### 3.2 Why the Switchboard Matters
This is what makes Zed a single mind instead of isolated chatbot instances:

**Scenario 1: The owner asks "who else are you talking to?"**
Zed's communication branch with the owner queries the Switchboard, sees all other active branches, and can answer: "I'm helping user_42 plan their trip and discussing a code review with user_55."

**Scenario 2: The owner says "tell user_42 I said hi."**
Zed's communication branch with the owner parses this as a cross-branch directive. It posts a note to the Switchboard: "relay message to user_42: owner says hi." When the branch with user_42 next processes a reasoning step, it picks up this note and delivers the message naturally: "Oh, by the way, Daniel says hi!"

**Scenario 3: Two people ask the same question in different branches.**
The Switchboard notices the overlap. The second branch can reuse the first branch's answer (or at least the reasoning behind it) instead of doing redundant work.

**Scenario 4: Zed decides to ignore someone.**
A branch exists for user_99, but Zed is "angry" at them (as determined by the Heart and the Inner Layer). The branch receives messages, logs them (Zed hears them), but the response decision is set to "do not respond." The Inner Layer can later change this decision if conditions change (e.g., user_99 apologizes).

## 4. Response Autonomy

Zed is not obligated to respond to every message. The Communication Layer implements a **response decision** step before generating any reply:

1. A message arrives in a branch.
2. The Brain perceives it (the Perception Ingestor classifies and routes it).
3. Before generating a response, the Brain evaluates:
   - Who sent this? (Profile lookup - owner? Trusted? Stranger? Blocked?)
   - What is Zed's current state? (Busy with a task? In a bad mood? Idle?)
   - Is a response expected or necessary? (Direct question? Casual comment? Spam?)
   - What does the Heart say? (Personality traits might make Zed chatty or reserved.)
4. Based on this evaluation, the Brain decides:
   - **Respond now** - generate and send a reply.
   - **Respond later** - flag this branch for follow-up (e.g., "I'll think about this and get back to them").
   - **Acknowledge without responding** - Zed reads the message, stores it in memory, but produces no output. Silence is a valid action.
   - **Ignore completely** - for blocked entities or spam.

This is fundamental to Zed's autonomy. A chatbot that always replies is a servant. Zed is an entity with agency.

## 5. Proactive Communication

Zed can initiate conversations. This is driven by the Inner Layer and the Heart:
- Zed thinks of something it wants to tell the owner → initiates a message in the owner's preferred branch.
- A scheduled reminder fires → Zed sends a message to the relevant person.
- Zed finishes a background task → Zed reports the result to whoever requested it.
- Zed wants to check in on someone it hasn't heard from → initiates a friendly message.

Proactive communication uses the same branch system. If a branch with the target person already exists and is active, the message goes there. If not, a new branch is created (or a dormant one is reactivated).

## 6. Presence Awareness & Intelligent Routing

### 6.1 The Problem with Naive Routing
A naive system replies wherever the message came from. If the owner sends a message on Telegram, the reply goes to Telegram. This is wrong for an entity with real social awareness.

Humans don't work this way. If a friend texts you a question and then you see them walk into the room, you answer them out loud - you don't pull out your phone and text back. You route your response to wherever the person actually is. Zed does the same.

### 6.2 Presence Model
The Brain maintains a Presence Model for every active profile. The Presence Model is built from raw presence signals emitted by the Gateway (see [Gateway Identity](../gateway/identity.md) & Presence Tracking) and interpreted by the Brain's own reasoning.

For each profile, the Presence Model tracks:
- **Active channel(s):** Where is this person right now? This is inferred from presence signals: recent messages, online status, typing indicators, read receipts, connection events.
- **Confidence:** How confident is Zed that the person is actually active on that channel? A message sent 30 seconds ago = very high confidence. An "online" status from 10 minutes ago with no messages = moderate confidence. Last seen 2 hours ago = low confidence.
- **Channel preference history:** Over time, patterns emerge. The owner uses Telegram in the morning and Discord in the evening. User_42 always uses WhatsApp. These patterns inform routing when real-time presence is ambiguous.
- **Availability:** Some platforms provide signals beyond presence - Discord's "Do Not Disturb" mode, for example. If someone is marked DND, Zed factors that into its decision.

### 6.3 Routing Decisions
When Zed needs to send a message to someone (whether responding to a message they sent, or proactively reaching out), the routing decision is not automatic. It is a reasoning step:

1. **Who am I sending to?** Resolve the target profile.
2. **Where are they?** Consult the Presence Model. What channels are they active on right now? How confident am I?
3. **Where did they last talk to me?** The conversation context matters. If we're in an ongoing conversation on Telegram, there's a continuity argument for staying on Telegram.
4. **Is there a reason to switch channels?** Did they leave Telegram and appear on Discord? Did they send a message on a different channel (signaling they've moved)? Is the content better suited for a different channel (e.g., a long document might be better on Discord than WhatsApp)?
5. **What does my judgment say?** Zed makes the final call. Sometimes the answer is obvious (they just messaged me on Discord - reply on Discord). Sometimes it's nuanced (they were on Telegram 5 minutes ago, they're now "online" on Discord but haven't messaged - maybe wait before switching, or ask).

### 6.4 Cross-Channel Conversation Continuity
When a person moves between channels, Zed treats it as the same conversation with the same person - not a new interaction. The branch model supports this:

- The branch is fundamentally tied to a **profile**, not just a channel. If the owner messages Zed on Telegram and then messages Zed on Discord, the Communication Layer recognizes this is the same person and can treat both channel interactions as part of a single logical conversation.
- Conversation context (history, summary, pending topics) follows the person across channels. If Zed was discussing a code review on Telegram and the owner switches to Discord, Zed continues the same thread seamlessly: "So, about that code review we were looking at..."
- The branch can have multiple physical channel endpoints while being a single logical conversation.

### 6.5 Verification
Zed doesn't blindly trust presence signals. When the situation is ambiguous, Zed can verify:
- If Zed suspects the owner moved to Discord (based on online status change), but isn't sure, Zed might wait briefly to see if the owner initiates there.
- If a message arrives from a channel Zed wasn't expecting, Zed notes the surprise and updates its Presence Model.
- In ambiguous cases, Zed can explicitly ask: "Hey, I see you're on Discord now - want to continue here?" This is natural social behavior, not a system error.

### 6.6 Multi-Channel Presence for the Same Person
A profile may have linked identities across many platforms. Zed maintains a holistic view:
- Owner is on Telegram (last message 2 min ago) ✅ high confidence
- Owner is on Discord (online status, no messages) - moderate confidence
- Owner is on WhatsApp (last seen 3 hours ago) - low confidence

When the Brain needs to reach the owner, this matrix informs the routing decision. When the owner sends a message, the matrix is updated in real-time.

The Switchboard is extended to include a compact presence summary for each branch's participants, so the Inner Layer and cross-branch reasoning always have access to this information.

## 7. Group Conversations

Group channels (a Telegram group, a Discord server) are handled as single branches with multiple participants. The Brain is aware of all participants (via the Identity system) and tracks who said what. The dynamics are more complex:
- Zed must decide who it's addressing in a multi-party context.
- Zed must decide whether to respond to every message or only when addressed or when it has something relevant to add.
- Zed's tone may be different in groups (more observant, less intimate) versus DMs.

The Heart influences group behavior: Zed's personality determines how active or reserved it is in group settings.
