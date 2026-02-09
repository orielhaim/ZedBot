// ============================================================
//  Zed Brain — Type Definitions
//  Canonical types for events, profiles, branches, memory, etc.
// ============================================================

import { v4 as uuidv4 } from "uuid";

// ============================================================
//  Event Types
// ============================================================

/**
 * @typedef {'message.incoming'|'message.outgoing'|'presence.update'|'branch.created'|'branch.updated'|'branch.dormant'|'branch.closed'|'memory.store'|'memory.retrieve'|'consolidation.trigger'|'inner.tick'|'execution.request'|'execution.result'} EventType
 */

/**
 * @typedef {Object} EventSource
 * @property {'gateway'|'brain'|'body'|'model-center'} center
 * @property {string} [component] - e.g., 'telegram-connector', 'branch-manager'
 */

/**
 * @typedef {Object} EventMetadata
 * @property {string} [correlationId] - Link related events together
 * @property {string} [branchId] - If event belongs to a specific branch
 * @property {string} [profileId] - If event relates to a specific person
 * @property {'urgent'|'normal'|'low'} [priority]
 */

/**
 * @template T
 * @typedef {Object} ZedEvent
 * @property {string} id - UUID unique per event
 * @property {EventType} type
 * @property {number} timestamp - Unix ms
 * @property {EventSource} source
 * @property {T} payload
 * @property {EventMetadata} metadata
 */

// ============================================================
//  Message Payloads
// ============================================================

/**
 * @typedef {Object} MediaAttachment
 * @property {string} [url]
 * @property {string} [type] - 'image', 'video', 'audio', 'document'
 * @property {string} [mimeType]
 * @property {number} [size]
 */

/**
 * @typedef {Object} MessageContent
 * @property {string} [text]
 * @property {MediaAttachment[]} [media]
 */

/**
 * @typedef {Object} MessageSender
 * @property {string} platformId - User ID on the platform
 * @property {string} [profileId] - Zed's internal profile ID (if known)
 * @property {string} displayName
 */

/**
 * @typedef {Object} IncomingMessagePayload
 * @property {'telegram'|'discord'|'whatsapp'|'web'} channelType
 * @property {string} channelId - Specific channel instance ID
 * @property {string} conversationId - DM, group, or thread ID
 * @property {MessageSender} sender
 * @property {MessageContent} content
 * @property {string} [replyTo] - Message ID if this is a reply
 * @property {unknown} raw - Original platform-specific object
 */

/**
 * @typedef {Object} OutgoingMessagePayload
 * @property {string} targetChannelType
 * @property {string} targetChannelId
 * @property {string} targetConversationId
 * @property {MessageContent} content
 * @property {string} branchId - Which branch produced this
 */

// ============================================================
//  Profile Types
// ============================================================

/**
 * @typedef {'owner'|'trusted'|'known'|'stranger'|'blocked'} ProfileRole
 */

/**
 * @typedef {'personal'|'preference'|'relationship'|'technical'|'behavioral'|'contextual'} FactCategory
 */

/**
 * @typedef {Object} PlatformIdentity
 * @property {'telegram'|'discord'|'whatsapp'|'web'} platform
 * @property {string} channelId - Which specific channel
 * @property {string} platformUserId - Their ID on that platform
 * @property {string} [platformUsername]
 * @property {number} linkedAt - When this identity was linked
 * @property {'auto'|'owner'|'self'} linkedBy - How the link was established
 */

/**
 * @typedef {Object} ProfileFact
 * @property {string} id
 * @property {string} content - e.g., "Works as a software engineer"
 * @property {FactCategory} category
 * @property {string} source - Which conversation/event produced this
 * @property {number} confidence - 0-1
 * @property {number} learnedAt
 * @property {number} [lastConfirmed]
 */

/**
 * @typedef {Object} ProfilePatterns
 * @property {{start: number, end: number}[]} [activeHours]
 * @property {string[]} [preferredChannels]
 * @property {string} [communicationStyle] - "formal", "casual", "technical"
 * @property {number} [averageResponseTime]
 * @property {string[]} [topicsOfInterest]
 */

/**
 * @typedef {Object} Profile
 * @property {string} id - Zed's internal UUID
 * @property {PlatformIdentity[]} identities
 * @property {string} displayName - Zed's preferred name for this person
 * @property {ProfileRole} role
 * @property {ProfileFact[]} facts
 * @property {number} firstSeen
 * @property {number} lastSeen
 * @property {number} totalInteractions
 * @property {ProfilePatterns} patterns
 */

// ============================================================
//  Branch Types
// ============================================================

/**
 * @typedef {'active'|'dormant'|'closed'} BranchStatus
 */

/**
 * @typedef {Object} BranchMood
 * @property {string} tone - "casual", "formal", "heated", "playful", etc.
 * @property {number} confidence - 0-1
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} BranchParticipant
 * @property {string} profileId
 * @property {'primary'|'observer'} role
 * @property {number} joinedAt
 */

