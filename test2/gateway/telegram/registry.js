// ============================================================
//  Telegram type registry — defines type and how to receive data
// ============================================================

export const type = "telegram";
export const name = "Telegram";

/**
 * How this channel type receives data (for Gateway awareness).
 */
export const receiveMethod = "long_polling";

/**
 * Validate and normalize channel config for this type.
 * Resolves token from env TELEGRAM_BOT_TOKEN if not in config.
 * @param {import("../registry.js").Channel} channel
 * @returns {{ valid: boolean; config?: { channelId: string; token: string }; error?: string }}
 */
export function validateConfig(channel) {
  if (channel.type !== type) {
    return { valid: false, error: `Channel type must be "${type}"` };
  }
  const token = channel.credentials?.token || process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "YOUR_BOT_TOKEN") {
    return { valid: false, error: "Missing token (set credentials.token or TELEGRAM_BOT_TOKEN)" };
  }
  return {
    valid: true,
    config: { channelId: channel.id, token },
  };
}
