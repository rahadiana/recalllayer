/**
 * Extraction pipeline types.
 *
 * The extraction service normalises raw document content into
 * clean, structured text ready for chunking and indexing.
 *
 * @module extraction
 */

import type { DocumentId, Metadata, Timestamp, WorkspaceId } from "./common.js";

// ─── Extraction Status ─────────────────────────────────────────────────────

/**
 * Lifecycle of an extraction job.
 */
export type ExtractionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

// ─── Extraction Job ────────────────────────────────────────────────────────

/**
 * An extraction job represents a single processing run for a document.
 */
export interface ExtractionJob {
  /** Unique job identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Target document. */
  document_id: DocumentId;
  /** Current job status. */
  status: ExtractionStatus;
  /** The extraction strategy / engine used (e.g. "pdf-parser", "html-cleaner"). */
  strategy: string;
  /** Configuration parameters passed to the extraction engine. */
  config: Record<string, unknown>;
  /** Error details if status is "failed". */
  error_message?: string;
  /** Number of retry attempts. */
  retry_count: number;
  /** Maximum allowed retries. */
  max_retries: number;
  /** Job creation timestamp. */
  created_at: Timestamp;
  /** Job start timestamp. */
  started_at?: Timestamp;
  /** Job completion / failure timestamp. */
  completed_at?: Timestamp;
  /** Actor that initiated the job. */
  created_by: string;
}

// ─── Extracted Document ────────────────────────────────────────────────────

/**
 * The output of a successful extraction job – a clean text document.
 */
export interface ExtractedDocument {
  /** Links back to the extraction job. */
  job_id: string;
  /** The source document. */
  document_id: DocumentId;
  /** Clean, normalized text content. */
  text: string;
  /** Number of characters. */
  text_length: number;
  /** Detected language code (ISO 639-1), if determined. */
  language?: string;
  /** Document-level metadata discovered during extraction. */
  metadata: Metadata;
  /** Structured sections / headings detected in the document. */
  sections: DocumentSection[];
  /** Timestamp of extraction. */
  extracted_at: Timestamp;
}

// ─── Document Section ──────────────────────────────────────────────────────

/**
 * A logical section within an extracted document (heading + content).
 */
export interface DocumentSection {
  /** Section heading (empty string for untitled sections). */
  heading: string;
  /** Heading level (1 = H1, 2 = H2, etc.). */
  level: number;
  /** Text content of this section. */
  content: string;
  /** Byte offset within the full extracted text. */
  start_offset: number;
  /** Byte offset within the full extracted text. */
  end_offset: number;
}

// ─── Create Extraction Job DTO ──────────────────────────────────────────────

/**
 * Payload for creating a new extraction job.
 */
export interface CreateExtractionJobDto {
  /** Target document. */
  document_id: DocumentId;
  /** Extraction strategy override (default is auto-detected). */
  strategy?: string;
  /** Configuration overrides. */
  config?: Record<string, unknown>;
}
