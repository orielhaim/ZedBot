# Body - Architecture

## 1. Purpose
The Body lets Zed to interact with the world. It provides actions (tool execution) under strict permissions and auditing.

## 2. Responsibilities
- Execute tools safely (sandboxing, permissions, secrets).
- Provide “device-like” capabilities: filesystem, shell, browser, apps, cloud APIs.

## 3. Actions
- Tool registry and execution runtime.
- Permissions and policies:
  - per principal
  - per workspace
  - per tool category
- Sandboxing:
  - filesystem jail
  - command allowlist
  - network egress control
- Auditing: every action has an event log and replay metadata.