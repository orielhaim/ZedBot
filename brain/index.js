// ============================================================
//  Brain wiring — startBrain(gateway): perception → communication → reasoner → sendOutbound
// ============================================================

import { handleInbound } from "./perception.js";
import { createCommunication } from "./communication.js";

/**
 * @param {{ onInbound(fn: (event: import("../canonical.js").InboundEvent) => void): void; sendOutbound(event: import("../canonical.js").OutboundEvent): Promise<void> }} gateway
 */
export function startBrain(gateway) {
  const communication = createCommunication({
    sendOutbound: (event) => gateway.sendOutbound(event),
  });

  gateway.onInbound(async (event) => {
    try {
      await handleInbound(event, communication.onMessage);
    } catch (err) {
      console.error("[Brain] handleInbound error:", err);
      try {
        await gateway.sendOutbound({
          channelId: event.channelId,
          conversationId: event.conversationId,
          content: { text: "Something went wrong. Please try again." },
        });
      } catch (e) {
        console.error("[Brain] Failed to send error reply:", e);
      }
    }
  });
}
