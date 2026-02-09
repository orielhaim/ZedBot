// ============================================================
//  Telegram instance (PIM) — one bot per channel; same internal API
// ============================================================

import { Bot } from "grammy";
import { normalize } from "./normalizer.js";

const STATUS = { CONNECTING: "connecting", ACTIVE: "active", ERROR: "error", STOPPED: "stopped" };

/**
 * Create one Telegram channel instance. Same internal API as other types: start, stop, send, getStatus.
 * @param {{ channelId: string; token: string }} config — from validateConfig
 * @param {(event: import("../../lib/canonical.js").InboundEvent) => void} onInbound
 * @returns {import("../../lib/canonical.js").ChannelInstance}
 */
export function createInstance(config, onInbound) {
  const { channelId, token } = config;
  const bot = new Bot(token);

  let status = STATUS.CONNECTING;
  let lastError = null;
  let updatedAt = Date.now();

  function setStatus(next, err = null) {
    status = next;
    lastError = err ?? lastError;
    updatedAt = Date.now();
  }

  bot.on("message", (ctx) => {
    const event = normalize({ channelId, ctx });
    if (event && event.content?.text) {
      onInbound(event);
    }
  });

  bot.catch((err) => {
    setStatus(STATUS.ERROR, err?.message ?? String(err));
  });

  return {
    channelId,

    start() {
      setStatus(STATUS.CONNECTING);
      bot.start().then(
        () => setStatus(STATUS.STOPPED),
        (err) => setStatus(STATUS.ERROR, err?.message ?? String(err))
      );
      // Mark active once polling is running (Grammy doesn't give a clear "ready" signal)
      setStatus(STATUS.ACTIVE);
    },

    stop() {
      setStatus(STATUS.STOPPED);
      return bot.stop();
    },

    /**
     * @param {string|number} conversationId
     * @param {import("../../lib/canonical.js").OutboundContent} content
     */
    async send(conversationId, content) {
      const chatId = String(conversationId);
      await bot.api.sendMessage(chatId, content.text, {
        reply_to_message_id: content.replyToMessageId,
      });
    },

    getStatus() {
      return { status, lastError, updatedAt };
    },
  };
}
