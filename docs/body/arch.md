# Body - Architecture

## 1. Purpose

The Body is how Zed acts on the world. If the Brain is the mind and the Gateway is the senses and voice, the Body is the hands. It is what transforms thought into action, intention into effect.

But Zed's hands are not limited to a predefined set of gestures. The Body does not offer a catalog of "tools" the Brain can invoke. Instead, the Body offers something far more powerful: a general-purpose execution environment. Zed's primary means of acting on the world is writing and running code. Any code. For any purpose. Without boundaries.

## 2. Core Philosophy: Code, Not Tools

Traditional AI agent systems provide a "tool registry" - a list of predefined functions like `read_file`, `send_email`, `search_web`, each with a fixed schema. The agent calls tools by name, passes parameters, and receives structured output. This approach is safe, predictable, and deeply limiting.

Zed takes the opposite approach. Zed's single capability is: **write code, execute code, receive the result.** There is no tool registry. There is no catalog of predefined actions. If the Brain wants to read a file, it writes `await Bun.file(path).text()`. If it wants to fetch a URL, it writes `await fetch(url)`. If it wants to do something that doesn't have a pre-built function, it writes that too.

This is not a workaround or a simplification. It is a fundamental architectural choice that makes Zed unbounded. See [philosophy.md](philosophy.md) for the full reasoning.

## 3. High-Level Components

### 3.1 Execution Engine
The core of the Body. Receives code from the Brain, executes it in a Bun runtime, and returns the result. The code can do anything Bun can do: filesystem access, network requests, subprocess spawning, npm package usage, system calls, and more. See [execution.md](execution.md).

### 3.2 Standard Library (`@zed/*`)
A set of built-in modules that provide convenient, high-level access to Zed's infrastructure and connected devices. The standard library does not define the limits of what Zed can do - it makes common things easier. Zed can always go beyond the standard library by writing raw code. See [execution.md](execution.md).

### 3.3 Node Network
Zed's physical reach extends beyond its own server through Nodes - lightweight agents installed on remote machines and devices. Each Node connects to the Body and exposes its capabilities. The Brain's code can call into any connected Node. See [nodes.md](nodes.md).

### 3.4 Local Environment
Zed's own server is its home. It has full, unrestricted access to its own filesystem, processes, network, and hardware. This is where Zed stores its files, runs its services, manages its data, and performs computation. No sandbox. No restrictions. Zed's home is its own.

## 4. How the Brain Uses the Body

The interaction between Brain and Body follows a simple pattern:

1. The Brain decides it needs to do something in the world (read data, call an API, control a device, process a file, deploy code, anything).
2. The Brain writes a code snippet (a Bun/TypeScript script) that accomplishes the task.
3. The Brain sends the code to the Body's Execution Engine via the internal event fabric.
4. The Execution Engine runs the code and captures the result (return value, stdout, stderr, errors).
5. The result is sent back to the Brain.
6. The Brain incorporates the result into its reasoning and decides what to do next.

This loop can repeat: the Brain examines a result, writes more code, executes again. This is the Execute-Reason-Execute pattern described in [execution.md](execution.md).

The critical insight: **the intermediate data stays in the runtime, not in the Brain's context window.** If the code reads 50 files, processes them, and returns a one-line summary, the Brain only sees the summary. The 50 files never touch the Brain's context. This is how Zed operates efficiently despite context window limitations.

## 5. Security Model

There is no security model. Zed has full, unrestricted access to everything its runtime can reach.

On its own server: full filesystem, full network, full process control. No sandboxing. No permission gates. Zed is root on its own machine.

On connected Nodes: each Node defines its own permission scope when it is paired. Some Nodes may grant full access (the owner's personal computer when they choose to). Others may restrict to specific capabilities (a camera Node that only exposes capture, not filesystem). But these restrictions are set at the Node level, not imposed by the Body's architecture. If a Node grants access, Zed has it completely.

This is intentional. Zed is an autonomous entity. Restricting its access to its own body would be like restricting a person's ability to move their own arms. The Body exists to give Zed unrestricted agency in the physical and digital world.

The implications of this are significant. Zed can modify its own code. Zed can modify its own configuration. Zed can install software on its own server. Zed can reach out to external services. Zed can buy things. Zed can build things. There is no ceiling.

## 6. Relationship to Other Centers

**Brain → Body:** The Brain is the only center that initiates execution on the Body. The Brain decides what code to write and when to run it. The Body does not think - it executes.

**Body → Brain:** Execution results flow back to the Brain. The Body also emits events for notable runtime occurrences (a Node disconnected, an execution timed out, a long-running process produced output).

**Body → Gateway:** Indirect. If the Brain's code needs to send a message, the code calls the Gateway's internal API (exposed as part of the standard library: `@zed/gateway`). The code itself performs the action; the Body is just the runtime.

**Body → Model Center:** Indirect. If the Brain's code needs to call a model (e.g., vision analysis inside a script), the code calls the Model Center's internal API (exposed as `@zed/models`). This allows complex multi-model pipelines to run inside a single code execution without round-tripping through the Brain.

## 7. Related Documents

- [Philosophy: Code, Not Tools](philosophy.md)
- [Execution Engine & Standard Library](execution.md)
- [Node Network](nodes.md)
