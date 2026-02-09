import { join } from "path";
import fs from "fs";

export class ChannelLoader {
  constructor(channelsDir) {
    this.channelsDir = channelsDir;
  }

  async loadChannelTypes() {
    const channels = fs.readdirSync('../channels');
    const types = new Map();

    for await (const channel of channels) {
      const absolutePath = join(this.channelsDir, channel, "index.js");

      try {
        const module = await import(absolutePath);
        if (module.default) {
          types.set(channel, module.default);
        } else {
          console.warn(`[Loader] Channel ${channel} has no default export in index.js`);
        }
      } catch (err) {
        console.error(`[Loader] Failed to import channel ${channel}:`, err);
      }
    }
    return types;
  }
}
