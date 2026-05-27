/**
 * User profile and preference memory types.
 *
 * The profile memory service builds and maintains user profiles
 * through behavior events, extracted facts, and explicit preferences.
 *
 * @module profile
 */

import type { Metadata, Timestamp, UserId, WorkspaceId } from "./common.js";

// ─── User Profile ───────────────────────────────────────────────────────────

/**
 * A user profile aggregates preferences, facts, and behaviour
 * patterns for a single user within a workspace.
 */
export interface UserProfile {
  /** Composite key: `{workspace_id}:{user_id}`. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The user this profile belongs to. */
  user_id: UserId;
  /** Display name override. */
  display_name?: string;
  /** Explicit preferences. */
  preferences: Preference[];
  /** Inferred facts about the user. */
  facts: ProfileFact[];
  /** Aggregated behaviour statistics. */
  behaviour_summary: BehaviourSummary;
  /** Free-form metadata. */
  metadata: Metadata;
  /** Creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
}

// ─── Preference ─────────────────────────────────────────────────────────────

/**
 * A single user preference (key-value pair with metadata).
 */
export interface Preference {
  /** Preference key (e.g. "language", "theme", "response_length"). */
  key: string;
  /** Preference value (can be any JSON-serializable value). */
  value: unknown;
  /** Where this preference was set ("explicit" = user set, "inferred" = AI deduced). */
  source: "explicit" | "inferred";
  /** Confidence for inferred preferences (1.0 for explicit). */
  confidence: number;
  /** Last update timestamp. */
  updated_at: Timestamp;
}

// ─── Profile Fact ───────────────────────────────────────────────────────────

/**
 * An inferred fact about a user (e.g. "user works as a software engineer").
 *
 * Facts are extracted from conversation history, documents, and behaviour.
 */
export interface ProfileFact {
  /** Unique fact identifier. */
  id: string;
  /** The fact key / category (e.g. "occupation", "location", "expertise"). */
  key: string;
  /** The fact value. */
  value: unknown;
  /** Evidence chunks (document/chunk IDs) supporting this fact. */
  evidence: string[];
  /** Confidence score (0.0–1.0). */
  confidence: number;
  /** Timestamp when the fact was first observed. */
  observed_at: Timestamp;
  /** Timestamp when the fact was last confirmed/updated. */
  updated_at: Timestamp;
}

// ─── Behavior Event ─────────────────────────────────────────────────────────

/**
 * A single user behaviour event logged into the profile system.
 *
 * These events are aggregated to build a behaviour summary and
 * infer preferences.
 */
export interface BehaviorEvent {
  /** Unique event identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The user who performed the action. */
  user_id: UserId;
  /** Event category (e.g. "search", "click", "view", "feedback"). */
  event_type: string;
  /** Event payload (type-specific data). */
  payload: Record<string, unknown>;
  /** Session identifier for grouping related events. */
  session_id?: string;
  /** Timestamp of the event. */
  occurred_at: Timestamp;
}

// ─── Behaviour Summary ──────────────────────────────────────────────────────

/**
 * Aggregated statistics derived from behaviour events.
 */
export interface BehaviourSummary {
  /** Total number of search queries. */
  total_searches: number;
  /** Total number of documents viewed. */
  total_document_views: number;
  /** Most frequently searched terms. */
  top_search_terms: string[];
  /** Most viewed document categories / tags. */
  top_categories: string[];
  /** Timestamp of the last activity. */
  last_active_at?: Timestamp;
}

// ─── Create / Update DTOs ──────────────────────────────────────────────────

/**
 * Payload for recording a new behaviour event.
 */
export interface RecordBehaviorEventDto {
  /** Event category. */
  event_type: string;
  /** Event-specific data. */
  payload: Record<string, unknown>;
  /** Optional session identifier. */
  session_id?: string;
}

/**
 * Payload for updating a user preference.
 */
export interface UpsertPreferenceDto {
  /** Preference key. */
  key: string;
  /** Preference value. */
  value: unknown;
  /** Source of the preference. */
  source: "explicit" | "inferred";
  /** Confidence (default 1.0 for explicit). */
  confidence?: number;
}
