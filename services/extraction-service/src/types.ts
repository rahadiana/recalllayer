/**
 * Extraction service internal types.
 *
 * Defines the Extractor contract, result shapes, error types, and
 * configuration options consumed by extractors and the worker.
 *
 * External domain types (ExtractionJob, ExtractedDocument, DocumentSection)
 * are imported from @memory-platform/shared-schemas.
 */

import type {
  DocumentSection,
  Metadata,
} from "@memory-platform/shared-schemas";

// ─── Extraction Result ─────────────────────────────────────────────────────

/**
 * Successful extraction output produced by any Extractor implementation.
 */
export interface ExtractionResult {
  /** Normalised plain-text content. */
  text: string;
  /** Character count of `text`. */
  textLength: number;
  /** Structured sections discovered during extraction. */
  sections: DocumentSection[];
  /** Metadata discovered by the extractor (language, word count, etc.). */
  metadata: Metadata;
  /** MIME type that was used to select the extractor. */
  mimeType: string;
  /** Name of the extraction strategy / engine. */
  strategy: string;
  /** Wall-clock time spent inside the extractor (milliseconds). */
  durationMs: number;
}

// ─── Extraction Error ──────────────────────────────────────────────────────

/**
 * Structured error thrown by an extractor or the extraction pipeline.
 */
export class ExtractionError extends Error {
  /** Machine-readable error code. */
  readonly code: string;
  /** Whether this failure is retryable. */
  readonly retryable: boolean;
  /** Additional diagnostic context. */
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    opts: {
      code?: string;
      retryable?: boolean;
      context?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "ExtractionError";
    this.code = opts.code ?? "EXTRACTION_FAILED";
    this.retryable = opts.retryable ?? false;
    this.context = opts.context ?? {};
  }
}

// ─── Extractors ────────────────────────────────────────────────────────────

/**
 * Configuration passed to every extractor at invocation time.
 */
export interface ExtractionOptions {
  /** Max text length allowed (truncation guard). 0 = unlimited. */
  maxLength?: number;
  /** If true, preserve heading structure via DocumentSection[]. */
  preserveSections?: boolean;
  /** Strategy-specific overrides. */
  config?: Record<string, unknown>;
}

/**
 * Contract that every text extractor must implement.
 *
 * Each implementation targets a single MIME type (or family of types)
 * and transforms raw source content into normalised plain text.
 */
export interface Extractor {
  /** Human-readable strategy name (e.g. "html-cleanse", "md-strip"). */
  readonly strategy: string;
  /** MIME types this extractor can handle. */
  readonly mimeTypes: string[];

  /**
   * Extract plain text from raw source content.
   *
   * @param raw - The raw source bytes/content as a UTF-8 string.
   * @param options - Extraction configuration overrides.
   * @returns Structured extraction result.
   * @throws {ExtractionError} When extraction fails irrecoverably.
   */
  extract(raw: string, options?: ExtractionOptions): ExtractionResult;
}
