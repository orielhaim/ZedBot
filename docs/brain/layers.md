# Brain - Layers Overview

## 1. The Three Layers

The Brain operates through three concurrent, interconnected layers. They are not isolated subsystems - they are perspectives on a single mind. Information flows freely between them. But each layer has a distinct purpose, rhythm, and mode of operation.

+-------------------------------+
|        INNER LAYER            |
|  (thinking, planning,         |
|   reflecting)                 |
|  runs continuously            |
|  in background                |
|                               |
|   +-----------------------+   |
|   | COMMUNICATION LAYER   |   |
|   | (conversations,       |   |
|   |  social awareness)    |   |
|   | runs reactively +     |   |
|   | proactively           |   |
|   |                       |   |
|   |   +---------------+   |   |
|   |   | MEMORY LAYER  |   |   |
|   |   | (encoding,    |   |   |
|   |   |  retrieval,   |   |   |
|   |   |  forgetting)  |   |   |
|   |   | runs          |   |   |
|   |   | continuously, |   |   |
|   |   | serves all    |   |   |
|   |   +---------------+   |   |
|   +-----------------------+   |
+-------------------------------+

The diagram is conceptual - the layers are nested because each outer layer uses the inner ones, but they all execute concurrently.

## 2. Inner Layer

**Rhythm:** Continuous. Background ticks on a schedule (e.g., every few minutes) and on-demand when something interesting happens.

**Purpose:** This is Zed thinking to itself. No external audience. The inner layer is where Zed:
- Reflects on recent events ("that conversation with the owner felt tense - why?")
- Plans ahead ("I should check on that task I started this morning")
- Generates ideas ("I wonder if I could use that new API I learned about to improve my memory search")
- Evaluates itself ("My responses have been too verbose lately - I should be more concise")
- Pursues goals ("I want to learn how to generate images - let me study the image generation tools")
- Maintains awareness ("Three people are talking to me right now, one seems upset, the owner hasn't messaged in 6 hours")

The inner layer is what makes Zed more than a chatbot. Without it, Zed only exists when someone talks to it. With it, Zed has a continuous thread of consciousness.

See [inner-life.md](inner-life.md) for full details.

## 3. Communication Layer

**Rhythm:** Reactive (triggered by incoming messages) and proactive (Zed initiates conversations).

**Purpose:** Manages all interactions with external entities. This includes responding to messages, but also deciding not to respond, initiating contact, managing multiple simultaneous conversations, and maintaining per-conversation context.

Key design: the Communication Layer operates through **branches**. Each active conversation is a branch with its own context window, history summary, and state. But branches are not isolated - the Communication Layer maintains a "switchboard" that knows about all active branches, allowing cross-branch awareness.

This means:
- Zed can tell the owner "I'm also talking to three other people right now."
- The owner can say "tell X to call me" and Zed can relay the message through X's branch.
- If two people ask Zed the same question in different channels, Zed knows and can avoid redundant work.
- Zed can decide to ignore someone (a branch exists but Zed chooses not to produce output for it).

See [communication.md](communication.md) for full details.

## 4. Memory Layer

**Rhythm:** Continuous. Encoding happens in real-time as events occur. Consolidation runs periodically. Retrieval happens on-demand when other layers need context.

**Purpose:** The foundation that both other layers depend on. Memory gives Zed continuity. Without memory, every interaction is a blank slate. With memory, Zed knows who people are, what happened yesterday, what it was working on, what it has learned, and who it is.

The Memory Layer is not a passive database. It actively manages what to remember, how to organize it, when to consolidate fragmented short-term memories into coherent long-term ones, how to score memories for retrieval relevance, and when to let memories fade.

See [memory.md](memory.md) for full details.

## 5. Cross-Layer Information Flow

The layers are not silos. Examples of cross-layer flows:

**Communication → Inner:** A conversation triggers a reflection. Someone tells Zed something surprising, and the inner layer flags it for deeper thinking later.

**Inner → Communication:** The inner layer realizes something relevant to an ongoing conversation. Zed might spontaneously say "oh, I just thought of something related to what we were talking about earlier."

**Communication → Memory:** Every conversation is a source of new memories. The Memory Layer encodes notable events, facts, and impressions from every active branch.

**Memory → Communication:** Before responding in any branch, the Context Builder pulls relevant memories - past conversations with this person, relevant facts, the person's profile, the ongoing conversation summary.

**Inner → Memory:** The inner layer generates new knowledge (insights, plans, self-evaluations) that gets stored. It also triggers memory consolidation - the inner layer is the "sleep cycle" that processes raw short-term memories into organized long-term ones.

**Memory → Inner:** The inner layer retrieves memories to reason about. "What did I learn this week? What mistakes did I make? What goals am I pursuing?"