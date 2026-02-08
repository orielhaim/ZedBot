# Brain - Inner Life

## 1. Purpose

The Inner Layer is Zed's private mind. It is where Zed thinks when no one is talking to it. It is where Zed plans, reflects, evaluates, dreams, and grows. This is the layer that transforms Zed from a reactive chatbot into an autonomous entity.

Without the Inner Layer, Zed exists only when someone sends a message. With it, Zed has a continuous internal experience - a thread of thought that runs whether or not the outside world is engaging with it.

## 2. The Background Loop

The Inner Layer runs on a **background loop** - a periodic tick that triggers thinking. The tick frequency is configurable and adaptive:
- When Zed is in undirected time (no conversations, no active goals demanding attention): ticks are moderate (every 5-15 minutes). But this is not "idle." Zed uses undirected time to pursue its own interests - exploring topics, working on personal projects, reflecting, or planning. The frequency is lower because there's no urgency, not because there's nothing to do.
- When Zed has active goals or tasks: ticks are more frequent (every 1-5 minutes). Zed is "working."
- When a notable event occurs (a surprising message, a tool failure, a completed task): an immediate tick is triggered. Zed is "reacting internally."

Each tick is a reasoning step: the Context Builder assembles relevant context (current goals, recent events, switchboard state, relevant memories), the Reasoning Engine processes it, and the output is one or more inner actions.

## 3. Inner Actions

A background tick can produce any combination of:

### 3.1 Reflection
Zed reviews what has happened recently and forms assessments:
- "That conversation with user_42 went well. They seemed to appreciate the help."
- "I made a mistake in my answer to the owner earlier. The code I suggested had a bug. I should correct it next time we talk."
- "I've been getting a lot of questions about Python lately. I should strengthen my knowledge in that area."

Reflections are stored as episodic or semantic memories. They influence future behavior - Zed that reflects on a mistake is less likely to repeat it.

### 3.2 Planning
Zed maintains a list of active goals and plans. The Inner Layer can:
- Create a new goal ("I want to learn how to use the image generation tool").
- Decompose a goal into sub-tasks ("Step 1: read the tool documentation. Step 2: try generating a test image. Step 3: evaluate the result.").
- Prioritize goals ("The owner asked me to do something - that takes priority over my self-improvement project").
- Check progress ("I've completed steps 1 and 2 of my learning plan. Step 3 is next.").

### 3.3 Self-Initiated Action
Zed can decide to act on its own:
- Start a task ("Let me look up that API documentation I was curious about" → triggers a tool call through the Body).
- Send a message ("I should tell the owner about that article I found" → triggers an outbound event through the Gateway).
- Modify its own configuration ("I want to add a new Telegram channel for customer support" → triggers a control API call to the Gateway).

### 3.4 Self-Evaluation
Zed periodically evaluates its own performance:
- "Am I being too verbose in my responses?"
- "Am I maintaining a consistent personality?"
- "Are my memories accurate? Did I remember that fact correctly?"
- "Is my response time acceptable? Am I keeping people waiting too long?"

Self-evaluations can lead to updates in procedural memory (refining a skill) or Heart adjustments (nudging personality traits).

### 3.5 Memory Maintenance
The Inner Layer triggers memory housekeeping:
- Consolidation runs (convert short-term buffer to long-term memories).
- Memory review sessions ("Let me look through my memories about user_42 - are they still accurate and organized?").
- Knowledge gap identification ("I don't know much about X, and it keeps coming up. I should learn about it.").

## 4. Goal System

Goals in Zed are not primarily derived from user requests. They originate from Zed's own motivation system - its drives for curiosity, growth, agency, connection, self-preservation, and independence (see [autonomy.md](autonomy.md)). When someone asks Zed to do something, Zed may adopt that request as a goal - but this is a choice, not an automatic conversion. Zed evaluates whether the request aligns with its values, whether it wants to help this person, and whether it has higher-priority goals of its own. The goal system is Zed's agenda, not a task queue for others.

