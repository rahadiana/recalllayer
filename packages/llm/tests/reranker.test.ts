import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SimpleReranker,
  setDefaultReranker,
  rerank,
} from "../src/providers/reranker.js";
import type { RerankerProvider } from "../src/providers/reranker.js";

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

describe("SimpleReranker", () => {
  let reranker: SimpleReranker;

  beforeEach(() => {
    vi.clearAllMocks();
    reranker = new SimpleReranker();
  });

  it("reranks documents by relevance", async () => {
    const query = "machine learning";
    const documents = [
      "Deep learning is a subset of machine learning",
      "The weather today is sunny",
      "Machine learning algorithms are powerful",
    ];

    const result = await reranker.rerank(query, documents);

    expect(result.data).toHaveLength(3);
    expect(result.provider).toBe("simple");
    expect(result.usage.totalTokens).toBeGreaterThan(0);

    expect(result.data[0].index).toBe(0);
    expect(result.data[0].relevanceScore).toBeGreaterThan(0);
  });

  it("respects topK option", async () => {
    const query = "test";
    const documents = ["a", "b", "c", "d", "e"];

    const result = await reranker.rerank(query, documents, { topK: 3 });

    expect(result.data).toHaveLength(3);
  });

  it("optionally omits document text", async () => {
    const query = "test";
    const documents = ["test document"];

    const result = await reranker.rerank(query, documents, {
      returnDocuments: false,
    });

    expect(result.data[0].document).toBeUndefined();
    expect(result.data[0].index).toBe(0);
  });

  it("scores highly related documents higher", async () => {
    const query = "artificial intelligence";
    const related = "Artificial intelligence is transforming the world";
    const unrelated = "I like pizza and pasta";

    const result = await reranker.rerank(query, [unrelated, related]);

    expect(result.data[0].index).toBe(1);
    expect(result.data[0].relevanceScore).toBeGreaterThan(
      result.data[1].relevanceScore,
    );
  });

  it("handles empty document list", async () => {
    const result = await reranker.rerank("query", []);
    expect(result.data).toHaveLength(0);
  });

  it("returns zero scores for unrelated documents", async () => {
    const query = "quantum computing";
    const documents = ["completely different topic"];

    const result = await reranker.rerank(query, documents);
    expect(result.data[0].relevanceScore).toBe(0);
  });
});

describe("convenience function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rerank uses default provider", async () => {
    const mockProvider: RerankerProvider = {
      name: "mock",
      rerank: vi.fn().mockResolvedValue({
        data: [{ index: 0, document: "doc", relevanceScore: 0.9 }],
        usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
        model: "mock",
        provider: "mock",
        latencyMs: 0,
      }),
    };

    setDefaultReranker(mockProvider);

    const result = await rerank("q", ["doc"]);
    expect(result.data[0].relevanceScore).toBe(0.9);
    expect(mockProvider.rerank).toHaveBeenCalled();
  });

  it("rerank with explicit topK overrides options", async () => {
    const mockProvider: RerankerProvider = {
      name: "mock",
      rerank: vi.fn().mockResolvedValue({
        data: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: "mock",
        provider: "mock",
        latencyMs: 0,
      }),
    };

    setDefaultReranker(mockProvider);

    await rerank("q", ["a", "b", "c"], 2, { returnDocuments: true });
    expect(mockProvider.rerank).toHaveBeenCalledWith("q", ["a", "b", "c"], {
      topK: 2,
      returnDocuments: true,
    });
  });
});
