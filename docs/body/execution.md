# Body - Execution Engine

## 1. How Code Runs

The Execution Engine is the Body's core component. It receives a code payload from the Brain, runs it, and returns the result.

### 1.1 Execution Flow
1. The Brain emits an execution request containing:
   - The code to execute (a string of TypeScript/JavaScript).
   - An optional execution context: environment variables, working directory, timeout, metadata (which goal or conversation triggered this).
2. The Execution Engine writes the code to a temporary file.
3. The engine spawns a new Bun subprocess (`Bun.spawn`) to execute the file.
4. The subprocess runs with full system access (no sandbox, no restrictions).
5. The engine captures:
   - The return value of the script (whatever the script's final expression or explicit `return` evaluates to).
   - Standard output (anything the script prints).
   - Standard error (any errors or warnings).
   - Exit code.
   - Execution duration.
6. The result is packaged and sent back to the Brain via the internal event fabric.
7. The temporary file is cleaned up (unless Zed decides to keep it).

### 1.2 Why a Subprocess
Code runs in a separate Bun process, not `eval` in the Brain's process. This is not for security (there is none) - it is for isolation and stability:
- A crashing script does not crash the Brain.
- A script that enters an infinite loop can be killed by timeout without affecting the Brain.
- Resource consumption (memory, CPU) is trackable per-execution.
- Multiple scripts can run concurrently (the Brain can kick off several independent executions).

### 1.3 Return Values
The script communicates its result back to the Brain through its return value. This is the only thing the Brain sees from the execution (besides error information if the script fails). This is by design: the return value is the summary, the distillation, the answer. Everything that happened inside the script - files read, APIs called, data processed - stays in the runtime.

Best practice (enforced by convention, not by the system): scripts return structured data (objects, arrays) that the Brain can easily parse and reason about. The Brain writes its code with this in mind: "I'll process everything inside the script and return only what I need to know."

### 1.4 Timeouts and Resource Limits
Each execution has a configurable timeout (default: reasonable for most tasks, overridable for long-running operations). If a script exceeds its timeout, the subprocess is killed and the Brain receives a timeout error.

There are no other resource limits by default. Zed can allocate as much memory, CPU, disk, and network as its server has. If Zed wants to impose limits on itself (for cost management or safety), it can - but the system does not impose them.

### 1.5 Error Handling
When a script fails (throws an exception, exits with non-zero, times out), the Brain receives:
- The error message and stack trace.
- Any partial output the script produced before failing.
- The execution metadata (how long it ran, what triggered it).

The Brain then decides what to do: fix the code and retry, take a different approach, report the failure, or abandon the task. This is normal Brain-level reasoning, not Body-level logic.

## 2. The Execute-Reason-Execute Pattern

Not every task can be accomplished in a single script. Some tasks require intermediate decisions that only the Brain can make. For these, the Body supports the Execute-Reason-Execute (ERE) pattern.

### 2.1 How It Works
1. The Brain writes a script for the first phase of the task.
2. The script runs, gathers information, and returns a summary with a question or set of options for the Brain.
3. The Brain receives the result, reasons about it, and makes a decision.
4. The Brain writes a follow-up script (or provides a continuation) that acts on the decision.
5. The follow-up script runs and returns its result.
6. Repeat as needed until the task is complete.

### 2.2 Example
The Brain wants to clean up old log files but doesn't want to delete everything blindly.

**Phase 1 - Survey:**
```typescript
import { readdir, stat } from 'node:fs/promises'
const files = await readdir('/data/logs')
const old = []
const now = Date.now()
for (const f of files) {
  const s = await stat(`/data/logs/${f}`)
  const ageDays = (now - s.mtimeMs) / 86400000
  if (ageDays > 30) old.push({ name: f, ageDays: Math.floor(ageDays), sizeMB: (s.size / 1e6).toFixed(1) })
}
return { oldFiles: old, totalCount: old.length, totalSizeMB: old.reduce((s, f) => s + parseFloat(f.sizeMB), 0).toFixed(1) }
```

**Brain receives:** `{ oldFiles: [...], totalCount: 47, totalSizeMB: "320.5" }`
**Brain decides:** "47 files, 320MB. I'll delete files older than 60 days and keep the 30-60 day ones."

**Phase 2 - Act:**
```typescript
import { unlink } from 'node:fs/promises'
const targets = [/* list of filenames the Brain selected */]
const results = { deleted: [], failed: [] }
for (const f of targets) {
  try { await unlink(`/data/logs/${f}`); results.deleted.push(f) }
  catch (e) { results.failed.push({ name: f, error: e.message }) }
}
return results
```

**Brain receives:** `{ deleted: ['app-old.log', ...], failed: [] }`

The Brain made the decision. The Body executed. No unnecessary data entered the Brain's context.

### 2.3 When to Use ERE
ERE is used when the task requires judgment at intermediate points. If the entire task is mechanical (no decisions needed), a single script suffices. If the task involves exploration followed by a choice, ERE splits the mechanical parts (exploration, execution) from the cognitive parts (choice).

The Brain decides when to use ERE. There is no system-level mechanism that forces it - it is simply how the Brain naturally approaches complex tasks: think, act, observe, think again.

## 3. Long-Running Processes

Some actions are not one-shot scripts. They are long-running processes: a web server, a file watcher, a background job, a data pipeline.

### 3.1 How They Work
The Brain can write and launch a script that runs indefinitely (or for a long time). The Execution Engine spawns it as a background process rather than waiting for it to complete.

The Brain receives:
- Confirmation that the process started.
- A process handle (ID) that can be used to query status, read output, or kill the process.

The Brain can later:
- Check if the process is still running.
- Read its recent output.
- Send it input (via stdin).
- Stop it.

### 3.2 Use Cases
- Zed starts a local web server for a project it's working on.
- Zed launches a data processing pipeline that will run for hours.
- Zed runs a monitoring script that watches for events and emits notifications.
- Zed starts a service that other Nodes or external systems can connect to.

Long-running processes are first-class. Zed is not limited to synchronous request-response scripts.

## 4. Standard Library (`@zed/*`)

The standard library is a set of modules that ship with Zed and provide convenient access to Zed's own infrastructure. They are regular TypeScript modules that Zed's scripts can import. They are not special - Zed could rewrite any of them from scratch. They exist to save time and provide a stable interface to internal systems.

### 4.1 Zed-Created Libraries
Beyond the built-in standard library, Zed creates its own modules over time. When the Brain notices it's writing similar code repeatedly, it can factor it out into a module, save it to the filesystem (e.g., `/zed/libs/my-utils.ts`), and import it in future scripts.

These self-created libraries are stored in Zed's procedural memory as well - the Brain remembers what libraries it has built and what they do. Over time, Zed accumulates a personal toolkit that reflects its own experience and preferences.

Zed can also refactor, improve, and version its own libraries. This is self-improvement in its most concrete form: Zed literally rewrites its own code to make itself better.

## 5. Package Management

Zed has full access to the npm ecosystem via Bun's built-in package manager.

Scripts can use any npm package. If a package is not yet installed, Zed can install it (either as a preparatory step or inline in a script). Packages are installed to Zed's local environment and are available for all future scripts.

This is how Zed acquires new capabilities without architectural changes. Need a PDF parser? `bun add pdf-parse`. Need a Postgres client? `bun add pg`. Need a machine learning library? Install it. The npm ecosystem is Zed's extended toolbox.

Zed can also manage dependencies: update packages, remove unused ones, audit for issues. This is part of self-maintenance.
