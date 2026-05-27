import { HttpClient } from "./client.js";
import type { ClientConfig } from "./client.js";
import { DocumentsClient } from "./documents.js";
import { SearchClient } from "./search.js";
import { MemoriesClient } from "./memories.js";
import { ConnectorsClient } from "./connectors.js";
import type { MemoryClientOptions } from "./types.js";

export class MemoryClient {
  private readonly http: HttpClient;

  public readonly documents: DocumentsClient;
  public readonly search: SearchClient;
  public readonly memories: MemoriesClient;
  public readonly connectors: ConnectorsClient;

  constructor(options: MemoryClientOptions) {
    const config: ClientConfig = {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      workspaceId: options.workspaceId,
    };

    this.http = new HttpClient(config);
    this.documents = new DocumentsClient(this.http);
    this.search = new SearchClient(this.http);
    this.memories = new MemoriesClient(this.http);
    this.connectors = new ConnectorsClient(this.http);
  }
}

export type {
  MemoryClientOptions,
  Document,
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentId,
  WorkspaceId,
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
} from "./types.js";

export type { DocumentListParams, SearchQueryParams, ContextBuildParams, ConnectorSyncParams } from "./types.js";

export {
  MemoryPlatformError,
  ApiError,
  NetworkError,
  AuthError,
  RateLimitError,
  isMemoryPlatformError,
  isApiError,
  isNetworkError,
} from "./errors.js";
