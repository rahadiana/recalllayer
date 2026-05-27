/**
 * Internal service types for the ingestion service.
 *
 * These types complement the shared-schemas domain types with
 * service-specific data structures (upload sessions, request payloads,
 * configuration, etc.).
 *
 * @module types
 */

import type {
  Document,
  DocumentStatus,
  CreateDocumentDto,
  WorkspaceId,
} from "@memory-platform/shared-schemas";

// ─── Document Record ────────────────────────────────────────────────────────

/**
 * A document record as stored in the ingestion service's database.
 * Extends the shared Document type with ingestion-specific fields.
 */
export type DocumentRecord = Document;

// ─── Upload Session ─────────────────────────────────────────────────────────

/**
 * Status of an upload session.
 */
export type UploadSessionStatus = "active" | "completed" | "aborted";

/**
 * Represents a multipart upload session for large files.
 */
export interface UploadSession {
  /** Unique session identifier. */
  id: string;
  /** Workspace that owns this upload. */
  workspace_id: WorkspaceId;
  /** Filename of the source file. */
  filename: string;
  /** MIME type of the file. */
  mime_type: string;
  /** Total size in bytes. */
  total_size: number;
  /** Number of chunks already uploaded. */
  chunks_received: number;
  /** Total expected chunks. */
  total_chunks: number;
  /** Current session status. */
  status: UploadSessionStatus;
  /** Created by actor. */
  created_by: string;
  /** ISO-8601 creation timestamp. */
  created_at: string;
  /** ISO-8601 last update timestamp. */
  updated_at: string;
}

/**
 * Payload for a single uploaded chunk.
 */
export interface UploadChunk {
  /** Index of the chunk (0-based). */
  index: number;
  /** Number of bytes in this chunk. */
  size: number;
}

// ─── Ingest Request ─────────────────────────────────────────────────────────

/**
 * Incoming request body for the POST /internal/documents endpoint.
 */
export interface IngestDocumentRequest {
  /** Workspace that owns the document (required). */
  workspace_id: WorkspaceId;
  /** Document creation payload (validated against CreateDocumentDto). */
  document: CreateDocumentDto;
  /** The actor who initiated the ingestion. */
  created_by: string;
  /** Optional correlation ID for tracing. */
  correlation_id?: string;
}

/**
 * Response returned after successful document ingestion.
 */
export interface IngestDocumentResponse {
  document: DocumentRecord;
  /** Event ID of the published 'document.received' event. */
  event_id: string;
}

// ─── List Documents Query ───────────────────────────────────────────────────

/**
 * Query parameters for listing documents.
 */
export interface ListDocumentsQuery {
  /** Maximum number of documents to return (1–100). */
  limit?: number;
  /** Opaque cursor for pagination (created_at based). */
  cursor?: string;
  /** Optional status filter. */
  status?: DocumentStatus;
}

// ─── Service Configuration ──────────────────────────────────────────────────

/**
 * Configuration for the ingestion service.
 */
export interface IngestionServiceConfig {
  /** Internal HTTP port. */
  port: number;
  /** Postgres connection URL. */
  postgresUrl: string;
  /** Redis connection URL (for queue). */
  redisUrl: string;
  /** Queue key prefix. */
  queuePrefix?: string;
  /** Allowed MIME types for file uploads. */
  allowedMimeTypes: string[];
  /** Maximum document file size in bytes. */
  maxFileSize: number;
  /** Maximum text payload size in bytes. */
  maxTextSize: number;
  /** Maximum upload session total size in bytes. */
  maxUploadSessionSize: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Partial<IngestionServiceConfig> = {
  port: 3001,
  queuePrefix: "ingestion",
  allowedMimeTypes: [
    "text/plain",
    "text/markdown",
    "text/html",
    "application/pdf",
    "application/json",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
    "image/png",
    "image/jpeg",
  ],
  maxFileSize: 50 * 1024 * 1024, // 50 MB
  maxTextSize: 10 * 1024 * 1024, // 10 MB
  maxUploadSessionSize: 500 * 1024 * 1024, // 500 MB
};
