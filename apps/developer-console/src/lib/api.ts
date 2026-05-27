import type {
  ApiKey,
  ApiKeyCreated,
} from "@memory-platform/shared-schemas";

// ─── Configuration ───────────────────────────────────────────────────────────

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";
const API_BASE = process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:3001";
const MOCK_DELAY_MS = 400;

async function mockDelay(ms?: number): Promise<void> {
  if (!MOCK_MODE) return;
  await new Promise((r) => setTimeout(r, ms ?? MOCK_DELAY_MS));
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

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

function getApiKey(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)api_key=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
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

let mockApiKeys: ApiKey[] = [
  {
    id: "key_001",
    workspace_id: "ws_default" as ApiKey["workspace_id"],
    label: "Production API Key",
    prefix: "mp_live_a1b2c3",
    hash: "sha256:abc123",
    permissions: ["document:read", "search:query"],
    expires_at: null,
    created_at: "2026-04-15T10:00:00.000Z",
    last_used_at: "2026-05-14T08:30:00.000Z",
    is_active: true,
  },
  {
    id: "key_002",
    workspace_id: "ws_default" as ApiKey["workspace_id"],
    label: "Staging Test Key",
    prefix: "mp_test_x7y8z9",
    hash: "sha256:def456",
    permissions: ["document:read"],
    expires_at: "2026-08-01T00:00:00.000Z",
    created_at: "2026-05-01T14:30:00.000Z",
    last_used_at: "2026-05-12T16:45:00.000Z",
    is_active: true,
  },
  {
    id: "key_003",
    workspace_id: "ws_default" as ApiKey["workspace_id"],
    label: "Legacy Integration Key",
    prefix: "mp_old_k9l0m1",
    hash: "sha256:ghi789",
    permissions: ["document:read", "document:write", "search:query", "profile:read"],
    expires_at: null,
    created_at: "2026-03-10T09:00:00.000Z",
    last_used_at: "2026-04-28T11:00:00.000Z",
    is_active: false,
  },
  {
    id: "key_004",
    workspace_id: "ws_default" as ApiKey["workspace_id"],
    label: "CI/CD Pipeline Key",
    prefix: "mp_cicd_n2o3p4",
    hash: "sha256:jkl012",
    permissions: ["document:read", "search:query"],
    expires_at: "2026-06-30T00:00:00.000Z",
    created_at: "2026-05-10T08:00:00.000Z",
    last_used_at: "2026-05-14T09:15:00.000Z",
    is_active: true,
  },
];

// ─── API Key Types ───────────────────────────────────────────────────────────

export interface CreateApiKeyDto {
  label: string;
  permissions: string[];
  expires_at?: string | null;
}

// ─── Usage Types ─────────────────────────────────────────────────────────────

export interface UsageStats {
  totalCalls: number;
  callsThisMonth: number;
  callsToday: number;
  quotaLimit: number;
  quotaUsed: number;
  quotaPercent: number;
  byEndpoint: { endpoint: string; calls: number; avgLatency: number }[];
  dailyVolume: { date: string; count: number }[];
}

export interface RequestLogEntry {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  status: number;
  latency_ms: number;
  workspace_id: string;
  api_key_id: string;
  user_agent?: string;
  ip_address?: string;
}

export interface WorkspaceSettings {
  id: string;
  name: string;
  description: string;
  default_rate_limit: number;
  max_keys_per_workspace: number;
  webhook_url: string;
  retention_days: number;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface ConsoleDashboardStats {
  totalApiCalls: number;
  activeKeys: number;
  totalKeys: number;
  quotaPercent: number;
  callsToday: number;
  avgLatencyMs: number;
}

export async function fetchDashboardStats(): Promise<ConsoleDashboardStats> {
  const res = await fetch("/api/stats");
  return res.json();
}

export async function fetchUsageStats(): Promise<UsageStats> {
  const res = await fetch("/api/quotas");
  const quotas = await res.json();
  const now = new Date();
  const totalDocs = quotas.reduce((sum: number, q: any) => sum + q.document_count, 0);
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  return {
    totalCalls: totalDocs * 10,
    callsThisMonth: totalDocs * 2,
    callsToday: Math.max(totalDocs, 1),
    quotaLimit: quotas.reduce((sum: number, q: any) => sum + q.max_documents, 0),
    quotaUsed: totalDocs,
    quotaPercent: totalDocs > 0 ? Math.round((totalDocs / Math.max(1, quotas.reduce((s: number, q: any) => s + q.max_documents, 0))) * 100) : 0,
    byEndpoint: [
      { endpoint: "POST /documents", calls: totalDocs * 5, avgLatency: 120 },
      { endpoint: "GET /documents", calls: totalDocs * 3, avgLatency: 65 },
      { endpoint: "POST /search", calls: totalDocs * 2, avgLatency: 95 },
    ],
    dailyVolume: days.map((d, i) => ({ date: d, count: totalDocs + (6-i) * 3 })),
  };
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export async function fetchApiKeys(): Promise<ApiKey[]> {
  if (MOCK_MODE) {
    await mockDelay();
    return mockApiKeys;
  }
  return request<ApiKey[]>("/api-keys");
}

export async function createApiKey(dto: CreateApiKeyDto): Promise<ApiKeyCreated> {
  if (MOCK_MODE) {
    await mockDelay(600);
    const now = new Date().toISOString();
    const newKey: ApiKey = {
      id: `key_${Date.now()}`,
      workspace_id: "ws_default" as ApiKey["workspace_id"],
      label: dto.label,
      prefix: `mp_${Math.random().toString(36).substring(2, 10)}`,
      hash: `sha256:mock${Date.now()}`,
      permissions: dto.permissions,
      expires_at: dto.expires_at ?? null,
      created_at: now,
      last_used_at: undefined,
      is_active: true,
    };
    mockApiKeys = [newKey, ...mockApiKeys];
    return { api_key: newKey, raw_key: `mp_secret_${Math.random().toString(36).substring(2, 32)}` };
  }
  return request<ApiKeyCreated>("/api-keys", { method: "POST", body: dto });
}

export async function revokeApiKey(keyId: string): Promise<void> {
  if (MOCK_MODE) {
    await mockDelay();
    const key = mockApiKeys.find((k) => k.id === keyId);
    if (key) {
      key.is_active = false;
    }
    return;
  }
  return request<void>(`/api-keys/${keyId}/revoke`, { method: "POST" });
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export async function fetchRequestLogs(
  params: { limit?: number; cursor?: string } = {},
): Promise<{ items: RequestLogEntry[]; next_cursor: string | null; total?: number }> {
  if (MOCK_MODE) {
    await mockDelay();
    const endpoints = [
      "POST /documents",
      "GET /documents",
      "POST /search",
      "GET /search/{id}",
      "POST /graph/query",
      "GET /profile",
    ];
    const methods = ["GET", "POST", "DELETE"];
    const statusCodes = [200, 201, 204, 400, 401, 403, 429, 500];
    const statusWeights = [40, 25, 5, 8, 3, 2, 5, 2];

    const weightedRandom = (items: number[], weights: number[]) => {
      const total = weights.reduce((s, w) => s + w, 0);
      let r = Math.random() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[0];
    };

    const logs: RequestLogEntry[] = Array.from({ length: params.limit ?? 50 }, (_, i) => {
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const method = endpoint.split(" ")[0];
      const status = weightedRandom(statusCodes, statusWeights);
      const ts = new Date(Date.now() - i * 60000 - Math.random() * 3600000);
      return {
        id: `log_${Date.now() - i}`,
        timestamp: ts.toISOString(),
        endpoint,
        method,
        status,
        latency_ms: Math.floor(Math.random() * 200) + 20,
        workspace_id: "ws_default",
        api_key_id: mockApiKeys[Math.floor(Math.random() * mockApiKeys.length)].id,
        user_agent: "memory-platform-sdk/1.0",
        ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      };
    });

    return { items: logs, next_cursor: logs.length >= 50 ? "cursor_next" : null, total: 3250 };
  }
  return request("/console/logs", { body: params });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  if (MOCK_MODE) {
    await mockDelay();
    return {
      id: "ws_default",
      name: "My Workspace",
      description: "Main development workspace for RecallLayer",
      default_rate_limit: 100,
      max_keys_per_workspace: 20,
      webhook_url: "https://hooks.example.com/memory-events",
      retention_days: 90,
    };
  }
  return request<WorkspaceSettings>("/console/settings");
}

export async function updateWorkspaceSettings(
  dto: Partial<WorkspaceSettings>,
): Promise<WorkspaceSettings> {
  if (MOCK_MODE) {
    await mockDelay();
    return {
      id: "ws_default",
      name: dto.name ?? "My Workspace",
      description: dto.description ?? "",
      default_rate_limit: dto.default_rate_limit ?? 100,
      max_keys_per_workspace: dto.max_keys_per_workspace ?? 20,
      webhook_url: dto.webhook_url ?? "",
      retention_days: dto.retention_days ?? 90,
    };
  }
  return request<WorkspaceSettings>("/console/settings", { method: "PUT", body: dto });
}

export { ApiError };
