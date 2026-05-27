/**
 * Evaluation and quality measurement types.
 *
 * The evaluation service measures retrieval quality through
 * curated datasets, automated runs, and human feedback loops.
 *
 * @module evaluation
 */

import type { Metadata, Timestamp, WorkspaceId } from "./common.js";

// ─── Eval Dataset ───────────────────────────────────────────────────────────

/**
 * A curated evaluation dataset consisting of query-document pairs
 * with relevance judgments.
 */
export interface EvalDataset {
  /** Unique dataset identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Human-readable name. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Number of query-document pairs in this dataset. */
  item_count: number;
  /** Free-form metadata. */
  metadata: Metadata;
  /** Creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
}

/**
 * A single item in an evaluation dataset: a query paired with
 * expected relevant document IDs.
 */
export interface EvalDatasetItem {
  /** Unique item identifier. */
  id: string;
  /** Parent dataset. */
  dataset_id: string;
  /** The search query text. */
  query: string;
  /** Document IDs considered relevant for this query. */
  relevant_document_ids: string[];
  /** Optional partially-relevant document IDs. */
  partially_relevant_document_ids?: string[];
  /** Optional non-relevant document IDs (distractors). */
  non_relevant_document_ids?: string[];
}

// ─── Eval Run ───────────────────────────────────────────────────────────────

/**
 * A single evaluation run against a dataset.
 */
export interface EvalRun {
  /** Unique run identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The dataset being evaluated. */
  dataset_id: string;
  /** The retrieval configuration used. */
  config: EvalRunConfig;
  /** Overall metrics computed from this run. */
  metrics: EvalMetrics;
  /** Run status. */
  status: EvalRunStatus;
  /** Error details if status is "failed". */
  error_message?: string;
  /** Run start timestamp. */
  started_at?: Timestamp;
  /** Run completion timestamp. */
  completed_at?: Timestamp;
  /** Actor that initiated the run. */
  created_by: string;
  /** Creation timestamp. */
  created_at: Timestamp;
}

/**
 * Lifecycle of an evaluation run.
 */
export type EvalRunStatus = "pending" | "running" | "completed" | "failed";

/**
 * Configuration used for an evaluation run (captures the retrieval
 * parameters so results are reproducible).
 */
export interface EvalRunConfig {
  /** Search backend (e.g. "pgvector", "qdrant", "elasticsearch"). */
  search_backend: string;
  /** Embedding model identifier. */
  embedding_model: string;
  /** Whether hybrid search was enabled. */
  hybrid: boolean;
  /** Reranking model, if used. */
  rerank_model?: string;
  /** Top-k value used. */
  top_k: number;
}

/**
 * Aggregated metrics from an evaluation run.
 */
export interface EvalMetrics {
  /** Mean Reciprocal Rank. */
  mrr: number;
  /** Precision @ K. */
  precision_at_k: number;
  /** Recall @ K. */
  recall_at_k: number;
  /** Normalized Discounted Cumulative Gain. */
  ndcg: number;
  /** Mean average precision. */
  map: number;
  /** Average query latency in milliseconds. */
  avg_latency_ms: number;
  /** Number of queries in the run. */
  total_queries: number;
}

// ─── Retrieval Score ────────────────────────────────────────────────────────

/**
 * Per-query retrieval scores recorded during an evaluation run.
 */
export interface RetrievalScore {
  /** Parent eval run. */
  run_id: string;
  /** Dataset item that was evaluated. */
  dataset_item_id: string;
  /** The query text. */
  query: string;
  /** Document IDs returned by the retrieval system (ordered). */
  retrieved_document_ids: string[];
  /** Per-query precision. */
  precision: number;
  /** Per-query recall. */
  recall: number;
  /** Query latency in milliseconds. */
  latency_ms: number;
}

// ─── Human Feedback ─────────────────────────────────────────────────────────

/**
 * Human feedback on a search result or context window.
 *
 * Feedback loops enable continuous improvement of retrieval quality.
 */
export interface HumanFeedback {
  /** Unique feedback identifier. */
  id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** The search query that produced the result. */
  query_id: string;
  /** The user who provided feedback. */
  user_id: string;
  /** Feedback rating. */
  rating: FeedbackRating;
  /** Optional free-text comment. */
  comment?: string;
  /** Which specific chunks were rated. */
  chunk_ids: string[];
  /** Feedback submission timestamp. */
  created_at: Timestamp;
}

/**
 * Human feedback rating scale.
 *
 * - `relevant` – result was useful.
 * - `partially_relevant` – somewhat useful.
 * - `not_relevant` – not useful.
 */
export type FeedbackRating = "relevant" | "partially_relevant" | "not_relevant";

// ─── Create DTOs ────────────────────────────────────────────────────────────

/**
 * Payload for creating a new evaluation dataset.
 */
export interface CreateEvalDatasetDto {
  /** Dataset name. */
  name: string;
  /** Optional description. */
  description?: string;
  /** Initial dataset items. */
  items?: Omit<EvalDatasetItem, "id" | "dataset_id">[];
}

/**
 * Payload for triggering a new evaluation run.
 */
export interface CreateEvalRunDto {
  /** Dataset to evaluate against. */
  dataset_id: string;
  /** Retrieval configuration. */
  config: EvalRunConfig;
}

/**
 * Payload for submitting human feedback.
 */
export interface SubmitFeedbackDto {
  /** The query that produced the result. */
  query_id: string;
  /** Feedback rating. */
  rating: FeedbackRating;
  /** Optional comment. */
  comment?: string;
  /** Chunks being rated. */
  chunk_ids: string[];
}
