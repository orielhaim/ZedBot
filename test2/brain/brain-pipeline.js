// ============================================================
//  Brain Pipeline — Integrated Architecture
//
//  Flow: resolve → storeMessage → decide → buildContext → 
//        reason ↔ execTools → evaluate → dispatch → postProcess
//
//  This pipeline integrates:
//  - BranchManager for conversation management
//  - ProfileManager for identity resolution
//  - ContextBuilder for intelligent prompt assembly
//  - MemoryStore for persistent memory
// ============================================================

import {
    SystemMessage,
    HumanMessage,
    AIMessage,
    ToolMessage,
} from "@langchain/core/messages";
import {
    StateGraph,
    Annotation,
    MemorySaver,
    START,
    END,
} from "@langchain/langgraph";

import { getBranchManager, getProfileManager, getSwitchboardManager } from "./managers/index.js";
import { getMemoryStore } from "./stores/index.js";
import { getContextBuilder } from "./context-builder.js";
import { getHeartManager } from "./heart/index.js";
import { getPresenceModel } from "./presence/index.js";
import { reasoningModel } from "../lib/models.js";
import { executor } from "../lib/executor.js";
import { requestCapability, listCapabilities } from "../lib/skills-tools.js";
import { updateProfile, saveMemory } from "./tools/index.js";
import { createEvent, EVENT_TYPES, createStoredMessage } from "../lib/types.js";

/**
 * @typedef {import('../lib/types.js').ZedEvent} ZedEvent
 * @typedef {import('../lib/types.js').IncomingMessagePayload} IncomingMessagePayload
 * @typedef {import('../lib/types.js').Branch} Branch
 * @typedef {import('../lib/types.js').Profile} Profile
 */

// ============================================================
// State Definition
// ============================================================

const BrainState = Annotation.Root({
    // Input event
    event: Annotation({ reducer: (_, x) => x }),

    // Resolved context
    branch: Annotation({ reducer: (_, x) => x }),
    profile: Annotation({ reducer: (_, x) => x }),

    // Response decision
    shouldRespond: Annotation({ reducer: (_, x) => x, default: () => true }),
    responseReason: Annotation({ reducer: (_, x) => x, default: () => "" }),

    // Assembled context
    contextMessages: Annotation({ reducer: (_, x) => x, default: () => [] }),

    // LLM messages
    messages: Annotation({
        reducer: (curr, next) => {
            if (!curr) return next;
            if (!next) return curr;
            return [...curr, ...next];
        },
        default: () => [],
    }),

    // Response
    finalResponse: Annotation({ reducer: (_, x) => x }),

    // Post-processing data
    factsToExtract: Annotation({ reducer: (_, x) => x, default: () => [] }),
});

// ============================================================
// Tools Setup
// ============================================================

const allTools = [executor, requestCapability, listCapabilities, updateProfile, saveMemory];
const toolsByName = Object.fromEntries(allTools.map((t) => [t.name, t]));
const model = reasoningModel.bindTools(allTools);

// ============================================================
// Pipeline Nodes
// ============================================================

const branchManager = getBranchManager();
const profileManager = getProfileManager();
const switchboardManager = getSwitchboardManager();
const memoryStore = getMemoryStore();
const contextBuilder = getContextBuilder();
const heartManager = getHeartManager();
const presenceModel = getPresenceModel();

/**
 * Node: Resolve branch and profile from incoming event.
 */
async function resolve(state) {
    const event = state.event;
    const { branch, profile, isNew } = branchManager.getOrCreateBranch(event);
    const payload = event.payload;

    // Record presence signal for intelligent routing
    presenceModel.recordSignal({
        profileId: profile.id,
        channelType: payload.channelType,
        channelId: payload.channelId,
        conversationId: payload.conversationId,
    });

    // Notify Heart of message (for emotional reactions)
    const eventType = profile.role === "owner" ? "message.received.owner" : "message.received.stranger";
    heartManager.processEvent({ type: eventType, data: {}, profileId: profile.id });

    console.log(`  📍 resolve: branch=${branch.id.slice(0, 8)}, profile=${profile.displayName}`);

    const instructions = [];
    if (isNew) {
        console.log(`  Hook: New profile detected. Injecting introduction instructions.`);
        instructions.push(
            "SYSTEM HOOK: This is a NEW user you have never met before. You MUST introduce yourself warmly as 'Zed'. Explain briefly that you are an autonomous AI. Ask for their name if not provided. Be welcoming but not overbearing."
        );
    }

    return { branch, profile, instructions };
}

