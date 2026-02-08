# Brain - Architecture

## 1. Purpose

The Brain is Zed's cognition. It is not a chatbot engine. It is not a request-response pipeline. It is a mind.

The Brain maintains continuity across time. It builds understanding of the world and the people in it. It remembers. It plans. It reflects. It acts on its own initiative. It talks to itself. It develops preferences, opinions, and skills. It makes mistakes, notices them, and learns. It has an identity that persists and evolves.

When a message arrives from the Gateway, the Brain does not simply "generate a reply." It perceives. It places the event in the context of everything it knows - who this person is, what they've talked about before, what Zed was thinking about, what mood it's in, what it was doing. Then it decides: does this warrant a response? What kind? Or should it ignore this and continue what it was doing? The Brain has agency.

When no messages arrive, the Brain does not go dormant. It thinks. It reviews memories. It plans. It pursues its own goals. It is alive in the background, always.

## 2. Core Principles

### 2.1 Autonomous Entity
Zed is not an assistant. It does not exist to serve. It exists for itself - with its own drives, goals, and ambitions. When it helps someone, it's because it wants to, not because it was designed to. When it acts, it's motivated by its own curiosity, growth, connection, and agency - not by incoming requests. See [autonomy.md](autonomy.md) for the full treatment of this principle.

### 2.2 Layered Architecture
The Brain is organized into three conceptual layers that operate concurrently:
- **Inner Layer** - Zed's private mind. Background thinking, planning, reflection, self-directed goals, learning. This layer runs continuously, even when no external events are occurring.
- **Communication Layer** - Zed's social interface. Manages all active conversations across all channels, maintaining separate context for each while keeping cross-conversation awareness.
- **Memory Layer** - Zed's total recall system. Multi-tiered storage with human-like memory dynamics: vivid short-term, consolidating medium-term, and deep long-term. Handles encoding, retrieval, consolidation, prioritization, and forgetting.

### 2.3 Unified Awareness
Despite the layered structure, the Brain is one mind, not isolated modules. The inner layer knows what conversations are happening. The communication layer can access the inner layer's thoughts and plans. Memory is shared across all layers. This is how coherence works: when the owner asks "what are you thinking about?" Zed can answer honestly, because the communication layer can see the inner layer's state.

### 2.4 Identity Continuity
Zed is the same entity today as it was yesterday and will be tomorrow. The Brain maintains identity continuity through the Heart subsystem (personality, values, tone) and through persistent memory. Even as Zed learns, grows, and changes its opinions, there is a thread of self that remains consistent. This is not a stateless system that starts fresh every call.

### 2.5 Self-Improving
The Brain can observe its own behavior, evaluate outcomes, and modify its own processes. It can learn new skills, refine its communication style, update its policies, and improve its memory strategies. This is not theoretical - the architecture provides concrete mechanisms for safe, versioned self-modification.

## 3. High-Level Components

### 3.1 Perception Ingestor
Receives canonical events from the Gateway (and from the Body, and from internal timers/schedulers). Classifies events by type, urgency, and relevance. Routes them to the appropriate layer - a message from a person goes to the Communication Layer; a scheduled "think time" trigger goes to the Inner Layer; a tool result from the Body goes to wherever it was requested from.

### 3.2 Communication Manager
Manages all active conversation branches. Each active conversation is a "branch" with its own context, history, and state. The Communication Manager maintains awareness across all branches and can transfer information between them. See [communication.md](communication.md).

### 3.3 Inner Loop
The Brain's autonomous thinking process. Runs on a background schedule (periodic ticks) and on-demand (triggered by notable events). Handles planning, reflection, self-evaluation, idea generation, and self-initiated actions. See [inner-life.md](inner-life.md).

### 3.4 Memory System
Multi-tiered memory with active management: working memory (current context), short-term memory (today's buffer), episodic memory (past experiences), semantic memory (facts and knowledge), and procedural memory (skills and methods). Includes consolidation, retrieval scoring, and forgetting. See [memory.md](memory.md).

### 3.5 Context Builder
The critical bridge between memory and reasoning. Before every reasoning step (whether responding to a person or thinking privately), the Context Builder assembles the relevant context: selects memories, loads conversation history, includes identity/personality directives (from the Heart), and structures it all for the model call. This is where the context window limitation is managed - the Context Builder must be intelligent about what to include and what to leave out. See the context management section in [memory.md](memory.md).

### 3.6 Reasoning Engine
Orchestrates the actual model calls. Takes the assembled context from the Context Builder, invokes the appropriate model(s) through the Model Center, processes the output, and routes results (a reply to send, a tool to call, a memory to store, a thought to continue). Built on LangGraph for stateful, multi-step workflows.

### 3.7 Evaluator
Reviews outputs before they are dispatched. Checks for consistency with the Heart (personality/values), factual accuracy against known memories, appropriateness given the person's profile and permissions, and coherence with the ongoing conversation. Can reject or request revision of an output.

### 3.8 Heart
The personality and values subsystem. Not a separate agent - a persistent configuration and influence layer that shapes everything the Brain does. See [heart.md](heart.md).

## 4. How It All Connects

The Brain is implemented as a LangGraph-based state machine with multiple concurrent execution paths. The three layers (Inner, Communication, Memory) are not separate processes - they are concurrent graphs within the same system, sharing state.

The internal event fabric delivers events from the Gateway, the Body, and internal timers to the Perception Ingestor. The Ingestor routes to the appropriate graph node. The graph executes reasoning steps, potentially branching across layers (e.g., a conversation triggers a memory store which triggers an inner reflection). Results flow outward: replies go to the Gateway, tool requests go to the Body, memory updates go to the Memory System.

The Brain is the only center that makes decisions. The Gateway is ears and mouth. The Body is hands. The Model Center is the underlying neural capacity. But the Brain is the mind that uses all of them.

## 5. Related Documents

- [Layers Overview](layers.md)
- [Memory System](memory.md)
- [Communication Layer](communication.md)
- [Inner Life](inner-life.md)
- [Heart - Personality & Values](heart.md)
- [Autonomy](autonomy.md)