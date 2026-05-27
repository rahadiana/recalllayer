/**
 * @memory-platform/shared-schemas
 *
 * Single source of truth for DTOs, validation schemas, event contracts,
 * and error shapes used by all services in the Agentic Memory Platform.
 *
 * @packageDocumentation
 */

// ─── Common types ───────────────────────────────────────────────────────────
export type {
  WorkspaceId,
  DocumentId,
  EntityId,
  UserId,
  TenantId,
  Timestamp,
  SortDirection,
  Metadata,
} from "./types/common.js";
export type { PaginationParams, PaginatedResponse, SortField } from "./types/common.js";

// ─── Auth / Workspace types ─────────────────────────────────────────────────
export type { Role, Permission } from "./types/auth.js";
export type {
  Workspace,
  User,
  WorkspaceMembership,
  ApiKey,
  ApiKeyCreated,
} from "./types/auth.js";

// ─── Document types ─────────────────────────────────────────────────────────
export type { DocumentStatus } from "./types/document.js";
export type {
  DocumentSource,
  Document,
  CreateDocumentDto,
  UpdateDocumentDto,
} from "./types/document.js";

// ─── Event types ────────────────────────────────────────────────────────────
export type { EventEnvelope, EventType, EventPayload, EventPayloadMap } from "./types/event.js";
export type {
  DocumentCreatedPayload,
  DocumentUpdatedPayload,
  DocumentDeletedPayload,
  DocumentStatusChangedPayload,
  DocumentReadyPayload,
  ExtractionJobCreatedPayload,
  ExtractionJobCompletedPayload,
  ExtractionJobFailedPayload,
  IndexingChunksCreatedPayload,
  IndexingEmbeddingsGeneratedPayload,
  IndexingCompletedPayload,
  IndexingFailedPayload,
  SearchQueryExecutedPayload,
  GraphEntityCreatedPayload,
  GraphEntityUpdatedPayload,
  GraphEntityDeletedPayload,
  GraphRelationCreatedPayload,
  GraphRelationDeletedPayload,
  ProfileEventRecordedPayload,
  ProfileFactUpdatedPayload,
  ConnectorSyncStartedPayload,
  ConnectorSyncCompletedPayload,
  ConnectorSyncFailedPayload,
  WorkspaceCreatedPayload,
  WorkspaceDeletedPayload,
  SystemHealthCheckPayload,
} from "./types/event.js";

// ─── Extraction types ───────────────────────────────────────────────────────
export type { ExtractionStatus } from "./types/extraction.js";
export type {
  ExtractionJob,
  ExtractedDocument,
  DocumentSection,
  CreateExtractionJobDto,
} from "./types/extraction.js";

// ─── Chunk / Embedding / Index types ────────────────────────────────────────
export type {
  Chunk,
  EmbeddingRecord,
  IndexRecord,
  ChunkingConfig,
} from "./types/chunk.js";

// ─── Search / Context types ─────────────────────────────────────────────────
export type {
  SearchQuery,
  SearchFilters,
  SearchResult,
  SearchSourceScores,
  RerankConfig,
  RerankingScore,
  ContextWindow,
  ContextChunk,
  SearchResponse,
} from "./types/search.js";

// ─── Graph types ────────────────────────────────────────────────────────────
export type {
  Entity,
  Relation,
  MemoryEdge,
  GraphSnapshot,
  GraphQuery,
} from "./types/graph.js";

// ─── Profile types ──────────────────────────────────────────────────────────
export type {
  UserProfile,
  Preference,
  ProfileFact,
  BehaviorEvent,
  BehaviourSummary,
  RecordBehaviorEventDto,
  UpsertPreferenceDto,
} from "./types/profile.js";

// ─── Connector / Sync types ─────────────────────────────────────────────────
export type { SyncJobStatus } from "./types/connector.js";
export type {
  ConnectorAccount,
  ConnectorConfig,
  SyncJob,
  SyncState,
  SyncedDocument,
  CreateConnectorAccountDto,
  TriggerSyncDto,
} from "./types/connector.js";

// ─── Evaluation types ───────────────────────────────────────────────────────
export type {
  EvalRunStatus,
  FeedbackRating,
} from "./types/evaluation.js";
export type {
  EvalDataset,
  EvalDatasetItem,
  EvalRun,
  EvalRunConfig,
  EvalMetrics,
  RetrievalScore,
  HumanFeedback,
  CreateEvalDatasetDto,
  CreateEvalRunDto,
  SubmitFeedbackDto,
} from "./types/evaluation.js";

// ─── Error types ────────────────────────────────────────────────────────────
export type { ErrorCode } from "./types/error.js";
export type {
  ApiError,
  ValidationError,
  ValidationErrorDetail,
} from "./types/error.js";

// ─── Validation schemas ─────────────────────────────────────────────────────
export {
  // Common
  paginationParamsSchema,
  paginatedResponseSchema,
  metadataSchema,
  sortFieldSchema,
  // Auth
  roleSchema,
  workspaceSchema,
  userSchema,
  workspaceMembershipSchema,
  apiKeySchema,
  apiKeyCreatedSchema,
  // Document
  documentStatusSchema,
  documentSourceSchema,
  documentSchema,
  createDocumentDtoSchema,
  updateDocumentDtoSchema,
  // Event
  eventTypeSchema,
  eventEnvelopeSchema,
  // Extraction
  extractionStatusSchema,
  extractionJobSchema,
  documentSectionSchema,
  extractedDocumentSchema,
  createExtractionJobDtoSchema,
  // Chunk / Embedding / Index
  chunkSchema,
  embeddingRecordSchema,
  indexRecordSchema,
  chunkingConfigSchema,
  // Search
  searchFiltersSchema,
  rerankConfigSchema,
  searchQuerySchema,
  searchSourceScoresSchema,
  searchResultSchema,
  rerankingScoreSchema,
  contextChunkSchema,
  contextWindowSchema,
  searchResponseSchema,
  // Graph
  entitySchema,
  relationSchema,
  memoryEdgeSchema,
  graphSnapshotSchema,
  graphQuerySchema,
  // Profile
  preferenceSchema,
  profileFactSchema,
  behaviorEventSchema,
  behaviourSummarySchema,
  userProfileSchema,
  recordBehaviorEventDtoSchema,
  upsertPreferenceDtoSchema,
  // Connector
  connectorConfigSchema,
  syncJobStatusSchema,
  syncStateSchema,
  connectorAccountSchema,
  syncJobSchema,
  syncedDocumentSchema,
  createConnectorAccountDtoSchema,
  triggerSyncDtoSchema,
  // Evaluation
  evalDatasetItemSchema,
  evalDatasetSchema,
  evalRunConfigSchema,
  evalMetricsSchema,
  evalRunStatusSchema,
  evalRunSchema,
  retrievalScoreSchema,
  feedbackRatingSchema,
  humanFeedbackSchema,
  createEvalDatasetDtoSchema,
  createEvalRunDtoSchema,
  submitFeedbackDtoSchema,
  // Error
  errorCodeSchema,
  validationErrorDetailSchema,
  validationErrorSchema,
  apiErrorSchema,
} from "./validation/index.js";
