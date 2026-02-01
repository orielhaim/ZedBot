# Architecture Draft

## 1. Goals & Non-Goals

### 1.1 Goals
- Modular system - Each part of the system is a tool in itself that can be improved and modified.
- Internal connection - An organized internal communication system that can be understood independently and operated even after drastic changes.
- Primary intelligence - An aware system with an unlimited range of context that develops and improves over time.
- Independent operation - The ability to schedule, act, maintain itself, and improve over time.

### 1.2 Non-Goals
- Not optimizing for the ergonomics of a "single script agent".
- Not chasing every vendor/model feature.
- Not a monolithic application where everything is in one process.

---

## 2. Technology Choice

The technological complex consists of many parts. You can check the tech.md page in each center for details.

[Main Tech](main-tech.md)

---

## 3. Executive Summary

1. **[Model Center](model-center/arch.md)** - a unified internal interface over many external model vendors/types (text, vision, reasoning, embeddings, audio, image generation, etc.), with routing, policy, cost/latency optimization, and observability.
2. **[Brain](brain/arch.md)** - the entity’s cognition: memory, planning, learning loops, context management, self-improvement, and identity continuity.
   - **Heart (inside Brain)** - personality, values, tone, long-term preferences, stable “character” enforcement, and social/ethical constraints.
3. **[Gateway](gateway/arch.md)** - connects Zed to the world. It provides incoming and outgoing messages/media/events.
4. **[Body](body/arch.md)** - lets Zed to interact with the world. It provides actions (tool execution).

All centers communicate via an internal event + RPC fabric with strict schemas, versioning, auditing, and safety gates.