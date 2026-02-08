// ============================================================
//  Canonical event shapes — shared by Gateway and Brain
//  Inbound: platform → Brain; Outbound: Brain → platform
// ============================================================

/**
 * @typedef {Object} InboundSender
 * @property {string} profileId
 * @property {string|number} platformUserId
 * @property {string} [displayName]
 */

/**
 * @typedef {Object} InboundContent
 * @property {string} [text]
 * @property {Array<{url?: string, type?: string}>} [attachments]
 */

/**
 * @typedef {Object} InboundEvent
 * @property {string} id
 * @property {string} channelId
 * @property {string} channelType
 * @property {InboundSender} sender
 * @property {string|number} conversationId
 * @property {InboundContent} content
 * @property {string|number} timestamp
 * @property {number} [platformMessageId]
 */

/**
 * @typedef {Object} OutboundContent
 * @property {string} text
 * @property {number} [replyToMessageId]
 */

/**
 * @typedef {Object} OutboundEvent
 * @property {string} channelId
 * @property {string|number} conversationId
 * @property {OutboundContent} content
 */

export const CHANNEL_TYPE_TELEGRAM = "telegram";

/**
 * Internal API for every channel type instance (same surface, type-specific behavior).
 * @typedef {Object} ChannelInstance
 * @property {string} channelId
 * @property {() => void} start
 * @property {() => Promise<void>} stop
 * @property {(conversationId: string|number, content: OutboundContent) => Promise<void>} send
 * @property {() => { status: string; lastError?: string|null; updatedAt: number }} getStatus
 */
