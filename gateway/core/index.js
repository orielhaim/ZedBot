import fs from "fs";
import { EventEmitter } from 'events';
import { ChannelRegistry } from './registry.js';
import { ChannelRepository } from './repo.js';
import { join } from 'path';
import { brain } from '../../brain/index.js';

export class Gateway extends EventEmitter {
  constructor(rootPath) {
    super();
    this.rootPath = rootPath || process.cwd();

    this.registry = new ChannelRegistry();
    this.repo = new ChannelRepository();

    this.channels = new Map();
  }

  async init() {
    await this.repo.resetAllStatuses();

    await this.loadChannels();

    const configs = await this.repo.getEnabled();

    for (const config of configs) {
      if (!config.enabled) continue;
      const ChannelClass = this.channels.get(config.type);
      if (!ChannelClass) {
        console.warn(`[Gateway] No implementation found for channel type: ${config.type} (ID: ${config.id})`);
        continue;
      }

      await this.startChannel(config, ChannelClass);
    }
  }

  async loadChannels() {
    const channels = fs.readdirSync(join(__dirname, '../channels'));

    for await (const channel of channels) {
      const absolutePath = join(__dirname, '../channels', channel, "index.js");

      try {
        const module = await import(absolutePath);
        if (module.default) {
          this.channels.set(channel, module.default);
        } else {
          console.warn(`[Loader] Channel ${channel} has no default export in index.js`);
        }
      } catch (err) {
        console.error(`[Loader] Failed to import channel ${channel}:`, err);
      }
    }
  }

  async startChannel(config, ChannelClass) {
    try {
      await this.repo.updateStatus(config.id, 'starting');

      const channel = new ChannelClass();

      const context = {
        id: config.id,
        config: config,
        publish: (event) => this.handleEvent(event),
        logger: console
      };

      await channel.init(context);
      await channel.start();

      this.registry.addChannel(config.id, channel);
      await this.repo.updateStatus(config.id, 'active');

      console.log(`[Gateway] Channel ${config.id} is active.`);
    } catch (error) {
      console.error(`[Gateway] Failed to start channel ${config.id}:`, error);
      await this.repo.updateStatus(config.id, 'error');
    }
  }

  async stop() {
    console.log('[Gateway] Stopping...');

    // Stop all running channels
    const entries = Array.from(this.registry.channels.entries());
    for (const [id, channel] of entries) {
      try {
        await channel.stop();
        await this.repo.updateStatus(id, 'stopped');
      } catch (e) {
        console.error(`Error stopping channel ${id}:`, e);
      }
    }

    // Ensure all are marked as stopped in DB (double check)
    await this.repo.resetAllStatuses();
    console.log('[Gateway] Stopped.');
  }

  async handleEvent(event) {
    if (!event.timestamp) event.timestamp = Date.now();
    this.emit('event', event);

    if (event.type === 'message') {
      try {
        const response = await brain.processMessage(event);
        if (response && response.text) {
          const channel = this.registry.getChannel(event.channelId);
          if (channel) {
             // Determine target chat ID based on channel type
             let targetChatId;
             if (event.channelType === 'telegram') {
                 targetChatId = event.raw.chat?.id || event.raw.from?.id;
             }
             
             if (targetChatId) {
                await channel.send({
                    targetChatId: targetChatId,
                    content: { text: response.text }
                });
             } else {
                 console.warn(`[Gateway] Could not determine target chat ID for event ${event.id}`);
             }
          }
        }
      } catch (err) {
        console.error('[Gateway] Error processing message via Brain:', err);
      }
    }
  }

  // --- Internal API ---

  getChannels() {
    return this.registry.getAllChannels();
  }

  getChannel(id) {
    return this.registry.getChannel(id);
  }
}
