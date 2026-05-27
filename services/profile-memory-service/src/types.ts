/**
 * Internal service types for the profile memory service.
 *
 * These types complement shared-schemas profile types with
 * service-specific data structures, configuration, and
 * contextual representations for personalization.
 *
 * @module types
 */

import type {
  WorkspaceId,
  UserId,
  UserProfile,
  Preference,
  ProfileFact,
  BehaviorEvent,
  BehaviourSummary,
} from "@memory-platform/shared-schemas";

// ─── Re-export shared types ─────────────────────────────────────────────────

export type {
  WorkspaceId,
  UserId,
  UserProfile,
  Preference,
  ProfileFact,
  BehaviorEvent,
  BehaviourSummary,
};

// ─── Profile Record ──────────────────────────────────────────────────────────

/**
 * A profile record as stored in the profile memory service database.
 * Mirrors the shared UserProfile type.
 */
export type ProfileRecord = UserProfile;

/**
 * A preference record as stored in the database (includes profile link).
 */
export interface PreferenceRecord extends Preference {
  /** Unique preference identifier. */
  id: string;
  /** Owning profile composite key. */
  profile_id: string;
}

/**
 * A behavior event record as stored in the database.
 */
export type BehaviorEventRecord = BehaviorEvent;

/**
 * A profile fact record as stored in the database (includes profile link).
 */
export interface ProfileFactRecord extends ProfileFact {
  /** Owning profile composite key. */
  profile_id: string;
}

// ─── Profile Context ─────────────────────────────────────────────────────────

/**
 * Assembled context for personalizing an LLM interaction.
 *
 * Bundles the user profile, preferences, facts, and behaviour summary
 * so upstream services (e.g. retrieval, API gateway) can inject
 * personalization into prompts.
 */
export interface ProfileContext {
  /** Workspace identifier. */
  workspace_id: WorkspaceId;
  /** User identifier. */
  user_id: UserId;
  /** Display name (if set). */
  display_name?: string;
  /** Resolved preferences (explicit + high-confidence inferred). */
  preferences: Preference[];
  /** Confirmed profile facts. */
  facts: ProfileFact[];
  /** Aggregated behaviour statistics. */
  behaviour_summary: BehaviourSummary;
  /** When the profile was last updated. */
  last_updated_at: string;
}

// ─── Signal Types ────────────────────────────────────────────────────────────

/**
 * A profile signal is a lightweight event representing a user action
 * that may affect their profile or preferences.
 */
export interface ProfileSignal {
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The acting user. */
  user_id: UserId;
  /** Signal category (e.g. "search", "document_view", "feedback", "setting_change"). */
  signal_type: string;
  /** Signal payload. */
  payload: Record<string, unknown>;
  /** Optional session identifier. */
  session_id?: string;
  /** Optional correlation ID for tracing. */
  correlation_id?: string;
}

/**
 * Payload for POST /internal/profiles/signals.
 */
export interface PostSignalsRequest {
  /** Signals to process. */
  signals: ProfileSignal[];
}

/**
 * Response for POST /internal/profiles/signals.
 */
export interface PostSignalsResponse {
  /** Number of signals accepted. */
  accepted: number;
  /** Event IDs of any published profile updates. */
  event_ids: string[];
}

// ─── Detected Pattern ────────────────────────────────────────────────────────

/**
 * A pattern detected from user behavior.
 */
export interface DetectedPattern {
  /** Pattern category (e.g. "response_style", "language", "domain_expertise"). */
  category: string;
  /** The detected pattern value. */
  value: string;
  /** Confidence score. */
  confidence: number;
  /** Evidence IDs supporting this pattern. */
  evidence: string[];
  /** Timestamp when first detected. */
  detected_at: string;
}

// ─── Service Configuration ───────────────────────────────────────────────────

/**
 * Configuration for the profile memory service.
 */
export interface ProfileMemoryServiceConfig {
  /** Internal HTTP port. */
  port: number;
  /** Postgres connection URL. */
  postgresUrl: string;
  /** Redis connection URL (for queue). */
  redisUrl: string;
  /** Queue key prefix. */
  queuePrefix?: string;
  /** Confidence threshold for auto-applying inferred preferences. */
  inferenceConfidenceThreshold: number;
  /** Maximum behavior events retained per profile. */
  maxBehaviorEventsPerProfile: number;
  /** Maximum profile facts per profile. */
  maxFactsPerProfile: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Partial<ProfileMemoryServiceConfig> = {
  port: 3007,
  queuePrefix: "profile",
  inferenceConfidenceThreshold: 0.7,
  maxBehaviorEventsPerProfile: 10_000,
  maxFactsPerProfile: 500,
};
