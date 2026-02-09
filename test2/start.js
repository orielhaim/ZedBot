// ============================================================
//  Zed Brain — Main Entry Point
//
//  Starts the complete autonomous AI system:
//  1. Gateway connection (reactive path)
//  2. Inner Layer (proactive path - constantly running)
//  3. Memory consolidation (periodic)
// ============================================================

import { startBrain, sendProactiveMessage } from "./brain/index.js";
import { startInnerLoop, stopInnerLoop } from "./brain/inner/index.js";
import { getConsolidationService } from "./brain/services/index.js";
import { startGateway } from "./gateway/index.js";

let consolidationInterval = null;

/**
 * Start the complete Zed system
 */
export async function start() {
    console.log("════════════════════════════════════════════════════════════");
    console.log("  ZED BRAIN — Starting autonomous system");
    console.log("════════════════════════════════════════════════════════════");

    // 1. Start Gateway (handles Telegram/other channels)
    console.log("\n[1/4] Starting Gateway...");
    const gateway = await startGateway();

    // 2. Connect Brain to Gateway (reactive path)
    console.log("[2/4] Connecting Brain to Gateway...");
    startBrain(gateway);

    // 3. Start Inner Layer (proactive path - the core!)
    console.log("[3/4] Starting Inner Layer (autonomous background loop)...");
    startInnerLoop();

    // 4. Start periodic memory consolidation
    console.log("[4/4] Starting memory consolidation...");
    scheduleConsolidation();

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  ZED BRAIN — System fully operational");
    console.log("  Inner Layer: Running continuously");
    console.log("  Gateway: Listening for messages");
    console.log("  Memory: Consolidating periodically");
    console.log("════════════════════════════════════════════════════════════\n");

    // Handle graceful shutdown
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

/**
 * Schedule periodic memory consolidation
 */
function scheduleConsolidation() {
    const consolidation = getConsolidationService();

    // Run consolidation every 15 minutes
    consolidationInterval = setInterval(async () => {
        console.log("[Consolidation] Running scheduled consolidation...");
        try {
            const result = await consolidation.consolidate();
            console.log(`[Consolidation] Complete: ${result.stored} memories stored`);
        } catch (e) {
            console.error("[Consolidation] Error:", e);
        }
    }, 15 * 60 * 1000);
}

/**
 * Graceful shutdown
 */
async function shutdown() {
    console.log("\n[Shutdown] Stopping Zed gracefully...");

    // Stop inner loop
    stopInnerLoop();

    // Clear consolidation
    if (consolidationInterval) {
        clearInterval(consolidationInterval);
    }

    // Stop gateway
    // await stopGateway();

    console.log("[Shutdown] Complete. Goodbye!");
    process.exit(0);
}

// Export for external control
export { sendProactiveMessage };

// Auto-start if run directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
    start().catch(console.error);
}