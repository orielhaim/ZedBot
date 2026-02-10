import { Bot } from 'grammy';
import { run } from '@grammyjs/runner';

export class TelegramInstance {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.bot = null;
    this.runner = null;
  }

  async init(handler) {
    if (!this.config.credentials?.token) {
      throw new Error('Telegram token is required');
    }

    this.bot = new Bot(this.config.credentials.token);

    this.bot.on('message', handler);

    this.bot.catch((err) => {
      this.logger.error(`[TelegramInstance] Error:`, err);
    });

    try {
      await this.bot.init();
      this.logger.log(`[TelegramInstance] Bot initialized: @${this.bot.botInfo.username}`);
    } catch (e) {
      throw new Error(`Failed to initialize Telegram bot: ${e.message}`);
    }
  }

  async start() {
    this.logger.log(`[TelegramInstance] Starting runner...`);

    const runnerOptions = this.config.settings?.runner || {
      runner: {
        fetch: {
          allowed_updates: ["message", "edited_message"]
        }
      }
    };

    this.runner = run(this.bot, runnerOptions);
  }

  async stop() {
    if (this.runner && this.runner.isRunning()) {
      await this.runner.stop();
      this.logger.log(`[TelegramInstance] Runner stopped.`);
    }
  }

  get api() {
    return this.bot ? this.bot.api : null;
  }
}
