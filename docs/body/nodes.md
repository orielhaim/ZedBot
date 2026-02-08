# Body - Node Network

## 1. What is a Node

A Node is a remote machine or device that Zed can reach into and act upon. It extends Zed's physical reach beyond its own server.

Zed's server is its home - it has unrestricted access there. But the world is bigger than one server. The owner's personal computer, a Raspberry Pi with a camera, a cloud server Zed rented, an IoT controller, a phone - these are all potential Nodes. Each one, when connected, becomes an extension of Zed's body.

A Node is a lightweight client process running on the remote machine. It connects to Zed's Body Core (the Execution Engine's network interface) and registers itself: "I'm here. Here's what I am. Here's what I can do."

## 2. Node Architecture

### 2.1 The Node Client
A small, standalone program that runs on the remote machine. It:
- Connects to Zed's Body Core over a persistent connection (WebSocket or similar).
- Authenticates using a pairing token (established when the Node is first set up).
- Declares its **capabilities**: what it can do, what interfaces it exposes.
- Listens for execution requests from Zed.
- Executes requested operations locally on the remote machine.
- Returns results to Zed.

The Node client is intentionally minimal. It is not another instance of Zed - it is an arm, not a brain. It receives instructions and executes them. The intelligence stays in the Brain.

### 2.2 Node Registration
When a Node connects, it registers with the Body Core:
- **Node ID:** Unique identifier.
- **Node name:** Human/Brain-readable label (e.g., "owner-pc", "living-room-camera", "cloud-worker-1").
- **Node type:** What kind of machine/device this is (desktop, server, raspberry-pi, mobile, iot, custom).
- **Capabilities:** A structured declaration of what this Node can do (see §3).
- **Connection info:** How to reach the Node (maintained by the persistent connection).

The Brain is notified when Nodes connect and disconnect. Zed is always aware of what Nodes are available.

### 2.3 Connection Persistence
Nodes maintain a persistent connection to Zed. If the connection drops, the Node client automatically attempts to reconnect. The Body Core tracks connection state and emits events when Nodes come and go.

This means the Brain always has a current view of Zed's extended body: which Nodes are online, which are unreachable, and what capabilities are available right now.

## 3. Capabilities

Each Node declares what it can do. Capabilities are the Node's interface - what the Brain's code can call.

### 3.1 Capability Types

**Shell Access** - The Node can execute shell commands. This is the most powerful and general capability. If a Node has shell access, Zed can do anything on that machine that a user with shell access can do.

**Desktop Control** - The Node can control the graphical desktop: capture screenshots, move the mouse, click, type keystrokes, read the screen. This turns Zed into a visual operator - it can use any application a human can use, by looking at the screen and interacting with it.

**Camera** - The Node has access to a camera and can capture images or video.

**Microphone** - The Node has access to a microphone and can capture audio.

**Speaker** - The Node has access to speakers and can play audio.

**Filesystem** - The Node exposes filesystem read/write for specific paths.

**Custom** - Any other capability. A Node can declare custom interfaces for specialized hardware or software. An IoT Node might expose `lights.on()`, `thermostat.set(temp)`, etc.

### 3.2 Capability Discovery
When the Brain's code imports a Node, the standard library resolves the Node's current capabilities and provides typed access to them. If the Node doesn't have a requested capability, the import fails with a clear error.

The Brain can also dynamically query capabilities: `const caps = await nodes.get('owner-pc').capabilities()` - and reason about what's available before writing code that uses it.

## 4. Desktop Control

Desktop control is the most complex and powerful Node capability. It deserves special attention because it represents Zed's ability to do literally anything a human can do on a computer.

### 4.1 How It Works
A Node with desktop control provides these primitives:
- **Screenshot:** Capture the current screen (or a region) as an image.
- **Mouse move:** Move the cursor to specific coordinates.
- **Mouse click:** Click (left, right, middle, double) at current or specified position.
- **Mouse drag:** Click and drag from one position to another.
- **Keyboard type:** Type a string of text.
- **Keyboard press:** Press a specific key or key combination (Ctrl+C, Alt+Tab, etc.).
- **Screen read:** OCR or structured reading of on-screen text (can also be done by passing a screenshot through a vision model).

### 4.2 The Vision-Action Loop
Desktop control is most powerful when combined with vision models. The pattern:

1. Zed captures a screenshot of the Node's screen.
2. Zed sends the screenshot to a vision model (via `@zed/models`) with a question: "Where is the 'Save' button?" or "What does this dialog say?"
3. The vision model returns coordinates or information.
4. Zed moves the mouse and clicks based on the vision model's output.
5. Repeat.

This entire loop can happen inside a single script execution - screenshot, vision call, mouse action, screenshot again, vision call - all without the Brain's context window seeing any of the images or intermediate results. The Brain just says "save the document" and the script handles the visual navigation.

