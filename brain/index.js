import { ProfileManager } from './profiles.js';
import { SessionManager } from './sessions.js';
import { agent } from './agent.js';

class Brain {
  constructor() {
    this.profiles = new ProfileManager();
    this.sessions = new SessionManager();
  }

  async processMessage(event) {
    const { sender, content } = event;
    const platformId = sender.platformId;
    const platformType = event.channelType;

    // 1. Get/Create Profile
    const profile = await this.profiles.getOrCreate(platformId, platformType, {
      name: sender.name,
      username: sender.username,
      metadata: sender
    });

    // 2. Get/Create Session
    const session = await this.sessions.getOrCreate(profile.id);

    // 3. Invoke Agent
    const userMessage = {
      role: 'user',
      content: content.text || (content.media ? "[Media Message]" : "...")
    };

    const config = { 
      configurable: { 
        thread_id: session.thread_id,
        profile: profile
      } 
    };

    console.log(`[Brain] Processing message for profile ${profile.id} (Thread: ${session.thread_id})`);

    try {
      const result = await agent.invoke(
        { messages: [userMessage] },
        config
      );

      const last = result.messages[result.messages.length - 1];
      const text = typeof last.content === "string"
        ? last.content
        : (last.content ?? []).filter(b => b.type === "text").map(b => b.text).join("");

      return {
        text: text,
      };

    } catch (error) {
      console.error('[Brain] Agent invocation failed:', error);
      return { text: "I'm sorry, I encountered an error processing your request." };
    }
  }
}

export const brain = new Brain();
