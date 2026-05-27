/**
 * Internal service types for the Evaluation Service.
 *
 * Extends shared-schemas with service-specific concerns:
 * DB row representations, RAG trace data, hallucination risk indicators,
 * and quality reports.
 */

import type {
  EvalDataset,
  EvalDatasetItem,
  EvalRun,
  EvalRunConfig,
  EvalRunStatus,
  EvalMetrics,
  RetrievalScore,
  HumanFeedback,
  FeedbackRating,
  WorkspaceId,
  Timestamp,
} from "@memory-platform/shared-schemas";

// ─── Re-export shared types ──────────────────────────────────────────────

export type {
  EvalDataset,
  EvalDatasetItem,
  EvalRun,
  EvalRunConfig,
  EvalRunStatus,
  EvalMetrics,
  RetrievalScore,
  HumanFeedback,
  FeedbackRating,
};

// ─── Database Row Types ──────────────────────────────────────────────────

/**
 * Row shape for the eval_datasets table.
 */
export interface EvalDatasetRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  item_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Row shape for the eval_dataset_items table.
 */
export interface EvalDatasetItemRow {
  id: string;
  dataset_id: string;
  query: string;
  relevant_document_ids: string[];
  partially_relevant_document_ids: string[] | null;
  non_relevant_document_ids: string[] | null;
}

/**
 * Row shape for the eval_runs table.
 */
export interface EvalRunRow {
  id: string;
  workspace_id: string;
  dataset_id: string;
  config: EvalRunConfig;
  metrics: EvalMetrics | null;
  status: EvalRunStatus;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

/**
 * Row shape for the retrieval_scores table.
 */
export interface RetrievalScoreRow {
  id: string;
  run_id: string;
  dataset_item_id: string;
  query: string;
  retrieved_document_ids: string[];
  precision: number;
  recall: number;
  latency_ms: number;
}

/**
 * Row shape for the human_feedback table.
 */
export interface HumanFeedbackRow {
  id: string;
  workspace_id: string;
  query_id: string;
  user_id: string;
  rating: FeedbackRating;
  comment: string | null;
  chunk_ids: string[];
  created_at: string;
}

// ─── RAG Trace ───────────────────────────────────────────────────────────

/**
 * A captured RAG retrieval trace used for analysis.
 */
export interface RagTrace {
  /** Unique trace identifier. */
  id: string;
  /** The original query. */
  query: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Chunks retrieved for this query. */
  retrieved_chunks: RagTraceChunk[];
  /** The assembled context window, if any. */
  context_window?: string;
  /** Optional LLM response generated from the context. */
  llm_response?: string;
  /** Trace capture timestamp. */
  captured_at: Timestamp;
}

/**
 * A single chunk within a RAG trace.
 */
export interface RagTraceChunk {
  /** Chunk identifier. */
  chunk_id: string;
  /** Document identifier. */
  document_id: string;
  /** Chunk text content. */
  text: string;
  /** Relevance score. */
  score: number;
  /** Rank position (1-based). */
  rank: number;
}

// ─── Hallucination Risk ──────────────────────────────────────────────────

/**
 * Indicators that help assess hallucination risk in a RAG pipeline.
 */
export interface HallucinationRiskIndicators {
  /** Overall risk level. */
  risk_level: "low" | "medium" | "high" | "critical";
  /** Score from 0-1 (higher = more risk). */
  risk_score: number;
  /** Whether enough relevant context was retrieved. */
  context_sufficient: boolean;
  /** Whether the LLM referenced contexts that were NOT retrieved. */
  hallucinated_sources: boolean;
  /** Whether the context window exceeded the max token budget. */
  context_truncated: boolean;
  /** Low-quality chunks included with scores below threshold. */
  low_quality_chunks_count: number;
  /** Average relevance score of retrieved chunks. */
  avg_chunk_relevance: number;
  /** Number of chunks in the retrieved set. */
  total_chunks_retrieved: number;
  /** The number of retrieved chunks used in the context. */
  chunks_in_context: number;
  /** Any specific issues detected. */
  issues: string[];
}

// ─── Quality Report ──────────────────────────────────────────────────────

/**
 * A comprehensive quality report combining metrics, RAG analysis,
 * and hallucination risk assessment.
 */
export interface QualityReport {
  /** Report identifier. */
  id: string;
  /** The eval run this report covers. */
  run_id: string;
  /** Workspace scope. */
  workspace_id: WorkspaceId;
  /** Aggregated evaluation metrics. */
  metrics: EvalMetrics;
  /** Hallucination risk summary. */
  hallucination_risk: HallucinationRiskIndicators;
  /** Per-query retrieval scores. */
  retrieval_scores: RetrievalScore[];
  /** Number of RAG traces analyzed. */
  traces_analyzed: number;
  /** Overall quality rating. */
  overall_quality: "excellent" | "good" | "fair" | "poor";
  /** Actionable recommendations. */
  recommendations: string[];
  /** Report generation timestamp. */
  generated_at: Timestamp;
}

// ─── Event Payloads ──────────────────────────────────────────────────────

/**
 * Payload for evaluation.completed event.
 */
export interface EvaluationCompletedPayload {
  run_id: string;
  workspace_id: string;
  dataset_id: string;
  metrics: EvalMetrics;
  status: EvalRunStatus;
}

/**
 * Payload for retrieval.quality.reported event.
 */
export interface RetrievalQualityReportedPayload {
  report_id: string;
  run_id: string;
  workspace_id: WorkspaceId;
  overall_quality: QualityReport["overall_quality"];
  hallucination_risk_score: number;
  metrics_summary: Pick<EvalMetrics, "mrr" | "ndcg" | "map">;
}

/**
 * Payload for evaluation.run.requested event.
 */
export interface EvaluationRunRequestedPayload {
  run_id: string;
  workspace_id: string;
  dataset_id: string;
  config: EvalRunConfig;
  created_by: string;
}

/**
 * Payload for retrieval.feedback.recorded event.
 */
export interface RetrievalFeedbackRecordedPayload {
  feedback_id: string;
  workspace_id: string;
  query_id: string;
  user_id: string;
  rating: FeedbackRating;
}

// ─── Service Config ──────────────────────────────────────────────────────

/**
 * Internal service configuration.
 */
export interface EvaluationServiceConfig {
  /** Default top_k for retrieval during eval runs. */
  default_top_k: number;
  /** Minimum relevance score threshold for "sufficient" context. */
  min_relevance_threshold: number;
  /** Default similarity threshold for retrieval. */
  default_similarity_threshold: number;
  /** Low quality chunk score threshold. */
  low_quality_score_threshold: number;
  /** Max concurrency for eval run queries. */
  max_query_concurrency: number;
}

export const DEFAULT_EVAL_CONFIG: Required<EvaluationServiceConfig> = {
  default_top_k: 10,
  min_relevance_threshold: 0.5,
  default_similarity_threshold: 0.0,
  low_quality_score_threshold: 0.3,
  max_query_concurrency: 5,
};