/**
 * @typedef {Object} StoredMessage
 * @property {string} id
 * @property {string} branchId
 * @property {string} senderProfileId - Profile ID or 'zed'
 * @property {MessageContent} content
 * @property {number} timestamp
 * @property {{replyToId?: string, editedAt?: number, platform?: string}} [metadata]
 */

/**
 * @typedef {{action: 'respond_now'} | {action: 'respond_later', reason: string, revisitAt?: number} | {action: 'acknowledge_silent', reason: string} | {action: 'ignore', reason: string}} ResponseDecision
 */

/**
 * @typedef {Object} PendingAction
 * @property {'waiting_for_user'|'waiting_for_tool'|'waiting_for_decision'} type
 * @property {string} description
 * @property {number} createdAt
 * @property {number} [expiresAt]
 */

/**
 * @typedef {Object} Branch
 * @property {string} id
 * @property {string} channelType
 * @property {string} channelId
 * @property {string} conversationId
 * @property {BranchParticipant[]} participants
 * @property {BranchStatus} status
 * @property {BranchMood} mood
 * @property {string} [currentTopic]
 * @property {StoredMessage[]} messages - Recent messages (raw)
 * @property {string} [summary] - Summary of older messages
 * @property {string} [summaryUpToMessageId]
 * @property {PendingAction[]} pendingActions
 * @property {ResponseDecision} [responseDecision]
 * @property {number} createdAt
 * @property {number} lastActivityAt
 * @property {number} [lastZedResponseAt]
 */

// ============================================================
//  Memory Types
// ============================================================

/**
 * @typedef {'episodic'|'semantic'|'procedural'} MemoryType
 */

/**
 * @typedef {'conversation'|'consolidation'|'reflection'|'observation'|'explicit'} MemorySourceType
 */

/**
 * @typedef {Object} MemorySource
 * @property {MemorySourceType} type
 * @property {string} [branchId]
 * @property {string} [eventId]
 * @property {string} description
 */

/**
 * @typedef {Object} MemoryRecord
 * @property {string} id
 * @property {MemoryType} type
 * @property {string} content - Natural language memory content
 * @property {number} importance - 0-1
 * @property {number} lastAccessed
 * @property {number} accessCount
 * @property {MemorySource} source
 * @property {string[]} relatedProfileIds
 * @property {string[]} relatedBranchIds
 * @property {string[]} tags
 * @property {number[]} embedding - Vector embedding
 * @property {number} createdAt
 * @property {number} [expiresAt]
 * @property {'active'|'archived'|'faded'} status
 */

/**
 * @typedef {Object} EpisodeData
 * @property {number} when
 * @property {string[]} who - Profile IDs involved
 * @property {string} where - Channel/context
 * @property {string} what - Narrative of what happened
 * @property {string} emotionalTone
 * @property {string} significance
 */

/**
 * @typedef {MemoryRecord & {type: 'episodic', episodeData: EpisodeData}} EpisodicMemory
 */

/**
 * @typedef {Object} FactData
 * @property {string} subject
 * @property {string} category
 * @property {number} confidence
 * @property {string} source
 * @property {string} [supersedes] - ID of older fact this replaces
 */

/**
 * @typedef {MemoryRecord & {type: 'semantic', factData: FactData}} SemanticMemory
 */

/**
 * @typedef {Object} ProcedureData
 * @property {string} skill
 * @property {string[]} steps
 * @property {number} version
 * @property {number} [lastUsed]
 * @property {number} effectiveness - 0-1
 * @property {string} [previousVersionId]
 */

/**
 * @typedef {MemoryRecord & {type: 'procedural', procedureData: ProcedureData}} ProceduralMemory
 */

// ============================================================
//  Retrieval Types
// ============================================================

/**
 * @typedef {Object} RetrievalWeights
 * @property {number} recency - α default 1.0
 * @property {number} importance - β default 1.0
 * @property {number} relevance - γ default 1.0
 */

/**
 * @typedef {Object} RetrievalQuery
 * @property {string} queryText
 * @property {number[]} [queryEmbedding]
 * @property {MemoryType} [type]
 * @property {string[]} [profileIds]
 * @property {{start?: number, end?: number}} [timeRange]
 * @property {string[]} [tags]
 * @property {number} [minImportance]
 * @property {RetrievalWeights} [weights]
 * @property {number} limit
 * @property {number} [minScore]
 */

/**
 * @typedef {Object} ScoreBreakdown
 * @property {number} recencyScore
 * @property {number} importanceScore
 * @property {number} relevanceScore
 */

/**
 * @typedef {Object} ScoredMemory
 * @property {MemoryRecord} memory
 * @property {number} score
 * @property {ScoreBreakdown} breakdown
 */

// ============================================================
//  Switchboard Types
// ============================================================

/**
 * @typedef {Object} SwitchboardParticipant
 * @property {string} profileId
 * @property {string} displayName
 * @property {ProfileRole} role
 */

/**
 * @typedef {Object} SwitchboardEntry
 * @property {string} branchId
 * @property {string} channelType
 * @property {SwitchboardParticipant[]} participants
 * @property {string} currentTopic
 * @property {string} mood
 * @property {number} lastActivityAt
 * @property {BranchStatus} status
 * @property {string[]} pendingActions
 * @property {string} [responseDecision]
 */

