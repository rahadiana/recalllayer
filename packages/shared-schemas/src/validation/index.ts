/**
 * Zod validation schemas for all shared types.
 *
 * Every schema mirrors its corresponding type in `../types/`. Services
 * import these schemas for runtime validation of API payloads, event
 * messages, and domain objects.
 *
 * @module validation
 */

import { z } from "zod";

// ─── Common ─────────────────────────────────────────────────────────────────

export const paginationParamsSchema = z.object({
  limit: z.number().int().min(1).max(1000),
  cursor: z.string().optional(),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    next_cursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });

export const metadataSchema: z.ZodType<Record<string, unknown>> = z.record(
  z.string(),
  z.unknown(),
);

export const sortFieldSchema = z.object({
  field: z.string(),
  direction: z.enum(["asc", "desc"]),
});

// ─── Auth ───────────────────────────────────────────────────────────────────

export const roleSchema = z.enum(["owner", "admin", "editor", "viewer"]);

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  tenant_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  is_active: z.boolean(),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  avatar_url: z.string().url().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  is_active: z.boolean(),
});

export const workspaceMembershipSchema = z.object({
  workspace_id: z.string(),
  user_id: z.string(),
  role: roleSchema,
  permissions: z.array(z.string()),
  joined_at: z.string().datetime(),
});

export const apiKeySchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  label: z.string().optional(),
  prefix: z.string(),
  hash: z.string(),
  permissions: z.array(z.string()),
  expires_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  last_used_at: z.string().datetime().optional(),
  is_active: z.boolean(),
});

export const apiKeyCreatedSchema = z.object({
  api_key: apiKeySchema,
  raw_key: z.string(),
});

// ─── Document ───────────────────────────────────────────────────────────────

export const documentStatusSchema = z.enum([
  "pending",
  "ingesting",
  "extracting",
  "chunking",
  "indexing",
  "ready",
  "error",
]);

export const documentSourceSchema = z.object({
  type: z.enum(["upload", "url", "connector", "api"]),
  connector: z.string().optional(),
  location: z.string().optional(),
  filename: z.string().optional(),
  mime_type: z.string().optional(),
  size_bytes: z.number().int().nonnegative().optional(),
});

