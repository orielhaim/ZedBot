// ============================================================
//  Gateway core — manage channel types, instances, and status
// ============================================================

import { loadChannels } from "./registry.js";
import * as telegramType from "./telegram/index.js";

/** @type {Record<string, { validateConfig: (ch: import("./registry.js").Channel) => { valid: boolean; config?: object; error?: string }; createInstance: (config: object, onInbound: (e: import("../lib/canonical.js").InboundEvent) => void) => import("../lib/canonical.js").ChannelInstance }>} */
const TYPE_MODULES = {
  telegram: telegramType,
};

/**
 * @param {Object} [options]
 * @param {string} [options.configPath]
 * @returns {Promise<Gateway>}
 */
export async function startGateway(options = {}) {
  const configPath = options.configPath || "config/channels.json";
  const channels = loadChannels(configPath);

  /** @type {((event: import("../lib/canonical.js").InboundEvent) => void)|null} */
  let inboundListener = null;

  /** @type {Map<string, import("../lib/canonical.js").ChannelInstance>} */
  const instances = new Map();

  for (const ch of channels) {
    if (ch.status !== "active") continue;

    const typeModule = TYPE_MODULES[ch.type];
    if (!typeModule) {
      console.warn(`[Gateway] Unknown channel type "${ch.type}" for channel ${ch.id}`);
      continue;
    }

    const validated = typeModule.validateConfig(ch);
    if (!validated.valid) {
      console.warn(`[Gateway] Skipping channel ${ch.id}: ${validated.error}`);
      continue;
    }

    const instance = typeModule.createInstance(
      validated.config,
      (event) => {
        if (inboundListener) inboundListener(event);
      }
    );
    instances.set(ch.id, instance);
    instance.start();
  }

  const gateway = {
    /** @param {(event: import("../lib/canonical.js").InboundEvent) => void callback */
    onInbound(callback) {
      inboundListener = callback;
    },

    emitInbound(event) {
      if (inboundListener) inboundListener(event);
    },

    /**
     * @param {import("../lib/canonical.js").OutboundEvent} event
     */
    async sendOutbound(event) {
      const instance = instances.get(event.channelId);
      if (!instance) {
        console.warn(`[Gateway] No instance for channel ${event.channelId}`);
        return;
      }
      await instance.send(event.conversationId, event.content);
    },

    /**
     * Status of each channel instance.
     * @returns {Record<string, { status: string; lastError?: string|null; updatedAt: number }>}
     */
    getChannelStatuses() {
      const out = {};
      for (const [channelId, instance] of instances) {
        out[channelId] = instance.getStatus();
      }
      return out;
    },

    /**
     * Get status for one channel.
     * @param {string} channelId
     */
    getChannelStatus(channelId) {
      const instance = instances.get(channelId);
      return instance ? instance.getStatus() : null;
    },
  };

  return gateway;
}
