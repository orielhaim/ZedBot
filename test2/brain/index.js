// ============================================================
//  Brain Entry Point — Wires Gateway ↔ Brain Pipeline
//
//  Two modes of operation:
//  1. Reactive: Gateway → Brain (message arrives, Brain responds)
//  2. Proactive: Brain → Gateway (Brain initiates, sends message)
// ============================================================

import { processMessage, createIncomingMessageEvent } from "./brain-pipeline.js";

/** @type {((channelId: string, conversationId: string, text: string) => Promise<void>)|null} */
let sendOutbound = null;

/**
 * Start the Brain with a Gateway connection.
 * @param {Object} gateway
 * @param {(fn: (event: import("../lib/canonical.js").InboundEvent) => void) => void} gateway.onInbound
 * @param {(event: import("../lib/canonical.js").OutboundEvent) => Promise<void>} gateway.sendOutbound
 */
export function startBrain(gateway) {
  // Store send function for proactive messaging
  sendOutbound = async (channelId, conversationId, text) => {
    await gateway.sendOutbound({
      channelId,
      conversationId,
      content: { text },
    });
  };

  // Wire up reactive path: Gateway → Brain
  gateway.onInbound(async (inbound) => {
    console.log("test", inbound)
    console.log(`\n[Brain] ← ${inbound.channelId}: "${(inbound.text || "").slice(0, 50)}..."`);

    try {
      // Transform inbound event to canonical format
      const event = createIncomingMessageEvent({
        channelType: inbound.type || "telegram",
        channelId: inbound.channelId,
        conversationId: inbound.conversationId,
        sender: {
          platformId: inbound.sender?.id || inbound.senderId || "unknown",
          displayName: inbound.sender?.name || inbound.senderName || "Unknown",
          mention: inbound.sender?.username || null,
        },
        content: {
          text: inbound.content?.text || "",
          attachments: inbound.content?.attachments || [],
        },
        replyContext: inbound.replyToMessageId
          ? { replyToMessageId: inbound.replyToMessageId }
          : undefined,
      });

      // Process through Brain pipeline
      const { response, branch, profile } = await processMessage(event);

      // Send response if any
      if (response) {
        await gateway.sendOutbound({
          channelId: inbound.channelId,
          conversationId: inbound.conversationId,
          content: { text: response },
        });
        console.log(`[Brain] → sent ${response.length} chars to ${profile?.displayName || "unknown"}`);
      }
    } catch (err) {
      console.error("[Brain] Error:", err);
      try {
        await gateway.sendOutbound({
          channelId: inbound.channelId,
          conversationId: inbound.conversationId,
          content: { text: "Something went wrong. Please try again." },
        });
      } catch (e) {
        console.error("[Brain] Failed to send error reply:", e);
      }
    }
  });

  console.log("[Brain] Started and connected to Gateway");
}

/**
 * Proactive send: Brain initiates a message to someone.
 * Used by Inner Layer when Zed decides to reach out.
 * @param {string} channelId
 * @param {string} conversationId
 * @param {string} text
 */
export async function sendProactiveMessage(channelId, conversationId, text) {
  if (!sendOutbound) {
    throw new Error("Brain not started - no Gateway connection");
  }
  await sendOutbound(channelId, conversationId, text);
  console.log(`[Brain] Proactive → ${channelId}: "${text.slice(0, 50)}..."`);
}

// Re-export for direct use
export { processMessage, createIncomingMessageEvent } from "./brain-pipeline.js";