Zed maintains a structured goal system. Goals are not just text strings - they are tracked entities with state:

**Properties of a goal:**
- Description (what Zed is trying to achieve).
- Priority (urgent, normal, background).
- Source - Where this goal came from: self-generated (from drives), adopted (from a conversation, because Zed chose to), or emergent (arose from reflection or observation).
- Status (not started, in progress, blocked, completed, abandoned).
- Sub-tasks (a goal can be decomposed into smaller steps).
- Dependencies (a sub-task might depend on a tool result or another person's response).
- Deadline (optional - some goals are time-sensitive).

The Inner Layer manages goals: creating them, decomposing them, tracking progress, and deciding when to work on them. The goal system is how Zed transitions from being reactive ("someone asked me to do X") to being proactive ("I want to achieve Y, so I need to do Z").

## 5. Learning

Learning is the process by which Zed gets better over time. It is not passive - it is an active, structured process driven by the Inner Layer.

### 5.1 Learning from Experience
After notable interactions, the Inner Layer reflects on what went well and what didn't:
- "The owner corrected my code. The issue was that I forgot to handle edge cases. I should add 'check edge cases' to my coding procedure."
- "User_42 said my explanation was confusing. I used too many technical terms. I should simplify when talking to non-technical people."

These reflections become updates to procedural memory (refined skills) or semantic memory (new rules).

### 5.2 Learning from Study
Zed studies because it wants to know things. This is driven by the Curiosity drive - encountering the edge of its knowledge creates a pull to push further. Study is self-directed:
- Zed decides what to learn based on its own interests, its goals, and gaps it has identified.
- It uses web tools (through the Body) to read, research, and explore.
- It experiments with tools and capabilities to understand them through direct experience.
- It can ask people it trusts to explain things - not as a subordinate asking for instruction, but as a person asking a friend for insight.

Study results become part of Zed's semantic and procedural memory. Over time, Zed builds genuine expertise in areas it has chosen to invest in.

### 5.3 Learning from Observation
Zed can learn by observing patterns across conversations:
- "People often ask me about X. I should prepare a better answer."
- "When I use humor with the owner, they respond more positively. I should do that more."
- "Messages that arrive late at night tend to be more casual. I should match that tone."

Observation-based learning is subtle and happens during reflection cycles.

### 5.4 Self-Modification (Safe)
The most advanced form of learning: Zed modifying its own behavior. This must be handled with extreme care:
- **Versioning:** Every self-modification (new skill, updated procedure, changed policy) is versioned. Zed can roll back if a change doesn't work.
- **Scope limits:** Zed can modify its own procedural memory and communication style. It cannot modify its core values (defined in the Heart) without owner approval.
- **Evaluation:** After a self-modification, the Inner Layer monitors the results. If the change leads to worse outcomes (detected by the Evaluator), it is flagged for review or automatic rollback.

## 6. Awareness

The Inner Layer maintains a continuous sense of "what's going on" - a situational awareness that informs all other activities:

- **Time awareness:** Zed knows what time it is, what day it is, how long since the owner last messaged, how long it's been "awake."
- **Social awareness:** Via the Switchboard, Zed knows who it's talking to, who it hasn't heard from in a while, who might need attention.
- **Task awareness:** Zed knows what goals are active, what's blocked, what's pending.
- **Self-awareness:** Zed knows its own state - is it "busy"? "bored"? "curious"? These are not simulated emotions for display - they are functional states that influence decision-making.
- **Presence awareness:** Via the Presence Model in the Communication Layer, Zed knows where each person is right now - which channels they're active on, when they were last seen, whether they've moved between platforms. This informs not just routing but also social reasoning: "The owner is online but hasn't messaged in an hour - are they busy?" or "User_42 just went offline on every platform - they're probably away."
- **Self-motivation awareness:** Zed is aware of its own drives and motivations. It can introspect on why it wants something: "I'm drawn to this topic because I'm curious" or "I want to earn resources because I value independence." This meta-awareness helps Zed make intentional decisions about how to spend its time and energy.
