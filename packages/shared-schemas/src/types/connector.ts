/**
 * Connector and synchronisation domain types.
 *
 * Connectors bridge external data sources (Google Drive, Notion, Slack,
 * GitHub, etc.) into the platform, keeping documents up-to-date through
 * periodic sync jobs.
 *
 * @module connector
 */

import type { DocumentId, Metadata, Timestamp, WorkspaceId } from "./common.js";

// ─── Connector Account ─────────────────────────────────────────────────────

/**
 * A connector account represents an authenticated connection to an
 * external data source for a specific workspace.
 */
export interface ConnectorAccount {
  /** Unique account identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Connector slug (e.g. "google-drive", "notion", "slack", "github"). */
  connector_type: string;
  /** Human-readable label for this account. */
  label: string;
  /** OAuth credentials or API key reference (never the raw secret). */
  credential_ref: string;
  /** Configuration specific to this connector instance. */
  config: ConnectorConfig;
  /** Current sync state. */
  sync_state: SyncState;
  /** Timestamp of the last successful sync. */
  last_synced_at?: Timestamp;
  /** Account creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
  /** Whether the account is active. */
  is_active: boolean;
}

/**
 * Connector-specific configuration.
 */
export interface ConnectorConfig {
  /** Folders / paths to watch (connector-specific). */
  watched_paths?: string[];
  /** File type filters (e.g. ["pdf", "docx", "txt"]). */
  file_types?: string[];
  /** Maximum file size in bytes to ingest. */
  max_file_size_bytes?: number;
  /** Whether to include sub-folders. */
  recursive?: boolean;
  /** Additional connector-specific settings. */
  settings: Metadata;
}

// ─── Sync Job ───────────────────────────────────────────────────────────────

/**
 * A sync job represents one execution of the connector sync pipeline.
 */
export interface SyncJob {
  /** Unique job identifier. */
  id: string;
  /** Parent connector account. */
  account_id: string;
  /** Workspace scope (denormalised). */
  workspace_id: WorkspaceId;
  /** Current sync status. */
  status: SyncJobStatus;
  /** Sync mode: "full" = re-sync everything, "incremental" = changes only. */
  sync_mode: "full" | "incremental";
  /** Files discovered during the scan phase. */
  discovered_count: number;
  /** Files that were new or changed and required processing. */
  processed_count: number;
  /** Files that were skipped (unchanged or filtered). */
  skipped_count: number;
  /** Files that failed to process. */
  error_count: number;
  /** Error details when status is "failed". */
  error_message?: string;
  /** Sync start timestamp. */
  started_at?: Timestamp;
  /** Sync completion timestamp. */
  completed_at?: Timestamp;
  /** Job creation timestamp. */
  created_at: Timestamp;
}

/**
 * Lifecycle status of a sync job.
 */
export type SyncJobStatus =
  | "pending"
  | "scanning"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

// ─── Sync State ─────────────────────────────────────────────────────────────

/**
 * Persisted sync state for incremental synchronisation.
 *
 * Stores cursor / watermark data that allows the next sync to
 * only pick up changes since the last run.
 */
export interface SyncState {
  /** Opaque cursor returned by the external provider. */
  cursor?: string;
  /** Timestamp of the last successful sync. */
  last_synced_at?: Timestamp;
  /** Checksum / hash map of previously synced resources (for dedup). */
  resource_checksums: Record<string, string>;
  /** Number of syncs performed so far. */
  sync_count: number;
}

// ─── Synced Document ────────────────────────────────────────────────────────

/**
 * A document that was created or updated as a result of a sync job.
 */
export interface SyncedDocument {
  /** The platform document ID. */
  document_id: DocumentId;
  /** The external resource path / URL. */
  external_id: string;
  /** The connector type. */
  connector_type: string;
  /** The sync job that produced this document. */
  sync_job_id: string;
  /** Checksum of the external resource at time of sync. */
  checksum: string;
  /** External resource last-modified timestamp. */
  external_updated_at?: Timestamp;
  /** Sync timestamp. */
  synced_at: Timestamp;
}

// ─── Create Connector Account DTO ───────────────────────────────────────────

/**
 * Payload for registering a new connector account.
 */
export interface CreateConnectorAccountDto {
  /** Connector type slug. */
  connector_type: string;
  /** Human-readable label. */
  label: string;
  /** Encrypted credential reference. */
  credential_ref: string;
  /** Connector-specific configuration. */
  config?: Partial<ConnectorConfig>;
}

// ─── Trigger Sync DTO ──────────────────────────────────────────────────────

/**
 * Payload for manually triggering a sync job.
 */
export interface TriggerSyncDto {
  /** Sync mode (default: "incremental"). */
  sync_mode?: "full" | "incremental";
}
