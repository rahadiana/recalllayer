/**
 * Chunking, embedding, and indexing domain types.
 *
 * After extraction, text is split into overlapping chunks, embedded
 * into vector space, and stored in both vector and keyword indexes.
 *
 * @module chunk
 */

import type { DocumentId, EntityId, Metadata, Timestamp, WorkspaceId } from "./common.js";

// ─── Chunk ──────────────────────────────────────────────────────────────────

/**
 * A single text chunk produced by the chunking service.
 *
 * Chunks are the atomic retrieval unit – search results return
 * relevant chunks, which are then assembled into a context window.
 */
export interface Chunk {
  /** Unique chunk identifier. */
  id: string;
  /** Parent document. */
  document_id: DocumentId;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Position of this chunk within the document (0-based). */
  sequence_number: number;
  /** The chunk text content. */
  text: string;
  /** Number of characters. */
  text_length: number;
  /** Chunk-level metadata (e.g. section heading, page number). */
  metadata: Metadata;
  /** Creation timestamp. */
  created_at: Timestamp;
}

// ─── Embedding Record ──────────────────────────────────────────────────────

/**
 * A vector embedding stored for a chunk (or query).
 *
 * Embeddings may be produced by different models – the `model` and
 * `dimensions` fields identify which model was used.
 */
export interface EmbeddingRecord {
  /** Unique embedding identifier. */
  id: string;
  /** The chunk (or entity) this embedding represents. */
  target_id: string;
  /** The type of target (e.g. "chunk", "entity", "query"). */
  target_type: "chunk" | "entity" | "query";
  /** Vector data as a flat float32 array. */
  vector: number[];
  /** Number of dimensions in the vector. */
  dimensions: number;
  /** Embedding model identifier (e.g. "text-embedding-3-small"). */
  model: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Creation timestamp. */
  created_at: Timestamp;
}

// ─── Index Record ───────────────────────────────────────────────────────────

/**
 * A record in the keyword / full-text index.
 *
 * Each chunk may have several index entries (e.g. for its title,
 * body text, and metadata fields).
 */
export interface IndexRecord {
  /** Unique record identifier. */
  id: string;
  /** The chunk this index entry points to. */
  chunk_id: string;
  /** Document (denormalised for fast filtering). */
  document_id: DocumentId;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Field that was indexed (e.g. "text", "title", "metadata.author"). */
  field: string;
  /** Tokenized / normalized text content. */
  tokens: string[];
  /** Optional weighting / boost factor. */
  boost?: number;
  /** Creation timestamp. */
  created_at: Timestamp;
}

// ─── Chunking Config ───────────────────────────────────────────────────────

/**
 * Configuration for the chunking strategy.
 */
export interface ChunkingConfig {
  /** Maximum characters per chunk. */
  max_chunk_size: number;
  /** Overlap in characters between consecutive chunks. */
  overlap_size: number;
  /** Chunking strategy identifier (e.g. "recursive", "semantic", "fixed"). */
  strategy: string;
  /** Separator characters / regex used to split text. */
  separators: string[];
}
