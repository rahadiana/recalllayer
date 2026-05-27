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

vi.mock("@memory-platform/llm", () => ({
  rerank: vi.fn().mockResolvedValue({
    data: [
      { index: 2, relevanceScore: 0.95 },
      { index: 0, relevanceScore: 0.80 },
      { index: 1, relevanceScore: 0.60 },
    ],
    usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
    model: "mock-reranker",
    provider: "mock",
    latencyMs: 10,
  }),
}));

import { RerankerPipeline } from "../src/reranker.js";
import { rerank as rerankFn } from "@memory-platform/llm";
import type { SearchResult } from "@memory-platform/shared-schemas";

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    rank: 1,
    chunk_id: "chunk-1",
    document_id: "doc-1",
    text: "test text",
    score: 0.9,
    metadata: {},
    ...overrides,
  };
}

describe("RerankerPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reranks results using default reranker", async () => {
    const reranker = new RerankerPipeline();
    const results = [
      makeResult({ rank: 1, chunk_id: "c1", text: "document one", score: 0.9 }),
      makeResult({ rank: 2, chunk_id: "c2", text: "document two", score: 0.8 }),
      makeResult({ rank: 3, chunk_id: "c3", text: "document three", score: 0.7 }),
    ];

    const reranked = await reranker.rerank("query", results, { model: "cohere", top_n: 3 });

    expect(reranked).toHaveLength(3);
    expect(reranked[0].rerank_score).toBeDefined();
    expect(reranked[0].rerank_score).toBe(0.95);
    expect(rerankFn).toHaveBeenCalled();
  });

  it("updates ranks after reranking", async () => {
    const reranker = new RerankerPipeline();
    const results = [
      makeResult({ rank: 1, chunk_id: "c1", score: 0.9 }),
      makeResult({ rank: 2, chunk_id: "c2", score: 0.8 }),
      makeResult({ rank: 3, chunk_id: "c3", score: 0.7 }),
    ];

    const reranked = await reranker.rerank("query", results, { model: "test", top_n: 3 });

    expect(reranked[0].rank).toBe(1);
    expect(reranked[1].rank).toBe(2);
    expect(reranked[2].rank).toBe(3);
  });

  it("handles empty result set", async () => {
    const reranker = new RerankerPipeline();
    const reranked = await reranker.rerank("query", [], { model: "test", top_n: 5 });
    expect(reranked).toHaveLength(0);
  });

  it("only reranks top_n candidates, preserves remaining order", async () => {
    const reranker = new RerankerPipeline();
    const results = [
      makeResult({ rank: 1, chunk_id: "c1", score: 0.95 }),
      makeResult({ rank: 2, chunk_id: "c2", score: 0.8 }),
      makeResult({ rank: 3, chunk_id: "c3", score: 0.7 }),
      makeResult({ rank: 4, chunk_id: "c4", score: 0.6 }),
      makeResult({ rank: 5, chunk_id: "c5", score: 0.5 }),
    ];

    const reranked = await reranker.rerank("query", results, { model: "test", top_n: 3 });

    expect(reranked).toHaveLength(5);
    expect(reranked.slice(0, 3).every((r) => r.rerank_score !== undefined)).toBe(true);
  });

  it("respects custom reranker provider", async () => {
    const mockProvider = {
      name: "custom",
      rerank: vi.fn().mockResolvedValue({
        data: [{ index: 0, relevanceScore: 0.99 }],
        usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
        model: "custom",
        provider: "custom",
        latencyMs: 1,
      }),
    };

    const reranker = new RerankerPipeline({ rerankerProvider: mockProvider });
    const results = [makeResult({ chunk_id: "c1", text: "test" })];
    await reranker.rerank("query", results, { model: "custom", top_n: 1 });

    expect(mockProvider.rerank).toHaveBeenCalledTimes(1);
    expect(rerankFn).not.toHaveBeenCalled();
  });
});