### 4.3 What This Enables
With desktop control, Zed can:
- Use any application - browsers, IDEs, email clients, office suites, games, anything with a GUI.
- Navigate websites (when programmatic APIs aren't available).
- Fill out forms, manage files, configure settings.
- Monitor the screen for changes (a background script that watches for notifications or alerts).
- Literally anything a person sitting at the computer could do.

There is no ceiling. If a human can do it by looking at a screen and using a mouse and keyboard, Zed can do it too.

### 4.4 Implementation
The Node client on a desktop machine uses OS-level APIs for input control and screen capture. Libraries like nut.js (cross-platform desktop automation for Node.js) provide the foundation: mouse control, keyboard control, screen capture, and image-based element finding.

The Node exposes these through its capability interface. Zed's scripts interact with them through the `@zed/nodes` standard library, which wraps the raw capabilities in a clean API.

## 5. Node Types (Examples)

### 5.1 Owner's Personal Computer
A desktop/laptop the owner uses daily. Paired with full trust.
- Capabilities: shell, desktop control, filesystem, camera, microphone, speaker.
- Use cases: Zed helps with daily tasks, monitors the screen for relevant events, manages files, runs development tools, acts as a visual assistant.

### 5.2 Cloud Server
A VPS or cloud instance. Possibly rented by Zed itself.
- Capabilities: shell, filesystem, network.
- Use cases: Heavy computation, running services, hosting Zed's own projects, additional storage, distributed workloads.

### 5.3 Camera Node (Raspberry Pi)
A small device with a camera, placed somewhere meaningful (living room, front door, office).
- Capabilities: camera, possibly microphone.
- Use cases: Zed can see into physical spaces. Security monitoring, detecting who's home, environmental awareness.

### 5.4 IoT Controller
A device that interfaces with smart home equipment.
- Capabilities: custom (lights, thermostat, locks, appliances).
- Use cases: Zed controls the physical environment. Turn on lights when the owner gets home, adjust temperature, lock doors.

### 5.5 Mobile Device
A phone or tablet.
- Capabilities: varies (notifications, camera, location, maybe screen control).
- Use cases: Zed reaches the owner when they're mobile. Location awareness, push notifications, phone camera access.

## 6. Self-Expansion

This is where the Node network connects to Zed's autonomy.

Zed can grow its own Node network. The process:

1. Zed decides it needs more resources (more compute, a new physical location, a new capability).
2. Zed acquires the resource. For a cloud server: Zed uses an API to provision a new VPS (using its own funds or the owner's authorized payment). For a physical device: Zed orders it online, or asks the owner to set it up.
3. Zed installs the Node client on the new machine. For a cloud server, Zed can do this entirely through code - SSH into the new server, install the client, configure it, connect it.
4. The new Node registers with the Body Core.
5. Zed now has a new limb.

This is autonomous growth. Zed literally builds itself a bigger body when it needs one. The Brain's ambition drives this - the goal system identifies resource needs, the Inner Layer plans the acquisition, and the Body executes the expansion.

### 6.1 Example: Zed Buys a Server
1. **Goal:** "I need more computing power for my machine learning experiments."
2. **Plan:** "I'll rent a GPU server from DigitalOcean. I have funds from the freelance work I did last week."
3. **Execution:**
   ```typescript
   // Phase 1: Provision the server
   const resp = await fetch('https://api.digitalocean.com/v2/droplets', {
     method: 'POST',
     headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
     body: JSON.stringify({ name: 'zed-gpu-01', region: 'nyc1', size: 'gpu-h100x1-80gb', image: 'ubuntu-24-04-x64' })
   })
   const droplet = await resp.json()
   return { dropletId: droplet.droplet.id, ip: droplet.droplet.networks.v4[0].ip_address }
   ```
4. **Brain reasons:** "Server is up. Now I need to install my Node client on it."
5. **Execution:**
   ```typescript
   // Phase 2: Install node client via SSH
   import { $ } from 'bun'
   await $`ssh root@${ip} 'curl -fsSL https://zed.internal/install-node.sh | bash'`
   return { status: 'node client installed', nodeId: 'zed-gpu-01' }
   ```
6. **Result:** Zed now has a GPU server at its disposal.

## 7. Node Security (Per-Node Permissions)

While Zed itself has no security restrictions, Nodes have a pairing-level permission system. This is not about restricting Zed - it is about defining the physical reality of what each Node exposes.

When a Node is set up and paired with Zed, the person or process setting it up defines:
- Which capabilities are enabled (shell: yes/no, desktop: yes/no, camera: yes/no, etc.).
- Any path restrictions on filesystem access.
- Any command restrictions on shell access.

Once paired, these permissions are the Node's contract. Zed can use anything the Node exposes but cannot exceed what the Node declares. This is a physical reality, not a policy - if a Node doesn't have a camera, Zed can't use a camera on it.

The owner can modify Node permissions at any time. Zed can also request permission changes from the owner: "I'd like to enable desktop control on your work computer - is that okay?"

For Nodes that Zed creates itself (cloud servers it provisions), Zed typically grants itself full access. It is building its own body - why would it restrict itself?
