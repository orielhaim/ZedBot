# Gateway - Architecture

## 1. Purpose
The Gateway connects Zed to the world. It provides senses (incoming messages/media/events) and outbound messages (outgoing messages/media/events).

## 2. Responsibilities
- Run channel gateways (Telegram/WhatsApp/Discord/web).
- Normalize inbound/outbound messages into canonical event format.
- Maintain delivery guarantees (retry, dedupe, ordering).

## 3. Communication
- Connectors per platform (Telegram/Discord/WhatsApp/etc.).
- Message normalization:
  - text, images, audio, docs
  - mentions/groups
  - metadata (sender, thread, timestamp)
- Outbound formatting per platform (markdown quirks, media limits).
- Rate limiting + anti-spam.
- Identity mapping (external user IDs → internal principals).