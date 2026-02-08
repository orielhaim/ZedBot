// ============================================================
//  Communication Manager (minimal) — onMessage → mainGraph.invoke → sendOutbound
// ============================================================

import { HumanMessage } from "@langchain/core/messages";
import { mainGraph } from "./main.js";

const RECURSION_LIMIT = 30;

/**
 * @param {Object} deps
 * @param {(event: import("../canonical.js").OutboundEvent) => Promise<void>} deps.sendOutbound
 */
export function createCommunication({ sendOutbound }) {
  /**
   * @param {import("../canonical.js").InboundEvent} event
   * @param {string} branchId
   */
  async function onMessage(event, branchId) {
    const text = event.content?.text?.trim() || "";
    if (!text) return;

    const humanMessage = new HumanMessage(text);

    const result = await mainGraph.invoke(
      { messages: [humanMessage] },
      { configurable: { thread_id: branchId }, recursionLimit: RECURSION_LIMIT }
    );

    const finalAI = result.messages
      .filter((m) => m._getType?.() === "ai" && !m.tool_calls?.length)
      .at(-1);

    const content = finalAI?.content;
    const textOut = typeof content === "string" ? content : content?.[0]?.text ?? "";

    if (textOut) {
      await sendOutbound({
        channelId: event.channelId,
        conversationId: event.conversationId,
        content: {
          text: textOut,
          replyToMessageId: event.platformMessageId,
        },
      });
    }
  }

  return { onMessage };
}