export const documentSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: documentStatusSchema,
  source: documentSourceSchema,
  metadata: metadataSchema,
  tags: z.array(z.string()),
  created_by: z.string(),
  chunk_count: z.number().int().nonnegative().optional(),
  error_message: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const createDocumentDtoSchema = z.object({
  title: z.string().min(1).max(1000),
  description: z.string().optional(),
  source: documentSourceSchema,
  metadata: metadataSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const updateDocumentDtoSchema = z.object({
  title: z.string().min(1).max(1000).optional(),
  description: z.string().optional(),
  metadata: metadataSchema.optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Event ──────────────────────────────────────────────────────────────────

export const eventTypeSchema = z.enum([
  "document.created",
  "document.updated",
  "document.deleted",
  "document.status_changed",
  "document.ready",
  "extraction.job_created",
  "extraction.job_completed",
  "extraction.job_failed",
  "indexing.chunks_created",
  "indexing.embeddings_generated",
  "indexing.completed",
  "indexing.failed",
  "search.query_executed",
  "graph.entity_created",
  "graph.entity_updated",
  "graph.entity_deleted",
  "graph.relation_created",
  "graph.relation_deleted",
  "profile.event_recorded",
  "profile.fact_updated",
  "connector.sync_started",
  "connector.sync_completed",
  "connector.sync_failed",
  "workspace.created",
  "workspace.deleted",
  "system.health_check",
]);

export const eventEnvelopeSchema = z.object({
  event_id: z.string().min(1),
  event_type: eventTypeSchema,
  event_version: z.number().int().positive(),
  workspace_id: z.string().nullable(),
  actor_id: z.string().nullable(),
  occurred_at: z.string().datetime(),
  correlation_id: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

// ─── Extraction ─────────────────────────────────────────────────────────────

export const extractionStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const extractionJobSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  document_id: z.string(),
  status: extractionStatusSchema,
  strategy: z.string(),
  config: z.record(z.string(), z.unknown()),
  error_message: z.string().optional(),
  retry_count: z.number().int().nonnegative(),
  max_retries: z.number().int().positive(),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  created_by: z.string(),
});

export const documentSectionSchema = z.object({
  heading: z.string(),
  level: z.number().int().min(1).max(6),
  content: z.string(),
  start_offset: z.number().int().nonnegative(),
  end_offset: z.number().int().nonnegative(),
});

export const extractedDocumentSchema = z.object({
  job_id: z.string(),
  document_id: z.string(),
  text: z.string(),
  text_length: z.number().int().nonnegative(),
  language: z.string().optional(),
  metadata: metadataSchema,
  sections: z.array(documentSectionSchema),
  extracted_at: z.string().datetime(),
});

export const createExtractionJobDtoSchema = z.object({
  document_id: z.string(),
  strategy: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// ─── Chunk / Embedding / Index ──────────────────────────────────────────────

export const chunkSchema = z.object({
  id: z.string(),
  document_id: z.string(),
  workspace_id: z.string(),
  sequence_number: z.number().int().nonnegative(),
  text: z.string(),
  text_length: z.number().int().nonnegative(),
  metadata: metadataSchema,
  created_at: z.string().datetime(),
});

export const embeddingRecordSchema = z.object({
  id: z.string(),
  target_id: z.string(),
  target_type: z.enum(["chunk", "entity", "query"]),
  vector: z.array(z.number()),
  dimensions: z.number().int().positive(),
  model: z.string(),
  workspace_id: z.string(),
  created_at: z.string().datetime(),
});

export const indexRecordSchema = z.object({
  id: z.string(),
  chunk_id: z.string(),
  document_id: z.string(),
  workspace_id: z.string(),
  field: z.string(),
  tokens: z.array(z.string()),
  boost: z.number().positive().optional(),
  created_at: z.string().datetime(),
});

export const chunkingConfigSchema = z.object({
  max_chunk_size: z.number().int().positive(),
  overlap_size: z.number().int().nonnegative(),
  strategy: z.string(),
  separators: z.array(z.string()),
});

// ─── Search ─────────────────────────────────────────────────────────────────

export const searchFiltersSchema = z.object({
  document_ids: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  created_after: z.string().datetime().optional(),
  created_before: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const rerankConfigSchema = z.object({
  model: z.string(),
  top_n: z.number().int().positive(),
});

export const searchQuerySchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  query: z.string().min(1),
  query_embedding: z.array(z.number()).optional(),
  top_k: z.number().int().positive(),
  similarity_threshold: z.number().min(0).max(1),
  filters: searchFiltersSchema,
  hybrid: z.boolean(),
  rerank: rerankConfigSchema.optional(),
  created_at: z.string().datetime(),
});

export const searchSourceScoresSchema = z.object({
  vector: z.number().optional(),
  keyword: z.number().optional(),
});

export const searchResultSchema = z.object({
  rank: z.number().int().positive(),
  chunk_id: z.string(),
  document_id: z.string(),
  text: z.string(),
  score: z.number(),
  rerank_score: z.number().optional(),
  source_scores: searchSourceScoresSchema.optional(),
  metadata: metadataSchema,
});

export const rerankingScoreSchema = z.object({
  chunk_id: z.string(),
  initial_score: z.number(),
  rerank_score: z.number(),
  model: z.string(),
});

export const contextChunkSchema = z.object({
  chunk_id: z.string(),
  document_title: z.string(),
  text: z.string(),
  score: z.number(),
  position: z.number().int().nonnegative(),
});

export const contextWindowSchema = z.object({
  id: z.string(),
  query_id: z.string(),
  workspace_id: z.string(),
  chunks: z.array(contextChunkSchema),
  assembled_text: z.string(),
  token_count: z.number().int().nonnegative(),
  max_tokens: z.number().int().positive(),
  created_at: z.string().datetime(),
});

export const searchResponseSchema = z.object({
  query_id: z.string(),
  results: z.array(searchResultSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    cursor: z.string().optional(),
    next_cursor: z.string().nullable(),
  }),
  total_hits: z.number().int().nonnegative(),
  latency_ms: z.number().nonnegative(),
});

// ─── Graph ──────────────────────────────────────────────────────────────────

export const entitySchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  entity_type: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  properties: metadataSchema,
  source_document_ids: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const relationSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  source_entity_id: z.string(),
  target_entity_id: z.string(),
  relation_type: z.string(),
  properties: metadataSchema,
  source_document_ids: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const memoryEdgeSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  entity_id: z.string(),
  chunk_id: z.string(),
  document_id: z.string(),
  evidence_text: z.string(),
  confidence: z.number().min(0).max(1),
  created_at: z.string().datetime(),
});

export const graphSnapshotSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  label: z.string(),
  entity_count: z.number().int().nonnegative(),
  relation_count: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
});

export const graphQuerySchema = z.object({
  workspace_id: z.string(),
  seed_entity_ids: z.array(z.string()),
  max_depth: z.number().int().positive(),
  relation_types: z.array(z.string()).optional(),
  entity_types: z.array(z.string()).optional(),
  max_nodes: z.number().int().positive(),
});

// ─── Profile ────────────────────────────────────────────────────────────────

export const preferenceSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  source: z.enum(["explicit", "inferred"]),
  confidence: z.number().min(0).max(1),
  updated_at: z.string().datetime(),
});

