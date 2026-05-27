import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@memory-platform/observability", () => {
  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    createLogger: vi.fn().mockReturnValue(mockLogger),
    recordMetric: vi.fn(),
    getCorrelationId: vi.fn().mockReturnValue(null),
  };
});

import { VectorSearch } from "../../src/searchers/vector.js";
import type { VectorClient } from "@memory-platform/db";

function createMockVectorClient(results: Array<{ id: string; score: number; payload: Record<string, unknown> }> = []): VectorClient {
  return {
    client: {
      search: vi.fn().mockResolvedValue(results),
      getCollections: vi.fn(),
      createCollection: vi.fn(),
      deleteCollection: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      scroll: vi.fn(),
      count: vi.fn(),
    } as unknown as VectorClient["client"],
    health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
    close: vi.fn(),
    listCollections: vi.fn().mockResolvedValue(["chunks"]),
  };
}

describe("VectorSearch", () => {
  it("executes vector search with correct parameters", async () => {
    const mockClient = createMockVectorClient([
      {
        id: "chunk-1",
        score: 0.95,
        payload: {
          document_id: "doc-1",
          workspace_id: "ws-1",
          text: "This is test content about machine learning",
          metadata: { author: "john" },
        },
      },
    ]);

    const search = new VectorSearch(mockClient);
    const results = await search.search(
      [0.1, 0.2, 0.3],
      "ws-1",
      {},
      5,
      0.5,
    );

    expect(results).toHaveLength(1);
    expect(results[0].chunk_id).toBe("chunk-1");
    expect(results[0].score).toBe(0.95);
    expect(results[0].text).toBe("This is test content about machine learning");
    expect(mockClient.client.search).toHaveBeenCalledWith("chunks", expect.objectContaining({
      vector: [0.1, 0.2, 0.3],
      limit: 5,
      score_threshold: 0.5,
    }));
  });

  it("returns empty array when no results found", async () => {
    const mockClient = createMockVectorClient([]);
    const search = new VectorSearch(mockClient);
    const results = await search.search([0.1], "ws-1", {}, 5, 0.0);
    expect(results).toHaveLength(0);
  });

  it("applies filters to vector search", async () => {
    const mockClient = createMockVectorClient([
      {
        id: "chunk-1",
        score: 0.8,
        payload: {
          document_id: "doc-1",
          workspace_id: "ws-1",
          text: "content",
          metadata: {},
        },
      },
    ]);

    const search = new VectorSearch(mockClient);
    await search.search(
      [0.1, 0.2],
      "ws-1",
      { document_ids: ["doc-1"], tags: ["ai"] },
      3,
      0.0,
    );

    const callArgs = (mockClient.client.search as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.filter).toBeDefined();
    expect(callArgs.filter.must).toBeDefined();
    expect(callArgs.filter.must.length).toBeGreaterThan(1);
  });

  it("handles custom collection name", async () => {
    const mockClient = createMockVectorClient([]);
    const search = new VectorSearch(mockClient, { collectionName: "custom_chunks" });
    await search.search([0.1], "ws-1", {}, 5, 0.0);
    expect(mockClient.client.search).toHaveBeenCalledWith("custom_chunks", expect.anything());
  });

  it("maps payload fields correctly", async () => {
    const mockClient = createMockVectorClient([
      {
        id: "chunk-abc",
        score: 0.92,
        payload: {
          document_id: "doc-xyz",
          workspace_id: "ws-xyz",
          text: "Sample text for testing",
          metadata: { page: 1, section: "intro" },
        },
      },
      {
        id: "chunk-def",
        score: 0.88,
        payload: {
          document_id: "doc-xyz",
          workspace_id: "ws-xyz",
          text: "Another sample text",
          metadata: { page: 2, section: "body" },
        },
      },
    ]);

    const search = new VectorSearch(mockClient);
    const results = await search.search([0.1, 0.2], "ws-1", {}, 10, 0.0);

    expect(results).toHaveLength(2);
    expect(results[0].chunk_id).toBe("chunk-abc");
    expect(results[1].chunk_id).toBe("chunk-def");
    expect(results[0].metadata).toEqual({ page: 1, section: "intro" });
    expect(results[0].document_id).toBe("doc-xyz");
  });
});
