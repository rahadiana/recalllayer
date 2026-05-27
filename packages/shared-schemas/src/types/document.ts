/**
 * Document ingestion domain types.
 *
 * A Document is the primary unit of content ingested into the platform.
 * It passes through the pipeline: ingestion → extraction → chunking →
 * embedding → indexing.
 *
 * @module document
 */

import type { DocumentId, Metadata, Timestamp, WorkspaceId } from "./common.js";

// ─── Document Status ────────────────────────────────────────────────────────

/**
 * Lifecycle states for a document.
 *
 * - `pending` – registered, awaiting ingestion.
 * - `ingesting` – source content is being fetched / uploaded.
 * - `extracting` – raw content is being normalized / cleaned.
 * - `chunking` – normalized text is being split into chunks.
 * - `indexing` – chunks are being embedded and indexed.
 * - `ready` – document is fully processed and searchable.
 * - `error` – processing failed; see `error_message`.
 */
export type DocumentStatus =
  | "pending"
  | "ingesting"
  | "extracting"
  | "chunking"
  | "indexing"
  | "ready"
  | "error";

// ─── Document Source ────────────────────────────────────────────────────────

/**
 * Describes the origin of a document.
 */
export interface DocumentSource {
  /** Source type (e.g. "upload", "url", "connector", "api"). */
  type: "upload" | "url" | "connector" | "api";
  /** The originating connector slug when `type === "connector"`. */
  connector?: string;
  /** URL or file path, if applicable. */
  location?: string;
  /** Original filename, if applicable. */
  filename?: string;
  /** MIME type of the source content. */
  mime_type?: string;
  /** Size in bytes. */
  size_bytes?: number;
}

// ─── Document ───────────────────────────────────────────────────────────────

/**
 * A document record stored in the platform.
 */
export interface Document {
  /** Unique document identifier (branded). */
  id: DocumentId;
  /** Workspace that owns this document. */
  workspace_id: WorkspaceId;
  /** Human-readable title. */
  title: string;
  /** Optional longer description or summary. */
  description?: string;
  /** Current processing status. */
  status: DocumentStatus;
  /** Information about where the document came from. */
  source: DocumentSource;
  /** Free-form metadata supplied by the user or connector. */
  metadata: Metadata;
  /** Optional tags for organisation. */
  tags: string[];
  /** The actor (user or API key) that created this document. */
  created_by: string;
  /** Total chunk count after chunking completes. */
  chunk_count?: number;
  /** Error details when status is "error". */
  error_message?: string;
  /** Creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
}

// ─── Document Create / Update DTOs ──────────────────────────────────────────

/**
 * Payload for creating a new document.
 */
export interface CreateDocumentDto {
  /** Human-readable title (required). */
  title: string;
  /** Optional description. */
  description?: string;
  /** Where the content originates from. */
  source: DocumentSource;
  /** Free-form metadata. */
  metadata?: Metadata;
  /** Tags. */
  tags?: string[];
}

/**
 * Payload for updating an existing document.
 */
export interface UpdateDocumentDto {
  /** New title. */
  title?: string;
  /** New description. */
  description?: string;
  metadata?: Metadata;
  tags?: string[];
}
