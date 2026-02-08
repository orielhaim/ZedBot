// ============================================================
//  Channel Registry — load channels from config
// ============================================================

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DEFAULT_CONFIG_PATH = "config/channels.json";

/**
 * @typedef {Object} ChannelCredentials
 * @property {string} [token]
 */

/**
 * @typedef {Object} Channel
 * @property {string} id
 * @property {string} type
 * @property {string} name
 * @property {ChannelCredentials} credentials
 * @property {string} status
 */

/**
 * Load channel definitions from JSON file.
 * Token can be overridden by env: TELEGRAM_BOT_TOKEN for telegram type.
 * @param {string} [configPath]
 * @returns {Channel[]}
 */
export function loadChannels(configPath = DEFAULT_CONFIG_PATH) {
  const path = configPath.startsWith("/") ? configPath : join(process.cwd(), configPath);
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, "utf-8");
  /** @type {Channel[]} */
  const channels = JSON.parse(raw);
  if (!Array.isArray(channels)) {
    return [];
  }
  return channels;
}
