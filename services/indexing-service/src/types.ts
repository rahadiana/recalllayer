/**
 * Indexing Service — Internal Types
 *
 * Service-specific types extending @memory-platform/shared-schemas.
 * All cross-service types (Chunk, EmbeddingRecord, IndexRecord, etc.)
 * are imported from shared-schemas — do NOT redefine them here.
 */

import type {
  Chunk,
  EmbeddingRecord,
  IndexRecord,
  ChunkingConfig,
  DocumentId,
  WorkspaceId,
  Metadata,
  Timestamp,
  ExtractedDocument,
  Document,
} from "@memory-platform/shared-schemas";

// ─── Re-exports for convenience ────────────────────────────────────────────

export type {
  Chunk,
  EmbeddingRecord,
  IndexRecord,
  ChunkingConfig,
  DocumentId,
  WorkspaceId,
  Metadata,
  Timestamp,
  ExtractedDocument,
  Document,
};

// ─── Chunker Options ────────────────────────────────────────────────────────

/**
 * Configuration passed to the chunking strategy.
 * Mirrors ChunkingConfig from shared-schemas with runtime-friendly defaults.
 */
export interface ChunkerOptions {
  /** Maximum characters per chunk (default: 1500). */
  maxChunkSize: number;
  /** Overlap in characters between consecutive chunks (default: 200). */
  overlapSize: number;
  /** Whether to try to preserve sentence boundaries (default: true). */
  preserveSentences: boolean;
  /** Separator characters used when preserveSentences is enabled. */
  separators: string[];
  /** Chunking strategy identifier. */
  strategy: string;
}

export const DEFAULT_CHUNKER_OPTIONS: ChunkerOptions = {
  maxChunkSize: 1500,
  overlapSize: 200,
  preserveSentences: true,
  separators: ["\n\n", "\n", ". ", "? ", "! ", " ", ""],
  strategy: "fixed",
};

// ─── Embedder Options ───────────────────────────────────────────────────────

/**
 * Configuration for embedding generation.
 */
export interface EmbedderOptions {
  /** Embedding model identifier (e.g. "text-embedding-3-small"). */
  model: string;
  /** Maximum texts per batch request to the embedding API. */
  batchSize: number;
  /** Maximum concurrent embedding requests. */
  concurrency: number;
  /** Max retries on transient failures. */
  maxRetries: number;
}

export const DEFAULT_EMBEDDER_OPTIONS: EmbedderOptions = {
  model: "text-embedding-3-small",
  batchSize: 20,
  concurrency: 5,
  maxRetries: 3,
};

// ─── Indexer Options ────────────────────────────────────────────────────────

/**
 * Configuration for the index writer.
 */
export interface IndexerOptions {
  /** Qdrant collection name for vector storage. */
  vectorCollection: string;
  /** Vector dimension size. */
  vectorDimensions: number;
  /** Distance metric for vector similarity (e.g. "Cosine", "Euclid", "Dot"). */
  vectorDistance: "Cosine" | "Euclid" | "Dot";
  /** Whether to create the vector collection if it doesn't exist. */
  autoCreateCollection: boolean;
}

export const DEFAULT_INDEXER_OPTIONS: IndexerOptions = {
  vectorCollection: "memory_chunks",
  vectorDimensions: 1536,
  vectorDistance: "Cosine",
  autoCreateCollection: true,
};

// ─── Pipeline Context ───────────────────────────────────────────────────────

/**
 * Context passed through the indexing pipeline stages.
 * Carries the original document and extraction result alongside
 * progressively built results.
 */
export interface IndexingContext {
  /** The original document record. */
  document: Document;
  /** The extracted text from the extraction service. */
  extracted: ExtractedDocument;
  /** Correlation ID for tracing (inherited from the triggering event). */
  correlationId: string | null;
}

// ─── Chunk Metadata (extended) ──────────────────────────────────────────────

/**
 * Metadata attached to each chunk during creation.
 */
export interface ChunkMetadata extends Metadata {
  /** Section heading this chunk belongs to (if any). */
  section_heading?: string;
  /** Page number (if extracted from source). */
  page_number?: number;
  /** Position within the source section. */
  position?: number;
}

// ─── Index Result ───────────────────────────────────────────────────────────

/**
 * Result of a successful indexing operation.
 */
export interface IndexingResult {
  /** The document that was indexed. */
  documentId: DocumentId;
  /** Created chunks. */
  chunks: Chunk[];
  /** Created embedding records. */
  embeddings: EmbeddingRecord[];
  /** Created keyword index records. */
  indexRecords: IndexRecord[];
  /** Total time taken (ms). */
  durationMs: number;
}

// ─── Indexing Error ─────────────────────────────────────────────────────────

/**
 * Structured error from the indexing pipeline.
 */
export interface IndexingError {
  /** Stage where the error occurred. */
  stage: "chunking" | "embedding" | "indexing";
  /** Error message. */
  message: string;
  /** Original thrown error. */
  cause?: unknown;
  /** Whether the error is retryable. */
  retryable: boolean;
}
