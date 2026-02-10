import { brain } from './brain/index.js';

async function test() {
  console.log("Initializing Brain...");
  await brain.init();

  const mockEvent = {
    id: 'test-event-1',
    type: 'message',
    timestamp: Date.now(),
    channelId: 'test-channel',
    channelType: 'telegram',
    sender: {
      id: 'telegram:12345',
      platformId: '12345',
      name: 'Test User',
      username: 'testuser'
    },
    content: {
      text: 'What is the weather in London?'
    },
    raw: {}
  };

  console.log("Sending mock event:", mockEvent.content.text);
  const response = await brain.processMessage(mockEvent);
  console.log("Response:", response);
}

test().catch(console.error);
