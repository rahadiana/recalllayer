import { describe, it, expect, beforeEach, vi } from "vitest";
import { EmbeddingWorker, createEmbeddingWorker } from "../src/embedder.js";
import type { EmbedderOptions, Chunk } from "../src/types.js";

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: "chunk_001",
    document_id: "doc_001" as import("@memory-platform/shared-schemas").DocumentId,
    workspace_id: "ws_001" as import("@memory-platform/shared-schemas").WorkspaceId,
    sequence_number: 0,
    text: "Hello world",
    text_length: 11,
    metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

vi.mock("@memory-platform/llm", () => {
  let _provider: import("../src/embedder.js").EmbeddingProvider | null = null;
  return {
    generateEmbeddings: vi.fn(async (texts: string[]) => {
      if (_provider && texts.length === 1) {
        return _provider.generateEmbedding(texts[0]);
      }
      return {
        data: texts.map(() => Array(1536).fill(0.1)),
        usage: { promptTokens: texts.length * 10, completionTokens: 0, totalTokens: texts.length * 10 },
        model: "text-embedding-3-small",
        provider: "openai",
        latencyMs: 50,
      };
    }),
    generateEmbedding: vi.fn(async (_text: string) => ({
      data: Array(1536).fill(0.1),
      usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
      model: "text-embedding-3-small",
      provider: "openai",
      latencyMs: 30,
    })),
    setDefaultEmbeddingProvider: vi.fn((p: any) => { _provider = p; }),
    OpenAIEmbeddingProvider: vi.fn(),
  };
});

vi.mock("@memory-platform/shared-utils", () => ({
  generateId: vi.fn((prefix?: string) => `${prefix ?? ""}${Math.random().toString(36).slice(2, 10)}`),
  retry: vi.fn(async (fn: () => Promise<unknown>) => fn(0)),
}));

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  })),
  recordMetric: vi.fn(),
}));

const WS_ID = "ws_001" as import("@memory-platform/shared-schemas").WorkspaceId;

describe("EmbeddingWorker", () => {
  let worker: EmbeddingWorker;

  beforeEach(() => {
    worker = createEmbeddingWorker();
  });

  it("returns empty result for empty chunks array", async () => {
    const result = await worker.embedChunks([], WS_ID);
    expect(result.embeddings).toEqual([]);
    expect(result.totalTokens).toBe(0);
    expect(result.durationMs).toBe(0);
  });

  it("generates embeddings for a single chunk", async () => {
    const chunk = makeChunk();
    const result = await worker.embedChunks([chunk], WS_ID);

    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0].target_id).toBe(chunk.id);
    expect(result.embeddings[0].target_type).toBe("chunk");
    expect(result.embeddings[0].vector).toHaveLength(1536);
    expect(result.embeddings[0].model).toBe("text-embedding-3-small");
    expect(result.embeddings[0].workspace_id).toBe(WS_ID);
    expect(result.model).toBe("text-embedding-3-small");
  });

  it("generates embeddings for multiple chunks in batches", async () => {
    const chunks = Array.from({ length: 45 }, (_, i) =>
      makeChunk({ id: `chunk_${i}`, sequence_number: i }),
    );

    const result = await worker.embedChunks(chunks, WS_ID);

    expect(result.embeddings).toHaveLength(45);
    expect(result.totalTokens).toBeGreaterThan(0);

    const ids = new Set(result.embeddings.map((e) => e.target_id));
    expect(ids.size).toBe(45);
  });

  it("reports the correct model name", () => {
    expect(worker.model).toBe("text-embedding-3-small");
  });

  it("uses custom model when specified", async () => {
    const customWorker = createEmbeddingWorker({ model: "text-embedding-3-large" });
    expect(customWorker.model).toBe("text-embedding-3-large");

    const chunk = makeChunk();
    const result = await customWorker.embedChunks([chunk], WS_ID);
    expect(result.model).toBe("text-embedding-3-large");
  });

  it("records metrics during embedding", async () => {
    const { recordMetric } = await import("@memory-platform/observability");
    const chunk = makeChunk();
    await worker.embedChunks([chunk], WS_ID);

    expect(recordMetric).toHaveBeenCalled();
  });
});
