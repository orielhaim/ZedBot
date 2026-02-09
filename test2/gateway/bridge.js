// ============================================================
//  Gateway-Brain Bridge — Connects Gateway to Brain Pipeline
//  Transforms Gateway events ↔ Brain events
// ============================================================

import { processMessage, createIncomingMessageEvent } from "../brain/brain-pipeline.js";
import { createEvent, EVENT_TYPES } from "../lib/types.js";

/**
 * Create a connected bridge between Gateway and Brain.
 * @param {ReturnType<import('./index.js').startGateway extends (...args: any[]) => infer R ? R : never>} gateway
 * @returns {{ start: () => void, stop: () => void }}
 */
export function createGatewayBrainBridge(gateway) {
    let active = false;

    /**
     * Transform an old-style InboundEvent to the new ZedEvent format.
     * @param {import('../lib/canonical.js').InboundEvent} inbound
     * @returns {import('../lib/types.js').ZedEvent<import('../lib/types.js').IncomingMessagePayload>}
     */
    function transformInboundEvent(inbound) {
        return createIncomingMessageEvent({
            channelType: inbound.type || "telegram",
            channelId: inbound.channelId,
            conversationId: inbound.conversationId,
            sender: {
                platformId: inbound.sender?.id || inbound.senderId || "unknown",
                displayName: inbound.sender?.name || inbound.senderName || "Unknown",
                mention: inbound.sender?.username || null,
                // profileId will be resolved by ProfileManager
            },
            content: {
                text: inbound.text || "",
                attachments: inbound.attachments || [],
            },
            replyContext: inbound.replyToMessageId
                ? { replyToMessageId: inbound.replyToMessageId }
                : undefined,
        });
    }

    /**
     * Handle an inbound event from the Gateway.
     */
    async function handleInbound(inbound) {
        if (!active) return;

        console.log(`\n[Bridge] Received: "${(inbound.text || "").slice(0, 50)}..."`);

        try {
            // Transform to new event format
            const event = transformInboundEvent(inbound);

            // Process through Brain pipeline
            const { response, branch, profile } = await processMessage(event);

            // Send response if any
            if (response) {
                await gateway.sendOutbound({
                    channelId: inbound.channelId,
                    conversationId: inbound.conversationId,
                    content: { text: response },
                });

                console.log(`[Bridge] Sent response (${response.length} chars) to ${profile.displayName}`);
            } else {
                console.log(`[Bridge] No response for ${profile.displayName}`);
            }
        } catch (error) {
            console.error(`[Bridge] Error processing message:`, error);
        }
    }

    return {
        start() {
            active = true;
            gateway.onInbound(handleInbound);
            console.log("[Bridge] Gateway-Brain bridge started");
        },

        stop() {
            active = false;
            console.log("[Bridge] Gateway-Brain bridge stopped");
        },
    };
}

/**
 * Create the outbound event for sending a response.
 * Utility for programmatic sending outside the normal flow.
 * @param {string} channelId
 * @param {string} conversationId
 * @param {string} text
 */
export function createOutboundResponse(channelId, conversationId, text) {
    return createEvent(
        EVENT_TYPES.MESSAGE_OUTGOING,
        {
            channelId,
            conversationId,
            content: { text },
        },
        { center: "brain", component: "dispatcher" },
        { priority: "normal" }
    );
}
