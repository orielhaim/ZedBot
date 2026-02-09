// ============================================================
//  Zed — Telegram entry point (Gateway + Brain)
// ============================================================

import { startGateway } from "./gateway/index.js";
import { startBrain } from "./brain/index.js";
import { warmup } from "./lib/skills.js";

async function main() {
  console.log("  Initializing Zed (Gateway + Brain)...");
  await warmup();

  const gateway = await startGateway();
  startBrain(gateway);

  console.log("  Zed is running. Telegram bot is listening.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
