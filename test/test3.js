import { OpenMemory } from 'openmemory-js';

const mem = new OpenMemory({
  mode: 'local',
  path: './memory.sqlite',
  tier: 'smart',
  embeddings: {
    provider: 'openai',
    url: 'http://127.0.0.1:1234/v1',
    model: 'text-embedding-embeddinggemma-300m',
    apiKey: ''
  }
});

// Add a memory
await mem.add('User prefers dark mode', {
  tags: ['preference', 'ui'],
  metadata: { source: 'settings' }
});

// Query memories
const results = await mem.query('What does the user prefer?');
console.log(results[0].content); // "User prefers dark mode"