export const profileFactSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.unknown(),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  observed_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const behaviorEventSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  user_id: z.string(),
  event_type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  session_id: z.string().optional(),
  occurred_at: z.string().datetime(),
});

export const behaviourSummarySchema = z.object({
  total_searches: z.number().int().nonnegative(),
  total_document_views: z.number().int().nonnegative(),
  top_search_terms: z.array(z.string()),
  top_categories: z.array(z.string()),
  last_active_at: z.string().datetime().optional(),
});

export const userProfileSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  user_id: z.string(),
  display_name: z.string().optional(),
  preferences: z.array(preferenceSchema),
  facts: z.array(profileFactSchema),
  behaviour_summary: behaviourSummarySchema,
  metadata: metadataSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const recordBehaviorEventDtoSchema = z.object({
  event_type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  session_id: z.string().optional(),
});

export const upsertPreferenceDtoSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  source: z.enum(["explicit", "inferred"]),
  confidence: z.number().min(0).max(1).optional(),
});

// ─── Connector ──────────────────────────────────────────────────────────────

export const connectorConfigSchema = z.object({
  watched_paths: z.array(z.string()).optional(),
  file_types: z.array(z.string()).optional(),
  max_file_size_bytes: z.number().int().positive().optional(),
  recursive: z.boolean().optional(),
  settings: metadataSchema,
});

export const syncJobStatusSchema = z.enum([
  "pending",
  "scanning",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const syncStateSchema = z.object({
  cursor: z.string().optional(),
  last_synced_at: z.string().datetime().optional(),
  resource_checksums: z.record(z.string(), z.string()),
  sync_count: z.number().int().nonnegative(),
});

export const connectorAccountSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  connector_type: z.string(),
  label: z.string(),
  credential_ref: z.string(),
  config: connectorConfigSchema,
  sync_state: syncStateSchema,
  last_synced_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  is_active: z.boolean(),
});

export const syncJobSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  workspace_id: z.string(),
  status: syncJobStatusSchema,
  sync_mode: z.enum(["full", "incremental"]),
  discovered_count: z.number().int().nonnegative(),
  processed_count: z.number().int().nonnegative(),
  skipped_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  error_message: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
});

export const syncedDocumentSchema = z.object({
  document_id: z.string(),
  external_id: z.string(),
  connector_type: z.string(),
  sync_job_id: z.string(),
  checksum: z.string(),
  external_updated_at: z.string().datetime().optional(),
  synced_at: z.string().datetime(),
});

export const createConnectorAccountDtoSchema = z.object({
  connector_type: z.string(),
  label: z.string(),
  credential_ref: z.string(),
  config: connectorConfigSchema.partial().optional(),
});

export const triggerSyncDtoSchema = z.object({
  sync_mode: z.enum(["full", "incremental"]).optional(),
});

// ─── Evaluation ─────────────────────────────────────────────────────────────

