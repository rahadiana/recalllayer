/**
 * Canonical event envelope and event-type definitions for cross-service
 * communication. All async events flowing through the message queue MUST
 * conform to this contract.
 *
 * @module event
 */

import type { Timestamp, WorkspaceId } from "./common.js";

// ─── Event Envelope ─────────────────────────────────────────────────────────

/**
 * Generic event envelope wrapping every message on the platform event bus.
 *
 * @template P - Specific payload type for the event.
 *
 * @field event_id – Unique ULID or UUID for this event instance (for dedup/idempotency).
 * @field event_type – Categorised event type string (e.g. "document.created").
 * @field event_version – Schema version; increment when payload shape changes.
 * @field workspace_id – Tenant/workspace scope (nullable for system-level events).
 * @field actor_id – ID of the user / API key that triggered the event (nullable).
 * @field occurred_at – ISO-8601 UTC timestamp of the event occurrence.
 * @field correlation_id – Groups related events (e.g. a single ingestion pipeline run).
 * @field payload – Type-safe event data.
 */
export interface EventEnvelope<P extends EventPayload = EventPayload> {
  event_id: string;
  event_type: EventType;
  event_version: number;
  workspace_id: WorkspaceId | null;
  actor_id: string | null;
  occurred_at: Timestamp;
  correlation_id: string | null;
  payload: P;
}

// ─── Event Type ─────────────────────────────────────────────────────────────

/**
 * Discriminated union of all event types flowing through the platform.
 *
 * Follows the `{domain}.{action}` naming convention.
 */
export type EventType =
  // Document lifecycle
  | "document.created"
  | "document.updated"
  | "document.deleted"
  | "document.status_changed"
  | "document.ready"

  // Extraction
  | "extraction.job_created"
  | "extraction.job_completed"
  | "extraction.job_failed"

  // Chunking & Indexing
  | "indexing.chunks_created"
  | "indexing.embeddings_generated"
  | "indexing.completed"
  | "indexing.failed"

  // Search
  | "search.query_executed"

  // Graph
  | "graph.entity_created"
  | "graph.entity_updated"
  | "graph.entity_deleted"
  | "graph.relation_created"
  | "graph.relation_deleted"

  // Profile
  | "profile.event_recorded"
  | "profile.fact_updated"

  // Connector / Sync
  | "connector.sync_started"
  | "connector.sync_completed"
  | "connector.sync_failed"

  // Workspace
  | "workspace.created"
  | "workspace.deleted"

  // Generic system
  | "system.health_check";

// ─── Event Payload ──────────────────────────────────────────────────────────

/**
 * Base payload type – all concrete payloads extend this.
 */
export type EventPayload = Record<string, unknown>;

// ─── Named Payload Maps ─────────────────────────────────────────────────────

/**
 * Type-level mapping from event type string to its expected payload shape.
 *
 * Add new entries here as new domain events are introduced.
 */
export interface EventPayloadMap {
  "document.created": DocumentCreatedPayload;
  "document.updated": DocumentUpdatedPayload;
  "document.deleted": DocumentDeletedPayload;
  "document.status_changed": DocumentStatusChangedPayload;
  "document.ready": DocumentReadyPayload;
  "extraction.job_created": ExtractionJobCreatedPayload;
  "extraction.job_completed": ExtractionJobCompletedPayload;
  "extraction.job_failed": ExtractionJobFailedPayload;
  "indexing.chunks_created": IndexingChunksCreatedPayload;
  "indexing.embeddings_generated": IndexingEmbeddingsGeneratedPayload;
  "indexing.completed": IndexingCompletedPayload;
  "indexing.failed": IndexingFailedPayload;
  "search.query_executed": SearchQueryExecutedPayload;
  "graph.entity_created": GraphEntityCreatedPayload;
  "graph.entity_updated": GraphEntityUpdatedPayload;
  "graph.entity_deleted": GraphEntityDeletedPayload;
  "graph.relation_created": GraphRelationCreatedPayload;
  "graph.relation_deleted": GraphRelationDeletedPayload;
  "profile.event_recorded": ProfileEventRecordedPayload;
  "profile.fact_updated": ProfileFactUpdatedPayload;
  "connector.sync_started": ConnectorSyncStartedPayload;
  "connector.sync_completed": ConnectorSyncCompletedPayload;
  "connector.sync_failed": ConnectorSyncFailedPayload;
  "workspace.created": WorkspaceCreatedPayload;
  "workspace.deleted": WorkspaceDeletedPayload;
  "system.health_check": SystemHealthCheckPayload;
}

// ─── Document Event Payloads ────────────────────────────────────────────────

export interface DocumentCreatedPayload {
  document_id: string;
  title: string;
  created_by: string;
}

export interface DocumentUpdatedPayload {
  document_id: string;
  changed_fields: string[];
}

export interface DocumentDeletedPayload {
  document_id: string;
}

export interface DocumentStatusChangedPayload {
  document_id: string;
  previous_status: string;
  new_status: string;
}

export interface DocumentReadyPayload {
  document_id: string;
  chunk_count: number;
}

// ─── Extraction Event Payloads ──────────────────────────────────────────────

export interface ExtractionJobCreatedPayload {
  job_id: string;
  document_id: string;
}

export interface ExtractionJobCompletedPayload {
  job_id: string;
  document_id: string;
  extracted_text_length: number;
}

export interface ExtractionJobFailedPayload {
  job_id: string;
  document_id: string;
  error: string;
}

// ─── Indexing Event Payloads ────────────────────────────────────────────────

export interface IndexingChunksCreatedPayload {
  document_id: string;
  chunk_count: number;
}

export interface IndexingEmbeddingsGeneratedPayload {
  document_id: string;
  embedding_count: number;
}

export interface IndexingCompletedPayload {
  document_id: string;
  chunk_count: number;
}

export interface IndexingFailedPayload {
  document_id: string;
  error: string;
}

// ─── Search Event Payloads ──────────────────────────────────────────────────

export interface SearchQueryExecutedPayload {
  query_id: string;
  query_text: string;
  result_count: number;
  latency_ms: number;
}

// ─── Graph Event Payloads ───────────────────────────────────────────────────

export interface GraphEntityCreatedPayload {
  entity_id: string;
  entity_type: string;
}

export interface GraphEntityUpdatedPayload {
  entity_id: string;
  changed_fields: string[];
}

export interface GraphEntityDeletedPayload {
  entity_id: string;
}

export interface GraphRelationCreatedPayload {
  relation_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
}

export interface GraphRelationDeletedPayload {
  relation_id: string;
}

// ─── Profile Event Payloads ─────────────────────────────────────────────────

export interface ProfileEventRecordedPayload {
  user_id: string;
  event_type: string;
}

export interface ProfileFactUpdatedPayload {
  user_id: string;
  fact_key: string;
}

// ─── Connector Event Payloads ───────────────────────────────────────────────

export interface ConnectorSyncStartedPayload {
  connector_id: string;
  account_id: string;
}

export interface ConnectorSyncCompletedPayload {
  connector_id: string;
  account_id: string;
  documents_synced: number;
}

export interface ConnectorSyncFailedPayload {
  connector_id: string;
  account_id: string;
  error: string;
}

// ─── Workspace Event Payloads ───────────────────────────────────────────────

export interface WorkspaceCreatedPayload {
  workspace_id: string;
  name: string;
}

export interface WorkspaceDeletedPayload {
  workspace_id: string;
}

// ─── System Event Payloads ──────────────────────────────────────────────────

export interface SystemHealthCheckPayload {
  service_name: string;
  status: "healthy" | "degraded" | "unhealthy";
}
