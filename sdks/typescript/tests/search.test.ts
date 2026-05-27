import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchClient } from "../src/search.js";
import { HttpClient } from "../src/client.js";

function createMockHttp(responseData: unknown) {
  return {
    request: vi.fn().mockResolvedValue({ data: responseData, status: 200 }),
  } as unknown as HttpClient;
}

describe("SearchClient", () => {
  let http: HttpClient;
  let client: SearchClient;

  const sampleSearchResponse = {
    query_id: "q-1",
    results: [
      {
        rank: 1,
        chunk_id: "chunk-1",
        document_id: "doc-1" as never,
        text: "relevant text",
        score: 0.95,
        metadata: {} as Record<string, unknown>,
      },
    ],
    pagination: { limit: 10, next_cursor: null },
    total_hits: 1,
    latency_ms: 45,
  };

  const sampleContextWindow = {
    id: "ctx-1",
    query_id: "q-1",
    workspace_id: "ws-1" as never,
    chunks: [
      {
        chunk_id: "chunk-1",
        document_title: "Test Doc",
        text: "context text",
        score: 0.92,
        position: 0,
      },
    ],
    assembled_text: "context text",
    token_count: 5,
    max_tokens: 2048,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    http = createMockHttp(sampleSearchResponse);
    client = new SearchClient(http);
  });

  it("query() should POST to /v1/search with defaults", async () => {
    await client.query({ query: "test query" });

    expect(http.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/search",
      body: {
        query: "test query",
        top_k: 10,
        similarity_threshold: 0.5,
        filters: {},
        hybrid: true,
      },
      workspaceId: undefined,
    });
  });

  it("query() should pass custom search options", async () => {
    await client.query({
      query: "advanced",
      topK: 5,
      similarityThreshold: 0.8,
      filters: { tags: ["important"] },
      hybrid: false,
      workspaceId: "ws-2",
    });

    expect(http.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/search",
      body: {
        query: "advanced",
        top_k: 5,
        similarity_threshold: 0.8,
        filters: { tags: ["important"] },
        hybrid: false,
      },
      workspaceId: "ws-2",
    });
  });

  it("query() should return search response", async () => {
    const result = await client.query({ query: "test" });
    expect(result.query_id).toBe("q-1");
    expect(result.results).toHaveLength(1);
  });

  it("context() should POST to /v1/context with query_id", async () => {
    const mockHttp = createMockHttp(sampleContextWindow);
    const searchClient = new SearchClient(mockHttp);

    await searchClient.context({ queryId: "q-1" });

    expect(mockHttp.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/context",
      body: {
        query_id: "q-1",
        max_tokens: undefined,
      },
      workspaceId: undefined,
    });
  });

  it("context() should pass maxTokens and workspaceId", async () => {
    const mockHttp = createMockHttp(sampleContextWindow);
    const searchClient = new SearchClient(mockHttp);

    await searchClient.context({
      queryId: "q-1",
      maxTokens: 4096,
      workspaceId: "ws-3",
    });

    expect(mockHttp.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/context",
      body: {
        query_id: "q-1",
        max_tokens: 4096,
      },
      workspaceId: "ws-3",
    });
  });

  it("context() should return context window", async () => {
    const mockHttp = createMockHttp(sampleContextWindow);
    const searchClient = new SearchClient(mockHttp);

    const result = await searchClient.context({ queryId: "q-1" });
    expect(result.assembled_text).toBe("context text");
    expect(result.chunks).toHaveLength(1);
  });
});
