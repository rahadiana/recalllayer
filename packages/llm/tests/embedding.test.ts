import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelResult, TokenUsage } from "../src/types.js";

vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: {
        create: vi.fn(),
      },
    })),
  };
});

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

import OpenAI from "openai";
import {
  OpenAIEmbeddingProvider,
  setDefaultEmbeddingProvider,
  generateEmbedding,
  generateEmbeddings,
} from "../src/providers/embedding.js";

const mockCreateEmbedding = vi.fn();
(OpenAI as unknown as vi.Mock).mockImplementation(() => ({
  embeddings: {
    create: mockCreateEmbedding,
  },
}));

describe("OpenAIEmbeddingProvider", () => {
  let provider: OpenAIEmbeddingProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIEmbeddingProvider({ apiKey: "test-key" });
  });

  const makeEmbeddingResponse = (embeddings: number[][], model: string, usage: TokenUsage) => ({
    data: embeddings.map((embedding, i) => ({ embedding, index: i, object: "embedding" as const })),
    model,
    usage: { prompt_tokens: usage.promptTokens, total_tokens: usage.totalTokens },
  });

  it("generates a single embedding", async () => {
    const embedding = [0.1, 0.2, 0.3];
    mockCreateEmbedding.mockResolvedValueOnce(
      makeEmbeddingResponse([embedding], "text-embedding-3-small", {
        promptTokens: 5,
        completionTokens: 0,
        totalTokens: 5,
      }),
    );

    const result = await provider.generateEmbedding("hello");

    expect(result.data).toEqual(embedding);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("text-embedding-3-small");
    expect(result.usage.promptTokens).toBe(5);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockCreateEmbedding).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "hello",
      dimensions: undefined,
      user: undefined,
    });
  });

  it("generates batch embeddings", async () => {
    const embeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    mockCreateEmbedding.mockResolvedValueOnce(
      makeEmbeddingResponse(embeddings, "text-embedding-3-large", {
        promptTokens: 10,
        completionTokens: 0,
        totalTokens: 10,
      }),
    );

    const result = await provider.generateEmbeddings(["hello", "world"], {
      model: "text-embedding-3-large",
    });

    expect(result.data).toEqual(embeddings);
    expect(result.model).toBe("text-embedding-3-large");
    expect(mockCreateEmbedding).toHaveBeenCalledWith({
      model: "text-embedding-3-large",
      input: ["hello", "world"],
      dimensions: undefined,
      user: undefined,
    });
  });

  it("passes dimensions option", async () => {
    mockCreateEmbedding.mockResolvedValueOnce(
      makeEmbeddingResponse([[0.1]], "text-embedding-3-small", {
        promptTokens: 1,
        completionTokens: 0,
        totalTokens: 1,
      }),
    );

    await provider.generateEmbedding("test", { dimensions: 256 });
    expect(mockCreateEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: 256 }),
    );
  });

  it("retries on API errors", async () => {
    mockCreateEmbedding
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce(
        makeEmbeddingResponse([[0.1]], "text-embedding-3-small", {
          promptTokens: 1,
          completionTokens: 0,
          totalTokens: 1,
        }),
      );

    const result = await provider.generateEmbedding("test");
    expect(result.data).toEqual([0.1]);
    expect(mockCreateEmbedding).toHaveBeenCalledTimes(2);
  }, 10000);
});

describe("convenience functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateEmbedding uses default provider", async () => {
    const mockProvider = {
      name: "mock",
      generateEmbedding: vi.fn().mockResolvedValue({
        data: [0.1],
        usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
        model: "mock-model",
        provider: "mock",
        latencyMs: 0,
      }),
      generateEmbeddings: vi.fn(),
    };

    setDefaultEmbeddingProvider(mockProvider);

    const result = await generateEmbedding("hello");
    expect(result.data).toEqual([0.1]);
    expect(mockProvider.generateEmbedding).toHaveBeenCalledWith("hello", undefined);
  });

  it("generateEmbeddings uses default provider", async () => {
    const mockProvider = {
      name: "mock",
      generateEmbedding: vi.fn(),
      generateEmbeddings: vi.fn().mockResolvedValue({
        data: [[0.1], [0.2]],
        usage: { promptTokens: 2, completionTokens: 0, totalTokens: 2 },
        model: "mock-model",
        provider: "mock",
        latencyMs: 0,
      }),
    };

    setDefaultEmbeddingProvider(mockProvider);

    const result = await generateEmbeddings(["a", "b"], { model: "mock" });
    expect(result.data).toEqual([[0.1], [0.2]]);
  });
});
