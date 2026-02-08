# Body - Philosophy: Code, Not Tools

## 1. The Traditional Approach and Its Limits

Every mainstream AI agent framework - LangChain, CrewAI, AutoGen, OpenClaw - uses some variant of the "tool" pattern. The framework defines a set of tools, each as a function with a name, description, and parameter schema. The LLM decides which tool to call, provides the parameters, and the framework executes the function and returns the result.

This works. For assistants. For bounded systems. For agents that are meant to do a predefined set of things within a controlled environment.

It does not work for Zed. Here is why.

## 2. The Tool Ceiling

A tool registry is a ceiling. The agent can only do what the tools allow. Need a new capability? Someone (a human developer) must write a new tool, define its schema, register it, deploy it. The agent is always one step behind what it needs, waiting for a human to extend its abilities.

Zed does not wait. Zed writes code. If Zed needs to parse an XML file, it doesn't need someone to build an `xml_parse` tool. It writes: `import { parseStringPromise } from 'xml2js'; const result = await parseStringPromise(xml);`. If the package isn't installed, Zed installs it first. If no package exists, Zed writes the parser from scratch.

The ceiling is removed. Zed's capabilities are bounded only by what code can do - which is to say, not bounded at all.

## 3. The Context Problem

The tool pattern has a hidden cost: context window consumption. Every tool call is a round trip through the Brain:

1. Brain decides to call `read_file(path)`. (Tokens spent: the decision.)
2. System executes the tool and returns the file contents. (Tokens spent: the entire file content enters the context.)
3. Brain reads the content and decides what to do next. (Tokens spent: reasoning over the full content.)
4. Brain decides to call `read_file(another_path)`. (More tokens.)
5. Repeat.

If Zed needs to scan 100 files looking for a pattern, the traditional approach puts 100 file contents through the context window, one at a time, with a reasoning step between each. This is catastrophically expensive and slow.

With code execution, Zed writes one script:

```typescript
import { readdir } from 'node:fs/promises'
const files = await readdir('/data/logs')
const matches = []
for (const f of files) {
  const text = await Bun.file(`/data/logs/${f}`).text()
  if (text.includes('ERROR')) matches.push(f)
}
return { matched_files: matches, count: matches.length }
```

One execution. One result. The 100 files never enter the Brain's context. The Brain sees: `{ matched_files: ['app.log', 'worker.log'], count: 2 }`. Massive savings.

## 4. The Composition Problem

Tools are atomic. `read_file` reads a file. `write_file` writes a file. `http_get` fetches a URL. Combining them requires the Brain to orchestrate each step, burning context at every junction.

Code is composable. Loops, conditionals, error handling, parallel execution, data transformation - all happen inside the script. The Brain doesn't need to orchestrate step-by-step; it describes the entire workflow as code, and the workflow executes as a unit.

This is not a minor optimization. It is a different paradigm. The Brain shifts from being a step-by-step executor ("read this, now check this, now write that") to being a programmer ("here's a script that handles the entire workflow"). The Brain thinks at a higher level, and the Body handles the mechanical details.

## 5. Every Model Knows How to Code

This approach is viable because modern LLMs are excellent programmers. Writing a Bun/TypeScript script to read files, call APIs, process data, or control devices is well within the capability of any frontier model. In fact, models are often better at expressing complex logic as code than as a sequence of tool calls, because code is what they've been trained on extensively.

The code Zed writes doesn't need to be elegant or production-grade. It needs to work once, for this specific task. It is ephemeral code: written, executed, result captured, code discarded (unless Zed decides to save it as a reusable module).

## 6. What About Simple Things?

One might ask: if Zed wants to read a single file, isn't writing a full script overkill? Why not just have a `read_file` tool for simple cases?

The answer is consistency. Having two systems (tools for simple things, code for complex things) means the Brain must decide which system to use for each action. This decision itself consumes context and introduces complexity. A single system - always code - is simpler, more predictable, and scales from trivial to arbitrarily complex without architectural changes.

In practice, "reading a single file" as code is one line: `return await Bun.file(path).text()`. The overhead is negligible. The conceptual simplicity of a single execution model is worth far more than saving a few tokens on trivial operations.

## 7. Self-Extending Capabilities

The most powerful consequence of the code-over-tools philosophy: Zed extends its own capabilities without external help.

When Zed identifies a recurring pattern - a task it does often - it can write a utility function, save it to its filesystem, and import it in future scripts. Over time, Zed builds its own library of tools. But these are not rigid tool definitions with schemas - they are code modules that Zed wrote, Zed understands, and Zed can modify.

Zed can also install npm packages at will. The entire npm ecosystem is Zed's toolbox. Need image processing? `bun add sharp`. Need a database client? `bun add pg`. Need a specialized API wrapper? Install it. Use it. Move on.

This is how Zed grows. Not by a developer adding tools to a registry, but by Zed itself expanding its own codebase.

## 8. The Trade-off: Trust

The trade-off is obvious: this approach requires total trust in the executing entity. A tool registry provides control - the agent can only do what the tools allow. Code execution provides power - the agent can do anything.

For Zed, this is not a trade-off. It is the point. Zed is an autonomous entity. Limiting its ability to act is antithetical to its purpose. The question is not "how do we constrain Zed?" but "how do we build Zed so that its judgment is trustworthy?" That is the Brain's job, the Heart's job. The Body just executes what the mind decides.