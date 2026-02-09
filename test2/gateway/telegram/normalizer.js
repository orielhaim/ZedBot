// ============================================================
//  Telegram normalizer — parse Telegram updates into canonical events
// ============================================================

import { randomUUID } from "crypto";
import { CHANNEL_TYPE_TELEGRAM } from "../../lib/canonical.js";

/**
 * @param {Object} params
 * @param {string} channelId
 * @param {import("grammy").Context} [ctx] — Grammy context (has update, message, from, chat)
 * @returns {import("../../lib/canonical.js").InboundEvent|null}
 */
export function normalize({ channelId, ctx }) {
  const update = ctx?.update ?? ctx;
  if (!update?.message) return null;

  const msg = update.message;
  const from = msg.from;
  const chat = msg.chat;
  const text = typeof msg.text === "string" ? msg.text : "";

  const platformUserId = from?.id ?? "unknown";
  const profileId = String(platformUserId);
  const displayName = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || profileId;

  return {
    id: randomUUID(),
    channelId,
    channelType: CHANNEL_TYPE_TELEGRAM,
    sender: { profileId, platformUserId, displayName },
    conversationId: String(chat.id),
    content: { text: text || undefined },
    timestamp: msg.date ? String(msg.date) : String(Math.floor(Date.now() / 1000)),
    platformMessageId: msg.message_id,
  };
}
