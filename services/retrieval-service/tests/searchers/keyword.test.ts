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

import { KeywordSearch } from "../../src/searchers/keyword.js";
import type { PostgresPool } from "@memory-platform/db";

function createMockPostgresPool(rows: Record<string, unknown>[] = []): PostgresPool {
  return {
    sql: {
      unsafe: vi.fn().mockResolvedValue(rows),
    } as unknown as PostgresPool["sql"],
    health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
    close: vi.fn(),
  };
}

describe("KeywordSearch", () => {
  it("executes keyword search with correct SQL", async () => {
    const mockPool = createMockPostgresPool([
      {
        chunk_id: "chunk-1",
        document_id: "doc-1",
        workspace_id: "ws-1",
        text: "Machine learning fundamentals",
        score: 0.85,
        headline: "<mark>Machine</mark> learning fundamentals",
        metadata: { author: "john" },
      },
    ]);

    const search = new KeywordSearch(mockPool);
    const results = await search.search("machine learning", "ws-1", {}, 5);

    expect(results).toHaveLength(1);
    expect(results[0].chunk_id).toBe("chunk-1");
    expect(results[0].score).toBe(0.85);
    expect(results[0].headline).toBe("<mark>Machine</mark> learning fundamentals");
    expect(mockPool.sql.unsafe).toHaveBeenCalledTimes(1);
  });

  it("converts query to tsquery format", async () => {
    const mockPool = createMockPostgresPool([]);
    const search = new KeywordSearch(mockPool);

    await search.search("machine learning basics", "ws-1", {}, 5);

    const callArgs = (mockPool.sql.unsafe as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain("to_tsquery('english'");
    expect(callArgs[0]).toContain("search_vector @@ to_tsquery");
  });

  it("applies filters to SQL query", async () => {
    const mockPool = createMockPostgresPool([]);
    const search = new KeywordSearch(mockPool);

    await search.search(
      "test",
      "ws-1",
      { document_ids: ["doc-1", "doc-2"] },
      5,
    );

    const sql = (mockPool.sql.unsafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sql).toContain("document_id IN");
    expect(sql).toContain("workspace_id = $1");
  });

  it("returns empty array when no matches", async () => {
    const mockPool = createMockPostgresPool([]);
    const search = new KeywordSearch(mockPool);
    const results = await search.search("xyznonexistent", "ws-1", {}, 5);
    expect(results).toHaveLength(0);
  });

  it("sorts results by score descending", async () => {
    const mockPool = createMockPostgresPool([
      { chunk_id: "c1", document_id: "d1", workspace_id: "ws-1", text: "text", score: 0.5, metadata: {} },
      { chunk_id: "c2", document_id: "d2", workspace_id: "ws-1", text: "text", score: 0.9, metadata: {} },
    ]);

    const search = new KeywordSearch(mockPool);
    const results = await search.search("test", "ws-1", {}, 5);

    expect(results[0].score).toBe(0.5);
  });

  it("handles custom table name", async () => {
    const mockPool = createMockPostgresPool([]);
    const search = new KeywordSearch(mockPool, { tableName: "custom_chunks" });
    await search.search("test", "ws-1", {}, 5);

    const sql = (mockPool.sql.unsafe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sql).toContain("FROM custom_chunks");
  });
});
