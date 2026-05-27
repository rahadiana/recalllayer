import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../src/client.js";
import { AuthError, ApiError, NetworkError, RateLimitError } from "../src/errors.js";

function createMockFetch(responseInit: ResponseInit & { body?: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: responseInit.ok ?? responseInit.status ? (responseInit.status ?? 200) < 400 : true,
    status: responseInit.status ?? 200,
    headers: new Headers(responseInit.headers),
    json: vi.fn().mockResolvedValue(responseInit.body ?? {}),
  });
}

describe("HttpClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw AuthError when apiKey is empty", () => {
    expect(() => new HttpClient({ apiKey: "" })).toThrow(AuthError);
    expect(() => new HttpClient({ apiKey: "" })).toThrow("API key is required");
  });

  it("should send x-api-key header on requests", async () => {
    const mockFetch = createMockFetch({ status: 200, body: { id: "doc-1" } });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "test-key-123" });
    await client.request({ method: "GET", path: "/v1/documents/doc-1" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key-123");
  });

  it("should send x-workspace-id when provided", async () => {
    const mockFetch = createMockFetch({ status: 200, body: {} });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key", workspaceId: "ws-1" });
    await client.request({ method: "GET", path: "/v1/documents" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-workspace-id"]).toBe("ws-1");
  });

  it("should override default workspaceId with per-request workspaceId", async () => {
    const mockFetch = createMockFetch({ status: 200, body: {} });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key", workspaceId: "ws-default" });
    await client.request({ method: "GET", path: "/v1/documents", workspaceId: "ws-override" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-workspace-id"]).toBe("ws-override");
  });

  it("should construct URL with query parameters", async () => {
    const mockFetch = createMockFetch({ status: 200, body: { items: [] } });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key" });
    await client.request({
      method: "GET",
      path: "/v1/documents",
      queryParams: { limit: 10, status: "ready" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("limit=10");
    expect(url).toContain("status=ready");
  });

  it("should skip undefined query params", async () => {
    const mockFetch = createMockFetch({ status: 200, body: {} });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key" });
    await client.request({
      method: "GET",
      path: "/v1/documents",
      queryParams: { limit: 10, cursor: undefined },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("limit=10");
    expect(url).not.toContain("cursor");
  });

  it("should parse JSON body from successful response", async () => {
    const body = { id: "doc-1", title: "Test" };
    const mockFetch = createMockFetch({ status: 200, body });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key" });
    const response = await client.request<typeof body>({ method: "GET", path: "/v1/documents/doc-1" });

    expect(response.data).toEqual(body);
    expect(response.status).toBe(200);
  });

  it("should throw ApiError on 4xx response", async () => {
    const errorBody = {
      code: "DOCUMENT_NOT_FOUND",
      message: "Document not found",
      error_id: "err-1",
    };
    const mockFetch = createMockFetch({ status: 404, body: errorBody });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key" });
    await expect(
      client.request({ method: "GET", path: "/v1/documents/nonexistent" }),
    ).rejects.toThrow(ApiError);

    await expect(
      client.request({ method: "GET", path: "/v1/documents/nonexistent" }),
    ).rejects.toMatchObject({
      message: "Document not found",
      code: "DOCUMENT_NOT_FOUND",
      status: 404,
    });
  });

  it("should throw AuthError on 401 response", async () => {
    const mockFetch = createMockFetch({
      status: 401,
      body: { code: "INVALID_API_KEY", message: "Invalid API key" },
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "bad-key" });
    await expect(
      client.request({ method: "GET", path: "/v1/documents" }),
    ).rejects.toThrow(AuthError);
  });

  it("should throw AuthError on 403 response", async () => {
    const mockFetch = createMockFetch({
      status: 403,
      body: { code: "FORBIDDEN", message: "Access denied" },
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key" });
    await expect(
      client.request({ method: "GET", path: "/v1/documents" }),
    ).rejects.toThrow(AuthError);
  });

  it("should throw RateLimitError on 429 response", async () => {
    const mockFetch = createMockFetch({
      status: 429,
      headers: { "Retry-After": "60" },
      body: { message: "Rate limit exceeded" },
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key", maxRetries: 0 });
    await expect(
      client.request({ method: "GET", path: "/v1/documents" }),
    ).rejects.toThrow(RateLimitError);
  });

  it("should retry on 5xx responses up to maxRetries", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          ok: false,
          status: 503,
          headers: new Headers(),
          json: vi.fn().mockResolvedValue({ message: "Service unavailable" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ success: true }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key", maxRetries: 3 });
    const response = await client.request<{ success: boolean }>({
      method: "GET",
      path: "/v1/documents",
    });

    expect(callCount).toBe(3);
    expect(response.data.success).toBe(true);
  });

  it("should throw after exhausting retries on 5xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ code: "INTERNAL_ERROR", message: "Server error" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key", maxRetries: 2 });

    await expect(
      client.request({ method: "GET", path: "/v1/documents" }),
    ).rejects.toThrow(ApiError);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("should throw NetworkError when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const client = new HttpClient({ apiKey: "key" });
    await expect(
      client.request({ method: "GET", path: "/v1/documents" }),
    ).rejects.toThrow(NetworkError);
  });

  it("should throw NetworkError on timeout", async () => {
    vi.useFakeTimers();

    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          const abortErr = new DOMException("The operation was aborted", "AbortError");
          setTimeout(() => reject(abortErr), 10_000);
        }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key", timeoutMs: 1000 });
    const promise = client.request({ method: "GET", path: "/v1/documents" });

    vi.advanceTimersByTime(2000);

    try {
      await expect(promise).rejects.toThrow(NetworkError);
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("should honour baseUrl configuration", async () => {
    const mockFetch = createMockFetch({ status: 200, body: {} });
    vi.stubGlobal("fetch", mockFetch);

    const client = new HttpClient({ apiKey: "key", baseUrl: "https://api.example.com" });
    await client.request({ method: "GET", path: "/v1/documents" });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toMatch(/^https:\/\/api\.example\.com\/v1\/documents/);
  });
});