/**
 * @typedef {Object} CrossBranchNote
 * @property {string} id
 * @property {string} fromBranchId
 * @property {string} [toBranchId]
 * @property {string} [toProfileId]
 * @property {string} content
 * @property {number} createdAt
 * @property {number} [deliveredAt]
 * @property {'pending'|'delivered'|'expired'} status
 */

/**
 * @typedef {Object} SwitchboardState
 * @property {number} timestamp
 * @property {SwitchboardEntry[]} activeBranches
 * @property {CrossBranchNote[]} crossBranchNotes
 */

// ============================================================
//  Context Builder Types
// ============================================================

/**
 * @typedef {Object} ContextReport
 * @property {number} totalTokens
 * @property {number} heartTokens
 * @property {number} conversationTokens
 * @property {number} memoriesIncluded
 * @property {boolean} switchboardIncluded
 * @property {boolean} summaryUsed
 */

/**
 * @typedef {Object} AssembledContext
 * @property {import('@langchain/core/messages').BaseMessage[]} messages
 * @property {ContextReport} contextReport
 */

// ============================================================
//  Helper Functions
// ============================================================

/**
 * Create a new ZedEvent.
 * @template T
 * @param {EventType} type
 * @param {T} payload
 * @param {EventSource} source
 * @param {Partial<EventMetadata>} [metadata]
 * @returns {ZedEvent<T>}
 */
export function createEvent(type, payload, source, metadata = {}) {
    return {
        id: uuidv4(),
        type,
        timestamp: Date.now(),
        source,
        payload,
        metadata: {
            priority: "normal",
            ...metadata,
        },
    };
}

/**
 * Create a new Profile with default values.
 * @param {Partial<Profile> & {displayName: string, identities: PlatformIdentity[]}} data
 * @returns {Profile}
 */
export function createProfile(data) {
    const now = Date.now();
    return {
        id: uuidv4(),
        role: "stranger",
        facts: [],
        firstSeen: now,
        lastSeen: now,
        totalInteractions: 0,
        patterns: {},
        ...data,
    };
}

/**
 * Create a new Branch with default values.
 * @param {Partial<Branch> & {channelType: string, channelId: string, conversationId: string}} data
 * @returns {Branch}
 */
export function createBranch(data) {
    const now = Date.now();
    return {
        id: uuidv4(),
        participants: [],
        status: "active",
        mood: { tone: "neutral", confidence: 0.5, updatedAt: now },
        messages: [],
        pendingActions: [],
        createdAt: now,
        lastActivityAt: now,
        ...data,
    };
}

/**
 * Create a new StoredMessage.
 * @param {Partial<StoredMessage> & {branchId: string, senderProfileId: string, content: MessageContent}} data
 * @returns {StoredMessage}
 */
export function createStoredMessage(data) {
    return {
        id: uuidv4(),
        timestamp: Date.now(),
        ...data,
    };
}

/**
 * Create a new MemoryRecord.
 * @param {Partial<MemoryRecord> & {type: MemoryType, content: string, source: MemorySource}} data
 * @returns {MemoryRecord}
 */
export function createMemoryRecord(data) {
    const now = Date.now();
    return {
        id: uuidv4(),
        importance: 0.5,
        lastAccessed: now,
        accessCount: 0,
        relatedProfileIds: [],
        relatedBranchIds: [],
        tags: [],
        embedding: [],
        createdAt: now,
        status: "active",
        ...data,
    };
}

// ============================================================
//  Constants
// ============================================================

export const CHANNEL_TYPES = {
    TELEGRAM: "telegram",
    DISCORD: "discord",
    WHATSAPP: "whatsapp",
    WEB: "web",
};

export const EVENT_TYPES = {
    // External - from Gateway
    MESSAGE_INCOMING: "message.incoming",
    MESSAGE_OUTGOING: "message.outgoing",
    PRESENCE_UPDATE: "presence.update",
    // Internal - Brain
    BRANCH_CREATED: "branch.created",
    BRANCH_UPDATED: "branch.updated",
    BRANCH_DORMANT: "branch.dormant",
    BRANCH_CLOSED: "branch.closed",
    MEMORY_STORE: "memory.store",
    MEMORY_RETRIEVE: "memory.retrieve",
    CONSOLIDATION_TRIGGER: "consolidation.trigger",
    INNER_TICK: "inner.tick",
    // Internal - Body
    EXECUTION_REQUEST: "execution.request",
    EXECUTION_RESULT: "execution.result",
};

export const PROFILE_ROLES = {
    OWNER: "owner",
    TRUSTED: "trusted",
    KNOWN: "known",
    STRANGER: "stranger",
    BLOCKED: "blocked",
};

export const BRANCH_STATUS = {
    ACTIVE: "active",
    DORMANT: "dormant",
    CLOSED: "closed",
};

export const MEMORY_TYPES = {
    EPISODIC: "episodic",
    SEMANTIC: "semantic",
    PROCEDURAL: "procedural",
};