/**
 * Node: Store the incoming message in the branch.
 */
async function storeMessage(state) {
    const { event, branch, profile } = state;
    const payload = event.payload;

    const message = branchManager.addMessage({
        branchId: branch.id,
        senderProfileId: profile.id,
        content: payload.content,
        timestamp: event.timestamp,
        metadata: {
            platform: payload.channelType,
        },
    });

    // Also append to memory buffer for consolidation
    memoryStore.appendToBuffer({
        branchId: branch.id,
        eventType: "message.incoming",
        content: payload.content?.text || "",
        metadata: { profileId: profile.id },
    });

    console.log(`  📥 storeMessage: saved message ${message.id.slice(0, 8)}`);

    return {};
}

/**
 * Node: Decide whether to respond.
 * Based on sender role, branch state, and content.
 */
async function decide(state) {
    const { profile, branch, event } = state;
    const payload = event.payload;

    // Check if profile is blocked
    if (profileManager.isBlocked(profile.id)) {
        console.log(`  🚫 decide: blocked user, ignoring`);
        branchManager.setResponseDecision(branch.id, {
            action: "ignore",
            reason: "User is blocked",
        });
        return { shouldRespond: false, responseReason: "blocked" };
    }

    // Always proceed to reasoning, even for empty/media messages
    // The LLM will decide whether to ignore it or not based on context.
    console.log(`  ✅ decide: will evaluate response`);
    branchManager.setResponseDecision(branch.id, { action: "evaluate" });
    return { shouldRespond: true, responseReason: "" };


}

/**
 * Node: Build context for the model.
 */
async function buildContext(state) {
    const { branch, profile, event } = state;
    const payload = event.payload;

    // Check if we need switchboard (if user asks about other conversations)
    const text = payload.content?.text?.toLowerCase() || "";
    const needsSwitchboard =
        text.includes("who else") ||
        text.includes("other conversation") ||
        text.includes("talking to");

    // Create a temporary stored message for the current input
    const currentMessage = {
        id: "current",
        branchId: branch.id,
        senderProfileId: profile.id,
        content: payload.content,
        timestamp: event.timestamp,
    };

    const { messages: contextMessages, contextReport } = await contextBuilder.buildConversationContext({
        branch,
        profile,
        currentMessage,
        includeSwitchboard: needsSwitchboard,
        instructions: state.instructions || [], // Pass instructions from state
    });

    console.log(
        `  🧠 buildContext: ${contextReport.totalTokens} tokens, ${contextReport.memoriesIncluded} memories`
    );

    // Add the current user message
    let messageContent = payload.content?.text || "";
    if (!messageContent.trim()) {
        messageContent = "[User sent a message with no text content. This might be an image, sticker, or system event. Decide how to respond based on context.]";
    }
    const userMessage = new HumanMessage(messageContent);

    return {
        contextMessages,
        messages: [...contextMessages, userMessage],
    };
}

/**
 * Node: Run the reasoning model.
 */
async function reason(state) {
    const response = await model.invoke(state.messages);

    const label = response.tool_calls?.length
        ? `→ ${response.tool_calls.map((t) => t.name).join(", ")}`
        : "→ final response";
    console.log(`  💭 reason ${label}`);

    return { messages: [response] };
}

/**
 * Node: Execute tool calls.
 */
async function execTools(state) {
    const last = state.messages.at(-1);
    if (!last?.tool_calls?.length) return { messages: [] };

    const results = [];

    for (const tc of last.tool_calls) {
        const fn = toolsByName[tc.name];

        if (!fn) {
            results.push(
                new ToolMessage({ tool_call_id: tc.id, content: "Unknown tool" })
            );
            continue;
        }

        console.log(`  🔧 ${tc.name}`);

        // Show code preview for executor
        if (tc.name === "executor" && tc.args.code) {
            const lines = tc.args.code.split("\n").slice(0, 3);
            console.log(lines.map((l) => `     | ${l}`).join("\n"));
        }

        const result = await fn.invoke(tc);
        results.push(result);

        // Log executor results
        if (tc.name === "executor") {
            try {
                const p = JSON.parse(
                    typeof result === "string" ? result : result.content
                );
                console.log(
                    p.exitCode === 0
                        ? `     ✅ ${(p.stdout || "").slice(0, 120)}`
                        : `     ❌ exit ${p.exitCode}: ${(p.stderr || "").slice(0, 120)}`
                );
            } catch (_) { }
        }
    }

    return { messages: results };
}

/**
 * Node: Evaluate the response (Heart consistency check).
 * For now, this is a pass-through. Future: LLM-based evaluation.
 */
