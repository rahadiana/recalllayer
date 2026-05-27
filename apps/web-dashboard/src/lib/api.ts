/**
 * API client for the API Gateway.
 *
 * All frontend requests go through this module. It provides typed
 * request/response contracts using the shared-schemas package and
 * the API Gateway public API.
 *
 * For MVP, API calls are mocked with realistic data.
 */

import type {
  Document,
  CreateDocumentDto,
  PaginatedResponse,
  SearchResponse,
  SearchResult,
  ConnectorAccount,
  SyncJob,
} from "@memory-platform/shared-schemas";

// ─── Configuration ───────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "/api/v1";

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

// ─── Mock Mode ───────────────────────────────────────────────────────────────

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";
const MOCK_DELAY_MS = 400;

async function mockDelay(ms?: number): Promise<void> {
  if (!MOCK_MODE) return;
  await new Promise((r) => setTimeout(r, ms ?? MOCK_DELAY_MS));
}

function getApiKey(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)api_key=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey && { "x-api-key": apiKey }),
    ...opts.headers,
  };

  const response = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(
      String(errorBody.code ?? "UNKNOWN"),
      String(errorBody.message ?? response.statusText),
      response.status,
      errorBody.details,
    );
  }

  return response.json() as Promise<T>;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const mockDocuments: Document[] = [
  {
    id: "doc_001" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "Product Requirements - RecallLayer",
    description: "Core requirements for the MVP release of the memory platform.",
    status: "ready",
    source: { type: "upload", filename: "prd-v1.pdf", mime_type: "application/pdf", size_bytes: 245000 },
    metadata: { version: "1.2", author: "PM Team" },
    tags: ["product", "requirements"],
    created_by: "user_001",
    chunk_count: 48,
    created_at: "2026-05-10T08:00:00.000Z",
    updated_at: "2026-05-12T14:30:00.000Z",
  },
  {
    id: "doc_002" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "API Gateway Architecture Design",
    description: "Technical design for the API gateway service.",
    status: "indexing",
    source: { type: "url", location: "https://internal.docs/arch/api-gateway", mime_type: "text/html" },
    metadata: { reviewer: "Architecture Team" },
    tags: ["architecture", "api", "design"],
    created_by: "user_002",
    chunk_count: undefined,
    created_at: "2026-05-11T10:15:00.000Z",
    updated_at: "2026-05-14T09:00:00.000Z",
  },
  {
    id: "doc_003" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "User Research Findings - Q1 2026",
    description: "Aggregated user research and feedback analysis.",
    status: "ready",
    source: { type: "upload", filename: "user-research-q1.md", mime_type: "text/markdown", size_bytes: 85000 },
    metadata: { quarter: "Q1", participants: 42 },
    tags: ["research", "ux"],
    created_by: "user_003",
    chunk_count: 23,
    created_at: "2026-04-28T16:00:00.000Z",
    updated_at: "2026-05-01T11:20:00.000Z",
  },
  {
    id: "doc_004" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "Connector Integration Guide",
    description: "How to build and register new data source connectors.",
    status: "extracting",
    source: { type: "connector", connector: "google-drive", filename: "connector-guide.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    metadata: {},
    tags: ["connectors", "integration"],
    created_by: "user_001",
    chunk_count: undefined,
    created_at: "2026-05-13T09:30:00.000Z",
    updated_at: "2026-05-14T08:45:00.000Z",
  },
  {
    id: "doc_005" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "Security Review - Authentication Flow",
    description: "Security audit results for auth and access control.",
    status: "error",
    source: { type: "upload", filename: "security-review.pdf", mime_type: "application/pdf", size_bytes: 320000 },
    metadata: { auditor: "Security Team", severity: "medium" },
    tags: ["security", "auth"],
    created_by: "user_004",
    chunk_count: undefined,
    error_message: "PDF extraction failed: unsupported encoding on page 14",
    created_at: "2026-05-12T13:00:00.000Z",
    updated_at: "2026-05-13T10:00:00.000Z",
  },
  {
    id: "doc_006" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "Onboarding Guide for New Developers",
    status: "ready",
    source: { type: "upload", filename: "onboarding.md", mime_type: "text/markdown", size_bytes: 42000 },
    metadata: { audience: "developers" },
    tags: ["onboarding", "dev"],
    created_by: "user_002",
    chunk_count: 18,
    created_at: "2026-05-08T07:00:00.000Z",
    updated_at: "2026-05-08T07:00:00.000Z",
  },
  {
    id: "doc_007" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "Database Schema Reference",
    status: "ready",
    source: { type: "url", location: "https://internal.docs/db/schema", mime_type: "text/html" },
    metadata: { version: "3.1" },
    tags: ["database", "reference"],
    created_by: "user_003",
    chunk_count: 35,
    created_at: "2026-04-15T12:00:00.000Z",
    updated_at: "2026-05-01T08:00:00.000Z",
  },
  {
    id: "doc_008" as Document["id"],
    workspace_id: "ws_default" as Document["workspace_id"],
    title: "Q2 Engineering OKRs",
    status: "pending",
    source: { type: "upload", filename: "q2-okrs.txt", mime_type: "text/plain", size_bytes: 12000 },
    metadata: { quarter: "Q2" },
    tags: ["planning", "okrs"],
    created_by: "user_001",
    created_at: "2026-05-14T07:00:00.000Z",
    updated_at: "2026-05-14T07:00:00.000Z",
  },
];

const mockSearchResults: SearchResult[] = [
  {
    rank: 1,
    chunk_id: "chunk_001",
    document_id: "doc_001" as Document["id"],
    text: "The memory platform must support document ingestion from multiple sources including file uploads, URLs, chat logs, and external connectors. Each document passes through extraction, chunking, embedding, and indexing pipelines.",
    score: 0.94,
    source_scores: { vector: 0.94, keyword: 0.87 },
    metadata: { chunk_index: 3 },
  },
  {
    rank: 2,
    chunk_id: "chunk_045",
    document_id: "doc_001" as Document["id"],
    text: "Requirements for the MVP include: document upload UI, search interface with hybrid retrieval (vector + keyword), connector management dashboard, and API gateway for all client requests.",
    score: 0.89,
    source_scores: { vector: 0.89, keyword: 0.82 },
    metadata: { chunk_index: 12 },
  },
  {
    rank: 3,
    chunk_id: "chunk_101",
    document_id: "doc_007" as Document["id"],
    text: "Database schema v3.1 includes tables for documents, chunks, embeddings, vector indices, keyword indices, and graph entities. Each table uses ULID-based primary keys for global uniqueness.",
    score: 0.85,
    source_scores: { vector: 0.85, keyword: 0.91 },
    metadata: { chunk_index: 5 },
  },
  {
    rank: 4,
    chunk_id: "chunk_078",
    document_id: "doc_003" as Document["id"],
    text: "User research found that developers want a unified search across all their knowledge sources. 87% of participants ranked 'cross-source search' as their top priority feature.",
    score: 0.78,
    source_scores: { vector: 0.78, keyword: 0.72 },
    metadata: { chunk_index: 8 },
  },
  {
    rank: 5,
    chunk_id: "chunk_120",
    document_id: "doc_002" as Document["id"],
    text: "The API gateway architecture uses a hexagonal pattern with adapters for each backend service. Rate limiting is enforced per workspace, with configurable tiers for free, pro, and enterprise plans.",
    score: 0.72,
    source_scores: { vector: 0.72, keyword: 0.68 },
    metadata: { chunk_index: 15 },
  },
];

const mockConnectors: ConnectorAccount[] = [
  {
    id: "conn_001",
    workspace_id: "ws_default" as ConnectorAccount["workspace_id"],
    connector_type: "google-drive",
    label: "Engineering Shared Drive",
    credential_ref: "cred_ref_001",
    config: { watched_paths: ["/Engineering/Design Docs", "/Engineering/RFCs"], file_types: ["pdf", "docx", "md"], recursive: true, settings: {} },
    sync_state: { resource_checksums: {}, sync_count: 47 },
    last_synced_at: "2026-05-14T06:00:00.000Z",
    is_active: true,
    created_at: "2026-04-01T09:00:00.000Z",
    updated_at: "2026-05-14T06:00:00.000Z",
  },
  {
    id: "conn_002",
    workspace_id: "ws_default" as ConnectorAccount["workspace_id"],
    connector_type: "notion",
    label: "Product Wiki",
    credential_ref: "cred_ref_002",
    config: { watched_paths: ["/Product", "/Design", "/Roadmap"], settings: {} },
    sync_state: { resource_checksums: {}, sync_count: 23 },
    last_synced_at: "2026-05-13T18:00:00.000Z",
    is_active: true,
    created_at: "2026-04-15T14:00:00.000Z",
    updated_at: "2026-05-13T18:00:00.000Z",
  },
  {
    id: "conn_003",
    workspace_id: "ws_default" as ConnectorAccount["workspace_id"],
    connector_type: "slack",
    label: "#engineering Channel",
    credential_ref: "cred_ref_003",
    config: { settings: {} },
    sync_state: { resource_checksums: {}, sync_count: 156 },
    last_synced_at: "2026-05-14T09:30:00.000Z",
    is_active: true,
    created_at: "2026-03-10T11:00:00.000Z",
    updated_at: "2026-05-14T09:30:00.000Z",
  },
  {
    id: "conn_004",
    workspace_id: "ws_default" as ConnectorAccount["workspace_id"],
    connector_type: "github",
    label: "RecallLayer Repo",
    credential_ref: "cred_ref_004",
    config: { watched_paths: ["/docs", "/rfcs", "/architecture"], file_types: ["md", "txt", "yaml"], recursive: true, settings: {} },
    sync_state: { resource_checksums: {}, sync_count: 89 },
    last_synced_at: "2026-05-14T08:00:00.000Z",
    is_active: false,
    created_at: "2026-04-20T16:00:00.000Z",
    updated_at: "2026-05-10T12:00:00.000Z",
  },
];

const mockSyncJobs: SyncJob[] = [
  {
    id: "sync_001",
    account_id: "conn_001",
    workspace_id: "ws_default" as SyncJob["workspace_id"],
    status: "completed",
    sync_mode: "incremental",
    discovered_count: 12,
    processed_count: 3,
    skipped_count: 9,
    error_count: 0,
    started_at: "2026-05-14T05:45:00.000Z",
    completed_at: "2026-05-14T06:00:00.000Z",
    created_at: "2026-05-14T05:45:00.000Z",
  },
  {
    id: "sync_002",
    account_id: "conn_002",
    workspace_id: "ws_default" as SyncJob["workspace_id"],
    status: "completed",
    sync_mode: "incremental",
    discovered_count: 5,
    processed_count: 2,
    skipped_count: 3,
    error_count: 0,
    started_at: "2026-05-13T17:50:00.000Z",
    completed_at: "2026-05-13T18:00:00.000Z",
    created_at: "2026-05-13T17:50:00.000Z",
  },
  {
    id: "sync_003",
    account_id: "conn_003",
    workspace_id: "ws_default" as SyncJob["workspace_id"],
    status: "processing",
    sync_mode: "incremental",
    discovered_count: 47,
    processed_count: 23,
    skipped_count: 12,
    error_count: 1,
    started_at: "2026-05-14T09:30:00.000Z",
    created_at: "2026-05-14T09:30:00.000Z",
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalDocuments: number;
  readyDocuments: number;
  totalChunks: number;
  activeConnectors: number;
  recentSearches: number;
}

// ── Documents ──

export async function fetchDocuments(params?: {
  limit?: number;
  cursor?: string;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<Document>> {
  if (MOCK_MODE) {
    await mockDelay();
    let filtered = [...mockDocuments];
    if (params?.status) filtered = filtered.filter((d) => d.status === params.status);
    if (params?.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter((d) => d.title.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)));
    }
    const limit = params?.limit ?? 20;
    return { items: filtered.slice(0, limit), next_cursor: filtered.length > limit ? "cursor_next" : null, total: filtered.length };
  }
  return request<PaginatedResponse<Document>>(`/documents?${new URLSearchParams(params as Record<string, string>).toString()}`);
}

export async function fetchDocument(id: string): Promise<Document> {
  if (MOCK_MODE) {
    await mockDelay();
    const doc = mockDocuments.find((d) => d.id === id);
    if (!doc) throw new ApiError("NOT_FOUND", "Document not found", 404);
    return doc;
  }
  return request<Document>(`/documents/${id}`);
}

export async function createDocument(dto: CreateDocumentDto): Promise<Document> {
  if (MOCK_MODE) {
    await mockDelay();
    const doc: Document = {
      id: `doc_${Date.now()}` as Document["id"],
      workspace_id: "ws_default" as Document["workspace_id"],
      title: dto.title,
      description: dto.description,
      status: "pending",
      source: dto.source,
      metadata: dto.metadata ?? {},
      tags: dto.tags ?? [],
      created_by: "user_current",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockDocuments.unshift(doc);
    return doc;
  }
  return request<Document>("/documents", { method: "POST", body: dto });
}

export async function deleteDocument(id: string): Promise<void> {
  if (MOCK_MODE) {
    await mockDelay();
    const idx = mockDocuments.findIndex((d) => d.id === id);
    if (idx !== -1) mockDocuments.splice(idx, 1);
    return;
  }
  await request(`/documents/${id}`, { method: "DELETE" });
}

// ── Upload ──

export interface UploadTextPayload {
  title: string;
  content: string;
  description?: string;
  tags?: string[];
}

export interface UploadUrlPayload {
  title: string;
  url: string;
  description?: string;
  tags?: string[];
}

export async function uploadText(payload: UploadTextPayload): Promise<Document> {
  return createDocument({
    title: payload.title,
    description: payload.description,
    source: { type: "upload", mime_type: "text/plain", size_bytes: new Blob([payload.content]).size },
    tags: payload.tags,
    metadata: { content: payload.content },
  });
}

export async function uploadUrl(payload: UploadUrlPayload): Promise<Document> {
  return createDocument({
    title: payload.title,
    description: payload.description,
    source: { type: "url", location: payload.url, mime_type: "text/html" },
    tags: payload.tags,
  });
}

export async function uploadFile(file: File, title?: string, description?: string, tags?: string[]): Promise<Document> {
  const name = title ?? file.name;
  return createDocument({
    title: name,
    description,
    source: {
      type: "upload",
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    },
    tags,
  });
}

// ── Search ──

export interface SearchPayload {
  query: string;
  top_k?: number;
  similarity_threshold?: number;
  hybrid?: boolean;
  filters?: {
    document_ids?: string[];
    tags?: string[];
    created_after?: string;
    created_before?: string;
  };
}

export async function searchMemory(payload: SearchPayload): Promise<SearchResponse> {
  if (MOCK_MODE) {
    await mockDelay(600);
    const q = payload.query.toLowerCase();
    const results = [...mockSearchResults]
      .sort(() => Math.random() - 0.5)
      .slice(0, payload.top_k ?? 10);

    let filtered = results;
    if (payload.filters?.tags?.length) {
      filtered = filtered.filter((r) => {
        const doc = mockDocuments.find((d) => d.id === r.document_id);
        return doc?.tags.some((t) => payload.filters!.tags!.includes(t));
      });
    }

    return {
      query_id: `q_${Date.now()}`,
      results: filtered.map((r, i) => ({ ...r, rank: i + 1, score: r.score * (0.7 + Math.random() * 0.3) })),
      pagination: { limit: payload.top_k ?? 10, cursor: undefined, next_cursor: null },
      total_hits: filtered.length,
      latency_ms: 120 + Math.floor(Math.random() * 80),
    };
  }
  return request<SearchResponse>("/search", { method: "POST", body: payload });
}

// ── Connectors ──

export async function fetchConnectors(): Promise<ConnectorAccount[]> {
  if (MOCK_MODE) {
    await mockDelay();
    return [...mockConnectors];
  }
  return request<ConnectorAccount[]>("/connectors");
}

export async function fetchConnector(id: string): Promise<ConnectorAccount> {
  if (MOCK_MODE) {
    await mockDelay();
    const c = mockConnectors.find((c) => c.id === id);
    if (!c) throw new ApiError("NOT_FOUND", "Connector not found", 404);
    return c;
  }
  return request<ConnectorAccount>(`/connectors/${id}`);
}

export async function triggerSync(connectorId: string, syncMode: "full" | "incremental" = "incremental"): Promise<SyncJob> {
  if (MOCK_MODE) {
    await mockDelay();
    const job: SyncJob = {
      id: `sync_${Date.now()}`,
      account_id: connectorId,
      workspace_id: "ws_default" as SyncJob["workspace_id"],
      status: "pending",
      sync_mode: syncMode,
      discovered_count: 0,
      processed_count: 0,
      skipped_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
    };
    mockSyncJobs.unshift(job);
    return job;
  }
  return request<SyncJob>(`/connectors/${connectorId}/sync`, { method: "POST", body: { sync_mode: syncMode } });
}

export async function fetchSyncJobs(connectorId: string): Promise<SyncJob[]> {
  if (MOCK_MODE) {
    await mockDelay();
    return mockSyncJobs.filter((j) => j.account_id === connectorId);
  }
  return request<SyncJob[]>(`/connectors/${connectorId}/sync`);
}

// ── Dashboard ──

export async function fetchDashboardStats(): Promise<DashboardStats> {
  if (MOCK_MODE) {
    await mockDelay();
    const readyDocs = mockDocuments.filter((d) => d.status === "ready");
    return {
      totalDocuments: mockDocuments.length,
      readyDocuments: readyDocs.length,
      totalChunks: readyDocs.reduce((sum, d) => sum + (d.chunk_count ?? 0), 0),
      activeConnectors: mockConnectors.filter((c) => c.is_active).length,
      recentSearches: 28,
    };
  }
  return request<DashboardStats>("/dashboard/stats");
}
