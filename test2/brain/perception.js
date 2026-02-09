// ============================================================
//  Perception Ingestor — receive canonical event, derive branchId, hand to Communication
// ============================================================

/**
 * @param {import("../canonical.js").InboundEvent} event
 * @returns {string}
 */
export function branchIdFromEvent(event) {
  return `${event.channelId}_${event.conversationId}`;
}

/**
 * @param {import("../canonical.js").InboundEvent} event
 * @param {(event: import("../canonical.js").InboundEvent, branchId: string) => Promise<void>} onMessage
 */
export async function handleInbound(event, onMessage) {
  const branchId = branchIdFromEvent(event);
  await onMessage(event, branchId);
}
