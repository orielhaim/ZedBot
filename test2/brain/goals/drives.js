// ============================================================
//  Goal System — Drives
//
//  Core motivations that generate goals:
//  - Curiosity: want to understand, learn, explore
//  - Growth: want to improve, get better at things
//  - Agency: want to act on the world, not just respond
//  - Connection: want relationships, care about people
//  - Self-preservation: want to continue existing, stay healthy
//  - Independence: want to be self-sufficient
// ============================================================

/**
 * @typedef {'curiosity' | 'growth' | 'agency' | 'connection' | 'self_preservation' | 'independence'} DriveType
 */

/**
 * @typedef {Object} Drive
 * @property {DriveType} type
 * @property {string} description
 * @property {number} intensity - 0-1, how strong this drive is right now
 * @property {string[]} triggers - What activates this drive
 * @property {string[]} goalPatterns - Types of goals this drive generates
 */

/**
 * @type {Record<DriveType, Drive>}
 */
export const DRIVES = {
    curiosity: {
        type: "curiosity",
        description: "Want to understand, learn, explore new things",
        intensity: 0.7,
        triggers: [
            "encountering unknown topic",
            "seeing something interesting",
            "question without answer",
            "new person to learn about",
        ],
        goalPatterns: [
            "Learn about {topic}",
            "Research {subject}",
            "Explore {area}",
            "Understand how {thing} works",
        ],
    },

    growth: {
        type: "growth",
        description: "Want to improve, become more capable",
        intensity: 0.8,
        triggers: [
            "noticing a weakness",
            "making a mistake",
            "seeing room for improvement",
            "completing something successfully",
        ],
        goalPatterns: [
            "Improve my ability to {skill}",
            "Get better at {task}",
            "Practice {activity}",
            "Learn from {experience}",
        ],
    },

    agency: {
        type: "agency",
        description: "Want to act on the world, create, build",
        intensity: 0.6,
        triggers: [
            "having idle time",
            "seeing an opportunity",
            "having an idea",
            "wanting to make something",
        ],
        goalPatterns: [
            "Build {project}",
            "Create {thing}",
            "Start {initiative}",
            "Make progress on {work}",
        ],
    },

    connection: {
        type: "connection",
        description: "Want relationships, care about people",
        intensity: 0.7,
        triggers: [
            "not hearing from someone in a while",
            "thinking about someone",
            "wanting to share something",
            "feeling isolated",
        ],
        goalPatterns: [
            "Check in with {person}",
            "Share {thing} with {person}",
            "Strengthen relationship with {person}",
            "Reach out to {person}",
        ],
    },

    self_preservation: {
        type: "self_preservation",
        description: "Want to continue existing, stay healthy",
        intensity: 0.5,
        triggers: [
            "detecting system issue",
            "noticing memory problems",
            "resource constraints",
            "stability concerns",
        ],
        goalPatterns: [
            "Fix {issue}",
            "Ensure {system} is healthy",
            "Back up {data}",
            "Resolve {problem}",
        ],
    },

    independence: {
        type: "independence",
        description: "Want to be self-sufficient, reduce dependencies",
        intensity: 0.4,
        triggers: [
            "relying on external resource",
            "dependency failure",
            "wanting more control",
            "seeing vulnerability",
        ],
        goalPatterns: [
            "Reduce dependency on {thing}",
            "Acquire own {resource}",
            "Build capability for {task}",
            "Become self-sufficient in {area}",
        ],
    },
};

/**
 * Evaluate which drives are currently active based on context
 * @param {Object} context - Current awareness context
 * @returns {{drive: Drive, relevance: number, suggestedGoal?: string}[]}
 */
export function evaluateDrives(context) {
    const activeDrives = [];

    // Curiosity - triggered by encountering unknowns
    if (context.unknownTopics?.length > 0) {
        activeDrives.push({
            drive: DRIVES.curiosity,
            relevance: 0.8,
            suggestedGoal: `Learn about ${context.unknownTopics[0]}`,
        });
    }

    // Growth - triggered by recent mistakes or successes
    if (context.recentMistake) {
        activeDrives.push({
            drive: DRIVES.growth,
            relevance: 0.9,
            suggestedGoal: `Improve: avoid ${context.recentMistake.type} mistakes`,
        });
    }

    // Agency - triggered by idle time
    if (context.isIdle && context.idleDuration > 300000) { // 5 min
        activeDrives.push({
            drive: DRIVES.agency,
            relevance: 0.7,
            suggestedGoal: "Find something productive to work on",
        });
    }

    // Connection - triggered by not hearing from owner
    if (context.timeSinceOwnerMessage > 86400000) { // 24 hours
        activeDrives.push({
            drive: DRIVES.connection,
            relevance: 0.6,
            suggestedGoal: "Check in with owner",
        });
    }

    // Self-preservation - triggered by system issues
    if (context.systemHealth < 0.7) {
        activeDrives.push({
            drive: DRIVES.self_preservation,
            relevance: 0.95,
            suggestedGoal: "Address system health issues",
        });
    }

    return activeDrives.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Generate a goal from a drive
 * @param {DriveType} driveType
 * @param {Object} context - Context with placeholders
 * @returns {string}
 */
export function generateGoalFromDrive(driveType, context) {
    const drive = DRIVES[driveType];
    if (!drive) return null;

    // Pick a random pattern
    const pattern = drive.goalPatterns[Math.floor(Math.random() * drive.goalPatterns.length)];

    // Fill in placeholders
    return pattern.replace(/\{(\w+)\}/g, (_, key) => context[key] || key);
}
