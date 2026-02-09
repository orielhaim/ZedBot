import { Gateway } from './core/index.js';

export { Gateway };
export * from './core/index.js';

import { fileURLToPath } from 'url';

// If run directly, start the gateway
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const gateway = new Gateway();
    gateway.init().catch(console.error);
    
    // Handle shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down...');
        await gateway.stop();
        process.exit(0);
    });
}
