# Brain - Architecture

## 1. Purpose
The Brain is Zed’s cognition: it maintains continuity, builds understanding over time, manages memory, plans, decides actions, and improves behavior.

## 2. Responsibilities
- Convert raw events (messages, sensor inputs) into internal “thought workflow.”
- Maintain multi-layer memory:
  - **Working memory** (current task)
  - **Episodic memory** (events and experiences)
  - **Semantic memory** (facts and knowledge)
  - **Procedural memory** (skills, policies, playbooks)
- Context management (what to include, when, why).
- Planning and task decomposition.
- Reflection loops (post-action review, error correction).
- Self-improvement pipeline (safe, versioned updates to skills/prompts/policies).
- Delegation to sub-agents.

## 3. Non-Goals
- Direct channel IO (Body).
- Vendor model integration (Model Center).

## 4. Brain Internal Structure (proposed)
### 4.1 Core components
- **Perception Ingestor:** normalizes incoming events into internal representations.
- **Workspace / Task Graph:** active goals, subtasks, deadlines, dependencies.
- **Context Builder:** selects memory + facts to include per reasoning step.
- **Reasoning Engine:** orchestrates model calls, tool calls, and internal steps.
- **Memory Manager:** writes/updates memories, handles consolidation.
- **Evaluator:** checks outputs for correctness, safety, consistency.
- **Learning Loop:** produces “improvement proposals” (new rules, new summaries, new skill updates).

### 4.2 Heart (subsystem)
See section 5.

## 5. Heart Subsystem (Personality & Values)
### 5.1 Purpose
Ensure consistent identity and behavior: values, tone, boundaries, long-term preferences, and style.

### 5.2 Responsibilities
- Personality profile (stable traits).
- Preference model (likes/dislikes, communication style).
- Ethics/safety/value constraints (project-defined).
- Social memory shaping (how it relates to people, trust levels).
- Response “style rendering” (final pass shaping).