export const evalDatasetItemSchema = z.object({
  id: z.string(),
  dataset_id: z.string(),
  query: z.string(),
  relevant_document_ids: z.array(z.string()),
  partially_relevant_document_ids: z.array(z.string()).optional(),
  non_relevant_document_ids: z.array(z.string()).optional(),
});

export const evalDatasetSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  item_count: z.number().int().nonnegative(),
  metadata: metadataSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const evalRunConfigSchema = z.object({
  search_backend: z.string(),
  embedding_model: z.string(),
  hybrid: z.boolean(),
  rerank_model: z.string().optional(),
  top_k: z.number().int().positive(),
});

export const evalMetricsSchema = z.object({
  mrr: z.number(),
  precision_at_k: z.number(),
  recall_at_k: z.number(),
  ndcg: z.number(),
  map: z.number(),
  avg_latency_ms: z.number(),
  total_queries: z.number().int().nonnegative(),
});

export const evalRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const evalRunSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  dataset_id: z.string(),
  config: evalRunConfigSchema,
  metrics: evalMetricsSchema,
  status: evalRunStatusSchema,
  error_message: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  created_by: z.string(),
  created_at: z.string().datetime(),
});

export const retrievalScoreSchema = z.object({
  run_id: z.string(),
  dataset_item_id: z.string(),
  query: z.string(),
  retrieved_document_ids: z.array(z.string()),
  precision: z.number(),
  recall: z.number(),
  latency_ms: z.number(),
});

export const feedbackRatingSchema = z.enum([
  "relevant",
  "partially_relevant",
  "not_relevant",
]);

export const humanFeedbackSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  query_id: z.string(),
  user_id: z.string(),
  rating: feedbackRatingSchema,
  comment: z.string().optional(),
  chunk_ids: z.array(z.string()),
  created_at: z.string().datetime(),
});

export const createEvalDatasetDtoSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  items: z
    .array(
      z.object({
        query: z.string(),
        relevant_document_ids: z.array(z.string()),
        partially_relevant_document_ids: z.array(z.string()).optional(),
        non_relevant_document_ids: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export const createEvalRunDtoSchema = z.object({
  dataset_id: z.string(),
  config: evalRunConfigSchema,
});

export const submitFeedbackDtoSchema = z.object({
  query_id: z.string(),
  rating: feedbackRatingSchema,
  comment: z.string().optional(),
  chunk_ids: z.array(z.string()),
});

// ─── Error ──────────────────────────────────────────────────────────────────

export const errorCodeSchema = z.enum([
  "UNKNOWN",
  "INTERNAL_ERROR",
  "NOT_IMPLEMENTED",
  "VALIDATION_ERROR",
  "INVALID_INPUT",
  "MISSING_REQUIRED_FIELD",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_API_KEY",
  "TOKEN_EXPIRED",
  "INSUFFICIENT_PERMISSIONS",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "CONFLICT",
  "RESOURCE_LOCKED",
  "TOO_MANY_REQUESTS",
  "WORKSPACE_NOT_FOUND",
  "WORKSPACE_QUOTA_EXCEEDED",
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_TOO_LARGE",
  "UNSUPPORTED_FILE_TYPE",
  "DOCUMENT_PROCESSING_FAILED",
  "EXTRACTION_FAILED",
  "EXTRACTION_TIMEOUT",
  "INDEXING_FAILED",
  "EMBEDDING_FAILED",
  "SEARCH_FAILED",
  "INVALID_QUERY",
  "ENTITY_NOT_FOUND",
  "RELATION_NOT_FOUND",
  "PROFILE_NOT_FOUND",
  "CONNECTOR_NOT_FOUND",
  "CONNECTOR_AUTH_FAILED",
  "CONNECTOR_SYNC_FAILED",
  "CONNECTOR_RATE_LIMITED",
  "DATASET_NOT_FOUND",
  "EVAL_RUN_NOT_FOUND",
]);

export const validationErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
  received: z.unknown().optional(),
});

export const validationErrorSchema = z.object({
  code: z.literal("VALIDATION_ERROR"),
  message: z.string(),
  fields: z.array(validationErrorDetailSchema),
  error_id: z.string(),
  timestamp: z.string().datetime(),
});

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  error_id: z.string(),
  timestamp: z.string().datetime(),
  path: z.string().optional(),
});
