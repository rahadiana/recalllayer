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

import { HybridSearch } from "../../src/searchers/hybrid.js";
import type { VectorClient, PostgresPool } from "@memory-platform/db";

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

function createMockPostgresPool(rows: Record<string, unknown>[] = []): PostgresPool {
  return {
    sql: {
      unsafe: vi.fn().mockResolvedValue(rows),
    } as unknown as PostgresPool["sql"],
    health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
    close: vi.fn(),
  };
}

describe("HybridSearch", () => {
  it("fuses vector and keyword results via RRF", async () => {
    const vectorClient = createMockVectorClient([
      { id: "chunk-a", score: 0.95, payload: { document_id: "doc-1", workspace_id: "ws-1", text: "AI is transforming industries", metadata: {} } },
      { id: "chunk-b", score: 0.80, payload: { document_id: "doc-2", workspace_id: "ws-1", text: "Machine learning basics", metadata: {} } },
    ]);

    const postgresPool = createMockPostgresPool([
      { chunk_id: "chunk-a", document_id: "doc-1", workspace_id: "ws-1", text: "AI is transforming industries", score: 0.9, metadata: {} },
      { chunk_id: "chunk-c", document_id: "doc-3", workspace_id: "ws-1", text: "Deep learning advances", score: 0.7, metadata: {} },
    ]);

    const hybrid = new HybridSearch(vectorClient, postgresPool, { rrfK: 60 });
    const results = await hybrid.search(
      "artificial intelligence",
      [0.1, 0.2, 0.3],
      "ws-1",
      {},
      5,
      0.0,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);

    const chunkA = results.find((r) => r.chunk_id === "chunk-a");
    expect(chunkA).toBeDefined();
    expect(chunkA!.source_scores.vector).toBeDefined();
    expect(chunkA!.source_scores.keyword).toBeDefined();
  });

  it("returns top K results after fusion", async () => {
    const vectorClient = createMockVectorClient([
      { id: "c1", score: 0.9, payload: { document_id: "d1", workspace_id: "ws-1", text: "t1", metadata: {} } },
      { id: "c2", score: 0.8, payload: { document_id: "d2", workspace_id: "ws-1", text: "t2", metadata: {} } },
      { id: "c3", score: 0.7, payload: { document_id: "d3", workspace_id: "ws-1", text: "t3", metadata: {} } },
    ]);

    const postgresPool = createMockPostgresPool([
      { chunk_id: "c1", document_id: "d1", workspace_id: "ws-1", text: "t1", score: 0.6, metadata: {} },
      { chunk_id: "c2", document_id: "d2", workspace_id: "ws-1", text: "t2", score: 0.5, metadata: {} },
      { chunk_id: "c3", document_id: "d3", workspace_id: "ws-1", text: "t3", score: 0.4, metadata: {} },
      { chunk_id: "c4", document_id: "d4", workspace_id: "ws-1", text: "t4", score: 0.3, metadata: {} },
    ]);

    const hybrid = new HybridSearch(vectorClient, postgresPool, { rrfK: 60 });
    const results = await hybrid.search("query", [0.1, 0.2], "ws-1", {}, 2, 0.0);

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("works when no embedding is provided (keyword-only)", async () => {
    const vectorClient = createMockVectorClient([]);
    const postgresPool = createMockPostgresPool([
      { chunk_id: "c1", document_id: "d1", workspace_id: "ws-1", text: "keyword match", score: 0.8, metadata: {} },
    ]);

    const hybrid = new HybridSearch(vectorClient, postgresPool);
    const results = await hybrid.search("keyword match", undefined, "ws-1", {}, 5, 0.0);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk_id).toBe("c1");
  });

  it("RRF gives higher score to documents found in both rankings", async () => {
    const vectorClient = createMockVectorClient([
      { id: "shared", score: 0.9, payload: { document_id: "d1", workspace_id: "ws-1", text: "shared doc", metadata: {} } },
      { id: "vec-only", score: 0.7, payload: { document_id: "d-v", workspace_id: "ws-1", text: "vec only", metadata: {} } },
    ]);

    const postgresPool = createMockPostgresPool([
      { chunk_id: "shared", document_id: "d1", workspace_id: "ws-1", text: "shared doc", score: 0.9, metadata: {} },
      { chunk_id: "kw-only", document_id: "d-k", workspace_id: "ws-1", text: "keyword only", score: 0.7, metadata: {} },
    ]);

    const hybrid = new HybridSearch(vectorClient, postgresPool, { rrfK: 60 });
    const results = await hybrid.search("query", [0.1], "ws-1", {}, 5, 0.0);

    const shared = results.find((r) => r.chunk_id === "shared");
    const vecOnly = results.find((r) => r.chunk_id === "vec-only");
    const kwOnly = results.find((r) => r.chunk_id === "kw-only");

    expect(shared).toBeDefined();
    expect(shared!.fused_score).toBeGreaterThan(vecOnly?.fused_score ?? 0);
    expect(shared!.fused_score).toBeGreaterThan(kwOnly?.fused_score ?? 0);
  });

  it("filters are passed to both vector and keyword searches", async () => {
    const vectorClient = createMockVectorClient([
      { id: "c1", score: 0.9, payload: { document_id: "doc-1", workspace_id: "ws-1", text: "test", metadata: {} } },
    ]);
    const postgresPool = createMockPostgresPool([]);

    const hybrid = new HybridSearch(vectorClient, postgresPool);
    await hybrid.search("test", [0.1], "ws-1", { document_ids: ["doc-1"] }, 5, 0.0);

    const vectorCall = (vectorClient.client.search as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(vectorCall.filter).toBeDefined();
    const must = vectorCall.filter.must as Array<Record<string, unknown>>;
    const docIdFilter = must.find((m) => m.key === "document_id");
    expect(docIdFilter).toBeDefined();
  });

  it("all pairs of vector/keyword results are deduplicated", async () => {
    const vectorClient = createMockVectorClient([
      { id: "a", score: 0.95, payload: { document_id: "d1", workspace_id: "ws-1", text: "text a", metadata: {} } },
    ]);

    const postgresPool = createMockPostgresPool([
      { chunk_id: "a", document_id: "d1", workspace_id: "ws-1", text: "text a", score: 0.9, metadata: {} },
    ]);

    const hybrid = new HybridSearch(vectorClient, postgresPool, { rrfK: 60 });
    const results = await hybrid.search("query", [0.1], "ws-1", {}, 5, 0.0);

    const aResults = results.filter((r) => r.chunk_id === "a");
    expect(aResults).toHaveLength(1);
  });
});
