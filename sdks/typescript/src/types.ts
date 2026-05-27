import type {
  DocumentId,
  WorkspaceId,
  Document,
  CreateDocumentDto,
  UpdateDocumentDto,
  SearchResponse,
  ContextWindow,
  SearchFilters,
  SyncJob,
  SyncJobStatus,
  ConnectorAccount,
  Entity,
  PaginationParams,
  PaginatedResponse,
  ErrorCode,
  Metadata,
} from "@memory-platform/shared-schemas";

export type {
  DocumentId,
  WorkspaceId,
  Document,
  CreateDocumentDto,
  UpdateDocumentDto,
  SearchResponse,
  ContextWindow,
  SearchFilters,
  SyncJob,
  SyncJobStatus,
  ConnectorAccount,
  Entity,
  PaginationParams,
  PaginatedResponse,
  ErrorCode,
  Metadata,
};

export interface MemoryClientOptions {
  apiKey: string;
  baseUrl?: string;
  workspaceId?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface DocumentListParams {
  limit?: number;
  cursor?: string;
  status?: string;
  tags?: string[];
  workspaceId?: string;
}

export interface SearchQueryParams {
  query: string;
  topK?: number;
  similarityThreshold?: number;
  filters?: SearchFilters;
  hybrid?: boolean;
  workspaceId?: string;
}

export interface ContextBuildParams {
  queryId: string;
  maxTokens?: number;
  workspaceId?: string;
}

export interface ConnectorSyncParams {
  syncMode?: "full" | "incremental";
  workspaceId?: string;
}
