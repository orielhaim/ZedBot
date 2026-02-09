// ============================================================
//  Profile Manager — Profile lifecycle & identity resolution
// ============================================================

import { getProfileStore } from "../stores/index.js";
import { createProfile, PROFILE_ROLES } from "../../lib/types.js";

/**
 * @typedef {import('../../lib/types.js').Profile} Profile
 * @typedef {import('../../lib/types.js').ProfileFact} ProfileFact
 * @typedef {import('../../lib/types.js').PlatformIdentity} PlatformIdentity
 * @typedef {import('../../lib/types.js').IncomingMessagePayload} IncomingMessagePayload
 */

export class ProfileManager {
    constructor() {
        this.store = getProfileStore();
    }

    /**
     * Get a profile by ID.
     * @param {string} profileId
     * @returns {Profile | null}
     */
    getById(profileId) {
        return this.store.getById(profileId);
    }

    /**
     * Resolve or create a profile from an incoming message.
     * This is the main entry point when processing messages.
     * @param {IncomingMessagePayload} payload
     * @returns {Profile}
     */
    resolveFromMessage(payload) {
        const { channelType, channelId, sender } = payload;

        // If we already have a profileId, use it
        if (sender.profileId) {
            const existing = this.store.getById(sender.profileId);
            if (existing) {
                this.store.recordInteraction(existing.id);
                return { profile: existing, isNew: false };
            }
        }

        // Look up by platform identity
        let profile = this.store.getByPlatformIdentity(
            channelType,
            channelId,
            sender.platformId
        );

        if (profile) {
            this.store.recordInteraction(profile.id);
            return { profile, isNew: false };
        }

        // Create new stranger profile
        profile = this.store.create({
            displayName: sender.displayName || `User ${sender.platformId}`,
            role: PROFILE_ROLES.STRANGER,
            identities: [
                {
                    platform: channelType,
                    channelId,
                    platformUserId: sender.platformId,
                    platformUsername: sender.displayName,
                    linkedAt: Date.now(),
                    linkedBy: "auto",
                },
            ],
            patterns: {},
        });

        console.log(`[ProfileManager] Created new profile: ${profile.displayName} (${profile.id})`);
        return { profile, isNew: true };
    }

    /**
     * Get a profile by platform identity.
     * @param {string} platform
     * @param {string} channelId
     * @param {string} platformUserId
     * @returns {Profile | null}
     */
    getByPlatformIdentity(platform, channelId, platformUserId) {
        return this.store.getByPlatformIdentity(platform, channelId, platformUserId);
    }

    /**
     * Update a profile.
     * @param {string} profileId
     * @param {Partial<Profile>} updates
     * @returns {Profile | null}
     */
    update(profileId, updates) {
        return this.store.update(profileId, updates);
    }

    /**
     * Add a fact to a profile.
     * @param {string} profileId
     * @param {Omit<ProfileFact, 'id'>} fact
     * @returns {ProfileFact}
     */
    addFact(profileId, fact) {
        return this.store.addFact(profileId, fact);
    }

    /**
     * Add a platform identity to link profiles across channels.
     * @param {string} profileId
     * @param {PlatformIdentity} identity
     */
    addIdentity(profileId, identity) {
        // Check if this identity already exists
        const existing = this.store.getByPlatformIdentity(
            identity.platform,
            identity.channelId,
            identity.platformUserId
        );

        if (existing) {
            if (existing.id === profileId) {
                // Already linked to this profile
                return;
            }
            // Identity belongs to another profile - merge them
            console.log(`[ProfileManager] Linking profiles: ${profileId} ← ${existing.id}`);
            this.store.linkProfiles(profileId, existing.id);
        } else {
            this.store.addIdentity(profileId, identity);
        }
    }

    /**
     * Link two profiles (merge source into target).
     * @param {string} targetProfileId
     * @param {string} sourceProfileId
     */
    linkProfiles(targetProfileId, sourceProfileId) {
        this.store.linkProfiles(targetProfileId, sourceProfileId);
    }

    /**
     * Change a profile's role.
     * @param {string} profileId
     * @param {string} role
     */
    setRole(profileId, role) {
        this.store.update(profileId, { role });
    }

    /**
     * Get the owner profile(s).
     * @returns {Profile[]}
     */
    getOwners() {
        return this.store.getByRole(PROFILE_ROLES.OWNER);
    }

    /**
     * Check if a profile is the owner.
     * @param {string} profileId
     * @returns {boolean}
     */
    isOwner(profileId) {
        const profile = this.store.getById(profileId);
        return profile?.role === PROFILE_ROLES.OWNER;
    }

    /**
     * Check if a profile is trusted (owner or trusted role).
     * @param {string} profileId
     * @returns {boolean}
     */
    isTrusted(profileId) {
        const profile = this.store.getById(profileId);
        return (
            profile?.role === PROFILE_ROLES.OWNER ||
            profile?.role === PROFILE_ROLES.TRUSTED
        );
    }

    /**
     * Check if a profile is blocked.
     * @param {string} profileId
     * @returns {boolean}
     */
    isBlocked(profileId) {
        const profile = this.store.getById(profileId);
        return profile?.role === PROFILE_ROLES.BLOCKED;
    }

    /**
     * Search profiles.
     * @param {string} query
     * @returns {Profile[]}
     */
    search(query) {
        return this.store.search(query);
    }

    /**
     * Get a compact text summary of a profile for context.
     * @param {string} profileId
     * @returns {string}
     */
    getContextSummary(profileId) {
        const profile = this.store.getById(profileId);
        if (!profile) return "";

        const lines = [];
        lines.push(`**${profile.displayName}** (${profile.role})`);

        // Add key facts
        const keyFacts = profile.facts
            .filter((f) => f.confidence >= 0.7)
            .slice(0, 5)
            .map((f) => `- ${f.content}`);

        if (keyFacts.length > 0) {
            lines.push("Known facts:");
            lines.push(...keyFacts);
        }

        // Add patterns if known
        if (profile.patterns.communicationStyle) {
            lines.push(`Communication style: ${profile.patterns.communicationStyle}`);
        }

        return lines.join("\n");
    }
}

// Singleton instance
let _instance = null;

/**
 * Get the shared ProfileManager instance.
 * @returns {ProfileManager}
 */
export function getProfileManager() {
    if (!_instance) {
        _instance = new ProfileManager();
    }
    return _instance;
}
