import { v4 as uuidv4 } from 'uuid';

export class TelegramNormalizer {
  constructor(channelId) {
    this.channelId = channelId;
  }

  normalize(ctx) {
    if (!ctx.message) return null;
    
    const msg = ctx.message;
    const userId = msg.from?.id.toString();
    
    // Content extraction
    const content = {};
    if (msg.text) {
        content.text = msg.text;
    }
    
    // Media handling (simplified)
    if (msg.photo) {
        const largest = msg.photo[msg.photo.length - 1];
        if (!content.media) content.media = [];
        content.media.push({
            type: 'photo',
            fileId: largest.file_id,
            caption: msg.caption
        });
        if (msg.caption && !content.text) {
             content.text = msg.caption;
        }
    }

    // Sender mapping
    const sender = {
        id: `telegram:${userId}`,
        platformId: userId,
        name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '),
        username: msg.from?.username,
        isBot: msg.from?.is_bot
    };

    return {
        id: uuidv4(),
        type: 'message',
        timestamp: (msg.date || Date.now() / 1000) * 1000,
        channelId: this.channelId,
        channelType: 'telegram',
        sender: sender,
        content: content,
        raw: msg
    };
  }
}
