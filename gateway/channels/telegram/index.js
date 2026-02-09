import { TelegramInstance } from './instance.js';
import { TelegramNormalizer } from './normalizer.js';

export default class TelegramChannel {
  constructor() {
    this.instance = null;
    this.normalizer = null;
    this.context = null;
  }

  async init(context) {
    this.context = context;
    this.normalizer = new TelegramNormalizer(context.id);
    this.instance = new TelegramInstance(context.config, context.logger);
    
    await this.instance.init(this.handleMessage.bind(this));
  }

  async start() {
    await this.instance.start();
  }

  async stop() {
    await this.instance.stop();
  }

  async handleMessage(ctx) {
    try {
        const event = this.normalizer.normalize(ctx);
        if (event) {
            this.context.publish(event);
        }
    } catch (error) {
        this.context.logger.error(`[TelegramChannel] Processing error:`, error);
    }
  }

  async send(outboundMessage) {
      const chatId = outboundMessage.targetChatId;
      if (!chatId) throw new Error('Target chat ID required');

      const api = this.instance.api;
      if (!api) throw new Error('Bot instance not active');

      try {
        if (outboundMessage.content.text) {
            await api.sendMessage(chatId, outboundMessage.content.text);
        }
        // TODO: Handle media
      } catch (err) {
          this.context.logger.error(`[TelegramChannel] Send failed:`, err);
          throw err;
      }
  }
}