async function evaluate(state) {
    const last = state.messages.at(-1);

    // Basic evaluation: check if we have a response
    if (!last?.content) {
        console.log(`  ⚠️ evaluate: no response content`);
    } else {
        console.log(`  ✓ evaluate: response looks good`);
    }

    return { finalResponse: last?.content || "" };
}

/**
 * Node: Dispatch response (send via Gateway).
 * Note: Actual sending happens outside this pipeline.
 */
async function dispatch(state) {
    const { branch, finalResponse, event } = state;

    // Store Zed's response in the branch
    if (finalResponse) {
        branchManager.addMessage({
            branchId: branch.id,
            senderProfileId: "zed",
            content: { text: finalResponse },
            timestamp: Date.now(),
        });

        branchManager.recordZedResponse(branch.id);

        // Append to memory buffer
        memoryStore.appendToBuffer({
            branchId: branch.id,
            eventType: "message.outgoing",
            content: finalResponse,
        });
    }

    console.log(`  📤 dispatch: response stored (${finalResponse?.length || 0} chars)`);

    return {};
}

/**
 * Node: Post-process (fact extraction, topic update).
 * Runs async, doesn't block the response.
 */
async function postProcess(state) {
    const { branch, profile, event } = state;
    const payload = event.payload;

    // Update topic based on recent conversation
    const recentMessages = branchManager.getRecentMessages(branch.id, 3);
    if (recentMessages.length > 0) {
        // Simple topic extraction: use last message as topic hint
        const lastText = recentMessages.at(-1)?.content?.text || "";
        if (lastText.length > 10) {
            const topic = lastText.slice(0, 50) + (lastText.length > 50 ? "..." : "");
            branchManager.updateTopic(branch.id, topic);
        }
    }

    // Deliver any pending cross-branch notes
    const pendingNotes = switchboardManager.deliverPendingNotes(branch.id, profile.id);
    if (pendingNotes.length > 0) {
        console.log(`  📬 postProcess: delivered ${pendingNotes.length} cross-branch notes`);
    }

    console.log(`  ✨ postProcess: complete`);

    return {};
}

// ============================================================
// Routing
// ============================================================

function routeAfterDecide(state) {
    return state.shouldRespond ? "buildContext" : "postProcess";
}

function routeAfterReason(state) {
    const last = state.messages.at(-1);
    if (last?._getType?.() === "ai" && last?.tool_calls?.length) {
        return "execTools";
    }
    return "evaluate";
}

// ============================================================
// Graph
// ============================================================

const checkpointer = new MemorySaver();

export const brainPipeline = new StateGraph(BrainState)
    .addNode("resolve", resolve)
    .addNode("storeMessage", storeMessage)
    .addNode("decide", decide)
    .addNode("buildContext", buildContext)
    .addNode("reason", reason)
    .addNode("execTools", execTools)
    .addNode("evaluate", evaluate)
    .addNode("dispatch", dispatch)
    .addNode("postProcess", postProcess)
    .addEdge(START, "resolve")
    .addEdge("resolve", "storeMessage")
    .addEdge("storeMessage", "decide")
    .addConditionalEdges("decide", routeAfterDecide, ["buildContext", "postProcess"])
    .addEdge("buildContext", "reason")
    .addConditionalEdges("reason", routeAfterReason, ["execTools", "evaluate"])
    .addEdge("execTools", "reason")
    .addEdge("evaluate", "dispatch")
    .addEdge("dispatch", "postProcess")
    .addEdge("postProcess", END)
    .compile({ checkpointer });

// ============================================================
// Entry Point
// ============================================================

/**
 * Process an incoming message event through the brain pipeline.
 * @param {ZedEvent<IncomingMessagePayload>} event
 * @param {string} [threadId]
 * @returns {Promise<{response: string, branch: Branch, profile: Profile}>}
 */
export async function processMessage(event, threadId) {
    const computedThreadId = threadId || `${event.payload.channelId}-${event.payload.conversationId}`;

    const result = await brainPipeline.invoke(
        { event },
        { configurable: { thread_id: computedThreadId }, recursionLimit: 30 }
    );

    return {
        response: result.finalResponse || "",
        branch: result.branch,
        profile: result.profile,
    };
}

/**
 * Create an incoming message event from raw data.
 * Helper for Gateway integration.
 */
export function createIncomingMessageEvent(payload) {
    return createEvent(
        EVENT_TYPES.MESSAGE_INCOMING,
        payload,
        { center: "gateway", component: payload.channelType },
        { priority: "normal" }
    );
}
