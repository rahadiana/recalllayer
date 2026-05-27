/**
 * Internal service types for the Retrieval Service.
 *
 * These types wrap and extend the shared-schemas types with service-specific
 * concerns (search request/response, context request, tracking, internal config).
 */

import type {
  SearchFilters,
  RerankConfig,
  WorkspaceId,
  DocumentId,
  Timestamp,
  Metadata,
} from "@memory-platform/shared-schemas";

// ─── Search Request ──────────────────────────────────────────────────────────

/**
 * Incoming search request body for POST /internal/search.
 * Wraps SearchQuery fields with request-level concerns.
 */
export interface SearchRequest {
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Natural-language query text. */
  query: string;
  /** Optional pre-computed query embedding. */
  query_embedding?: number[];
  /** Maximum results to return (default: 10). */
  top_k?: number;
  /** Minimum similarity threshold (default: 0.0). */
  similarity_threshold?: number;
  /** Metadata filters. */
  filters?: SearchFilters;
  /** Enable hybrid search (vector + keyword). Default: true. */
  hybrid?: boolean;
  /** Optional reranking config. */
  rerank?: RerankConfig;
  /** Pagination cursor (for deep pagination). */
  cursor?: string;
}

// ─── Context Request ─────────────────────────────────────────────────────────

/**
 * Incoming context request body for POST /internal/context.
 * Accepts a query and retrieved document IDs with their passages.
 */
export interface ContextRequest {
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The original query text. */
  query: string;
  /** Retrieved passages with scores. */
  passages: ContextPassageRequest[];
  /** Maximum token budget for the context window (default: 4096). */
  max_tokens?: number;
  /** Model identifier for token counting (default: "gpt-4o"). */
  model?: string;
  /** Whether to include metadata in the assembled text. */
  include_metadata?: boolean;
}

/**
 * A single passage to include in the context window.
 */
export interface ContextPassageRequest {
  /** Chunk identifier. */
  chunk_id: string;
  /** Document identifier. */
  document_id: DocumentId;
  /** Document title for citation. */
  document_title: string;
  /** Passage text content. */
  text: string;
  /** Relevance score. */
  score: number;
}

// ─── Internal Vector Search Result ───────────────────────────────────────────

/**
 * Raw vector search result from Qdrant.
 */
export interface VectorSearchResult {
  /** Chunk identifier (vector point ID). */
  chunk_id: string;
  /** Parent document ID (from payload). */
  document_id: DocumentId;
  /** Workspace ID (from payload). */
  workspace_id: WorkspaceId;
  /** Chunk text content (from payload). */
  text: string;
  /** Cosine similarity score. */
  score: number;
  /** Chunk metadata (from payload). */
  metadata: Metadata;
}

// ─── Internal Keyword Search Result ──────────────────────────────────────────

/**
 * Raw keyword search result from Postgres FTS.
 */
export interface KeywordSearchResult {
  /** Chunk identifier. */
  chunk_id: string;
  /** Parent document ID. */
  document_id: DocumentId;
  /** Workspace ID. */
  workspace_id: WorkspaceId;
  /** Chunk text content. */
  text: string;
  /** Postgres ts_rank normalized score (0-1). */
  score: number;
  /** Chunk metadata. */
  metadata: Metadata;
  /** Headline snippet with highlighted matches. */
  headline?: string;
}

// ─── Hybrid Fusion Result ────────────────────────────────────────────────────

/**
 * Fused result from hybrid search (vector + keyword after RRF).
 */
export interface FusedSearchResult {
  /** Chunk identifier. */
  chunk_id: string;
  /** Parent document ID. */
  document_id: DocumentId;
  /** Chunk text content. */
  text: string;
  /** Fused RRF score. */
  fused_score: number;
  /** Per-source scores. */
  source_scores: {
    vector?: number;
    keyword?: number;
  };
  /** Chunk metadata. */
  metadata: Metadata;
}

// ─── Tracking ────────────────────────────────────────────────────────────────

/**
 * Record of a single search execution.
 */
export interface SearchLogEntry {
  /** Unique log entry ID. */
  id: string;
  /** The query that was executed. */
  query_id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The query text. */
  query: string;
  /** Number of results returned. */
  result_count: number;
  /** Search latency in ms. */
  latency_ms: number;
  /** Whether hybrid search was used. */
  hybrid: boolean;
  /** Whether reranking was applied. */
  rerank_applied: boolean;
  /** User feedback (if provided). */
  feedback?: SearchFeedback;
  /** Log creation timestamp. */
  created_at: Timestamp;
}

/**
 * User-provided feedback on search quality.
 */
export interface SearchFeedback {
  /** Rating (1-5). */
  rating: number;
  /** Optional comment. */
  comment?: string;
  /** Search log entry this feedback applies to. */
  search_log_id: string;
}

// ─── Internal config ─────────────────────────────────────────────────────────

/**
 * Internal service configuration.
 */
export interface RetrievalServiceConfig {
  /** RRF constant k (default: 60). Higher = less influence from rank position. */
  rrf_k?: number;
  /** Default top_k when not specified in request. */
  default_top_k?: number;
  /** Default similarity threshold. */
  default_similarity_threshold?: number;
  /** Default max tokens for context window. */
  default_max_tokens?: number;
  /** Qdrant collection name for chunks. */
  chunks_collection?: string;
  /** Postgres table for keyword search. */
  keyword_table?: string;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Required<RetrievalServiceConfig> = {
  rrf_k: 60,
  default_top_k: 10,
  default_similarity_threshold: 0.0,
  default_max_tokens: 4096,
  chunks_collection: "chunks",
  keyword_table: "chunks",
};
