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

import { filterBuilder, applyFiltersToVector, applyFiltersToKeyword } from "../src/filters.js";
import type { VectorSearchResult, KeywordSearchResult } from "../src/types.js";

function makeVectorResult(overrides: Partial<VectorSearchResult> = {}): VectorSearchResult {
  return {
    chunk_id: "chunk-1",
    document_id: "doc-1",
    workspace_id: "ws-1",
    text: "test text",
    score: 0.95,
    metadata: { created_at: "2026-05-10T00:00:00.000Z", author: "test" },
    ...overrides,
  };
}

function makeKeywordResult(overrides: Partial<KeywordSearchResult> = {}): KeywordSearchResult {
  return {
    chunk_id: "chunk-1",
    document_id: "doc-1",
    workspace_id: "ws-1",
    text: "test text",
    score: 0.85,
    metadata: { created_at: "2026-05-10T00:00:00.000Z", author: "test" },
    ...overrides,
  };
}

describe("filterBuilder.buildQdrantFilter", () => {
  it("builds basic workspace filter", () => {
    const result = filterBuilder.buildQdrantFilter({}, "ws-1");
    expect(result.must).toBeDefined();
    const must = result.must as Array<Record<string, unknown>>;
    expect(must).toHaveLength(1);
    expect(must[0]).toEqual({ key: "workspace_id", match: { value: "ws-1" } });
  });

  it("adds document_ids filter for single doc", () => {
    const result = filterBuilder.buildQdrantFilter(
      { document_ids: ["doc-1"] },
      "ws-1",
    );
    const must = result.must as Array<Record<string, unknown>>;
    const docFilter = must.find((m) => m.key === "document_id");
    expect(docFilter).toBeDefined();
    expect(docFilter).toEqual({ key: "document_id", match: { value: "doc-1" } });
  });

  it("adds document_ids filter for multiple docs", () => {
    const result = filterBuilder.buildQdrantFilter(
      { document_ids: ["doc-1", "doc-2"] },
      "ws-1",
    );
    const must = result.must as Array<Record<string, unknown>>;
    const docFilter = must.find((m) => m.key === "document_id");
    expect(docFilter).toBeDefined();
    expect(docFilter).toEqual({ key: "document_id", match: { any: ["doc-1", "doc-2"] } });
  });

  it("adds tags filter", () => {
    const result = filterBuilder.buildQdrantFilter(
      { tags: ["ai", "ml"] },
      "ws-1",
    );
    const must = result.must as Array<Record<string, unknown>>;
    const tagFilter = must.find((m) => m.key === "tags");
    expect(tagFilter).toBeDefined();
    expect(tagFilter).toEqual({ key: "tags", match: { any: ["ai", "ml"] } });
  });

  it("adds date range filter", () => {
    const result = filterBuilder.buildQdrantFilter(
      { created_after: "2026-01-01T00:00:00.000Z", created_before: "2026-06-01T00:00:00.000Z" },
      "ws-1",
    );
    const must = result.must as Array<Record<string, unknown>>;
    const rangeFilter = must.find((m) => m.key === "created_at");
    expect(rangeFilter).toBeDefined();
    expect(rangeFilter).toEqual({
      key: "created_at",
      range: {
        gte: "2026-01-01T00:00:00.000Z",
        lte: "2026-06-01T00:00:00.000Z",
      },
    });
  });

  it("adds metadata filters", () => {
    const result = filterBuilder.buildQdrantFilter(
      { metadata: { author: "john", category: "tech" } },
      "ws-1",
    );
    const must = result.must as Array<Record<string, unknown>>;
    const authorFilter = must.find((m) => m.key === "metadata.author");
    expect(authorFilter).toBeDefined();
    expect(authorFilter).toEqual({ key: "metadata.author", match: { value: "john" } });
  });
});

describe("filterBuilder.buildPostgresConditions", () => {
  it("builds basic workspace condition", () => {
    const { conditions, params } = filterBuilder.buildPostgresConditions({}, "ws-1");
    expect(conditions).toContain("workspace_id = $1");
    expect(params).toEqual(["ws-1"]);
  });

  it("adds document_ids condition", () => {
    const { conditions, params } = filterBuilder.buildPostgresConditions(
      { document_ids: ["doc-1", "doc-2"] },
      "ws-1",
    );
    expect(conditions).toContain("document_id IN ($2, $3)");
    expect(params).toEqual(["ws-1", "doc-1", "doc-2"]);
  });

  it("adds date range conditions", () => {
    const { conditions, params } = filterBuilder.buildPostgresConditions(
      { created_after: "2026-01-01T00:00:00.000Z" },
      "ws-1",
    );
    expect(conditions).toContain("created_at >= $2");
    expect(params).toEqual(["ws-1", "2026-01-01T00:00:00.000Z"]);
  });
});

describe("applyFiltersToVector", () => {
  it("filters by workspace_id", () => {
    const results = [
      makeVectorResult({ workspace_id: "ws-1" }),
      makeVectorResult({ workspace_id: "ws-2" }),
    ];
    const filtered = applyFiltersToVector(results, {}, "ws-1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].workspace_id).toBe("ws-1");
  });

  it("filters by document_ids", () => {
    const results = [
      makeVectorResult({ document_id: "doc-1" }),
      makeVectorResult({ document_id: "doc-2" }),
    ];
    const filtered = applyFiltersToVector(results, { document_ids: ["doc-1"] }, "ws-1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].document_id).toBe("doc-1");
  });

  it("passes through when no filters match", () => {
    const results = [makeVectorResult()];
    const filtered = applyFiltersToVector(results, {}, "ws-1");
    expect(filtered).toHaveLength(1);
  });

  it("filters by metadata field", () => {
    const results = [
      makeVectorResult({ metadata: { author: "john" } }),
      makeVectorResult({ metadata: { author: "jane" } }),
    ];
    const filtered = applyFiltersToVector(results, { metadata: { author: "john" } }, "ws-1");
    expect(filtered).toHaveLength(1);
  });
});

describe("applyFiltersToKeyword", () => {
  it("filters by workspace_id", () => {
    const results = [
      makeKeywordResult({ workspace_id: "ws-1" }),
      makeKeywordResult({ workspace_id: "ws-2" }),
    ];
    const filtered = applyFiltersToKeyword(results, {}, "ws-1");
    expect(filtered).toHaveLength(1);
  });

  it("filters by document_ids", () => {
    const results = [
      makeKeywordResult({ document_id: "doc-1" }),
      makeKeywordResult({ document_id: "doc-2" }),
    ];
    const filtered = applyFiltersToKeyword(results, { document_ids: ["doc-2"] }, "ws-1");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].document_id).toBe("doc-2");
  });
});
