import type { MemoryClient } from "@memory-platform/sdk-typescript";
import type {
  Document,
  CreateDocumentDto,
  SearchResponse,
  SearchFilters,
  PaginatedResponse,
  SyncJob,
  SyncJobStatus,
} from "@memory-platform/sdk-typescript";

type SearchResult = SearchResponse["results"][number];

export interface UseMemorySearchState {
  /** Current search results (null when no search has been performed). */
  results: SearchResult[] | null;
  /** Whether a search request is in flight. */
  loading: boolean;
  /** The last error that occurred (null when no error). */
  error: Error | null;
  /** Total number of matching chunks (beyond top_k truncation). */
  totalHits: number;
  /** Query latency in milliseconds. */
  latencyMs: number | null;
}

export interface UseMemorySearchActions {
  /** Execute a search query. */
  search: (query: string, options?: SearchQueryOptions) => Promise<SearchResponse>;
  /** Clear current results and error state. */
  reset: () => void;
}

export interface SearchQueryOptions {
  topK?: number;
  similarityThreshold?: number;
  filters?: SearchFilters;
  hybrid?: boolean;
  workspaceId?: string;
}

export interface UseMemorySearchReturn extends UseMemorySearchState, UseMemorySearchActions {}

export interface UseDocumentsState {
  /** Current page of documents (null when not yet loaded). */
  documents: Document[] | null;
  /** Whether a request is in flight. */
  loading: boolean;
  /** The last error that occurred (null when no error). */
  error: Error | null;
  /** Cursor for fetching the next page (null when exhausted). */
  nextCursor: string | null;
  /** Total document count (may be undefined from API). */
  total: number | undefined;
}

export interface UseDocumentsActions {
  /** Fetch a paginated list of documents. */
  list: (params?: DocumentListHookParams) => Promise<PaginatedResponse<Document>>;
  /** Fetch a single document by ID. */
  get: (id: string, workspaceId?: string) => Promise<Document>;
  /** Upload/create a new document. */
  add: (payload: CreateDocumentDto & { workspaceId?: string }) => Promise<Document>;
  /** Load the next page of documents (uses internal nextCursor). */
  loadMore: () => Promise<PaginatedResponse<Document> | null>;
  /** Reset state to initial values. */
  reset: () => void;
}

export interface DocumentListHookParams {
  limit?: number;
  cursor?: string;
  status?: string;
  tags?: string[];
  workspaceId?: string;
}

export interface UseDocumentsReturn extends UseDocumentsState, UseDocumentsActions {}

export interface UseConnectorStatusState {
  /** Current connector status (null when not yet fetched). */
  status: SyncJobStatus | null;
  /** Timestamp of the last successful sync. */
  lastSyncedAt: string | null;
  /** Latest sync job details (null when no sync performed). */
  lastJob: SyncJob | null;
  /** Whether a request is in flight. */
  loading: boolean;
  /** The last error that occurred (null when no error). */
  error: Error | null;
}

export interface UseConnectorStatusActions {
  /** Fetch the current status for a connector. */
  fetchStatus: (connectorType: string, workspaceId?: string) => Promise<void>;
  /** Trigger a sync job for a connector. */
  sync: (connectorType: string, options?: ConnectorSyncOptions) => Promise<SyncJob>;
  /** Reset state to initial values. */
  reset: () => void;
}

export interface ConnectorSyncOptions {
  syncMode?: "full" | "incremental";
  workspaceId?: string;
}

export interface UseConnectorStatusReturn extends UseConnectorStatusState, UseConnectorStatusActions {}

export interface UseMemoryClientReturn {
  /** The underlying MemoryClient instance. Throws if used outside MemoryProvider. */
  client: MemoryClient;
}
