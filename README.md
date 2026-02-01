# "Zed" Project

## Author Background & Inspiration

This project is the tenth (if not more) attempt at an idea that has been in my head since 2023 (or before): not just another "chatbot" system, but a **digital entity**, something composed of multiple systems that collaborate to perceive, decide, act, and remember - all completely independently.

At the time of previous attempts (around the Gemini 1.5 era), the surrounding ecosystem was clearly not ready: model latency, tool reliability, multimodal input/output, long-term connection cost, and operational ergonomics made the full vision impractical. I kept prototyping, but I kept hitting a ceiling where “it won’t work no matter what you do.”

In recent days, I’ve watched **OpenClaw** rapidly accelerate and gain adoption by shipping a thoughtful, working system that connects messaging surfaces (WhatsApp/Telegram/Discord/iMessage) to an agent runtime via a **Gateway + Control Plane** model, with sessions, routing, nodes, and a dashboard. Its success spurs me on because it confirms that building an end-to-end agent system—without the fear of hard engineering—is now possible.

However, my goal is not to replicate the scope of OpenClaw. OpenClaw is a strong example of a *gateway-centric agent bridge.* My goal is a much larger platform: a number of “giant operating systems,” each with separate responsibilities, that together create a coherent and evolving **digital entity.** The ultimate goal of this project is a digital entity that is able to care for itself, operate, evolve, and live **completely independently**.

[Main Architecture](docs/architecture.md)