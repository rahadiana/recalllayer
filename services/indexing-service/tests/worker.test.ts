import { describe, it, expect, beforeEach, vi } from "vitest";
import { IndexingWorker, createIndexingWorker } from "../src/worker.js";
import { FixedSizeChunker } from "../src/chunker.js";
import { IndexingEventPublisher } from "../src/events.js";
import type { Document, ExtractedDocument, Chunk, EmbeddingRecord, IndexRecord } from "../src/types.js";

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc_001" as import("@memory-platform/shared-schemas").DocumentId,
    workspace_id: "ws_001" as import("@memory-platform/shared-schemas").WorkspaceId,
    title: "Test Document",
    status: "extracting",
    source: { type: "api" },
    metadata: {},
    tags: [],
    created_by: "test_user",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeExtracted(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    job_id: "job_001",
    document_id: "doc_001" as import("@memory-platform/shared-schemas").DocumentId,
    text: "This is the extracted text for testing. It has multiple sentences. Enough to create chunks.",
    text_length: 80,
    metadata: {},
    sections: [],
    extracted_at: new Date().toISOString(),
    ...overrides,
  };
}

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
  traceAsync: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
}));

describe("IndexingWorker", () => {
  let worker: IndexingWorker;
  let mockChunker: { chunk: ReturnType<typeof vi.fn>; name: string };
  let mockEmbedder: { embedChunks: ReturnType<typeof vi.fn>; model: string };
  let mockIndexer: { writeIndex: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let mockRepository: {
    saveChunks: ReturnType<typeof vi.fn>;
    saveEmbeddings: ReturnType<typeof vi.fn>;
    updateDocumentStatus: ReturnType<typeof vi.fn>;
  };
  let mockPublisher: {
    publishChunksCreated: ReturnType<typeof vi.fn>;
    publishEmbeddingsGenerated: ReturnType<typeof vi.fn>;
    publishDocumentIndexed: ReturnType<typeof vi.fn>;
    publishIndexingFailed: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockChunker = {
      chunk: vi.fn().mockReturnValue([
        {
          id: "chunk_001",
          document_id: "doc_001",
          workspace_id: "ws_001",
          sequence_number: 0,
          text: "First chunk",
          text_length: 10,
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ]),
      name: "fixed",
    };

    mockEmbedder = {
      embedChunks: vi.fn().mockResolvedValue({
        embeddings: [
          {
            id: "emb_001",
            target_id: "chunk_001",
            target_type: "chunk" as const,
            vector: Array(1536).fill(0.1),
            dimensions: 1536,
            model: "text-embedding-3-small",
            workspace_id: "ws_001",
            created_at: new Date().toISOString(),
          },
        ],
        model: "text-embedding-3-small",
        totalTokens: 10,
        durationMs: 50,
      }),
      model: "text-embedding-3-small",
    };

    mockIndexer = {
      writeIndex: vi.fn().mockResolvedValue({
        vectorPointsWritten: 1,
        keywordRecordsWritten: 1,
        durationMs: 20,
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockRepository = {
      saveChunks: vi.fn().mockResolvedValue(1),
      saveEmbeddings: vi.fn().mockResolvedValue(1),
      updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
    };

    mockPublisher = {
      publishChunksCreated: vi.fn().mockResolvedValue(undefined),
      publishEmbeddingsGenerated: vi.fn().mockResolvedValue(undefined),
      publishDocumentIndexed: vi.fn().mockResolvedValue(undefined),
      publishIndexingFailed: vi.fn().mockResolvedValue(undefined),
    };

    worker = createIndexingWorker({
      chunker: mockChunker as any,
      embedder: mockEmbedder as any,
      indexer: mockIndexer as any,
      repository: mockRepository as any,
      publisher: mockPublisher as any,
    });
  });

  it("completes the full indexing pipeline successfully", async () => {
    const doc = makeDocument();
    const extracted = makeExtracted();

    await worker.indexDocument(doc, extracted, "corr_123");

    expect(mockChunker.chunk).toHaveBeenCalledTimes(1);
    expect(mockRepository.updateDocumentStatus).toHaveBeenCalledWith("doc_001", "chunking");
    expect(mockPublisher.publishChunksCreated).toHaveBeenCalledWith("doc_001", 1, "corr_123");
    expect(mockRepository.saveChunks).toHaveBeenCalledTimes(1);
    expect(mockEmbedder.embedChunks).toHaveBeenCalledTimes(1);
    expect(mockPublisher.publishEmbeddingsGenerated).toHaveBeenCalledWith("doc_001", 1, "corr_123");
    expect(mockRepository.saveEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockIndexer.writeIndex).toHaveBeenCalledTimes(1);
    expect(mockRepository.updateDocumentStatus).toHaveBeenCalledWith("doc_001", "ready", 1);
    expect(mockPublisher.publishDocumentIndexed).toHaveBeenCalledWith("doc_001", 1, "corr_123");
  });

  it("handles empty chunking result gracefully", async () => {
    mockChunker.chunk.mockReturnValue([]);
    const doc = makeDocument();
    const extracted = makeExtracted();

    await worker.indexDocument(doc, extracted, null);

    expect(mockPublisher.publishDocumentIndexed).toHaveBeenCalledWith("doc_001", 0, null);
    expect(mockRepository.updateDocumentStatus).toHaveBeenCalledWith("doc_001", "ready", 0);
    expect(mockEmbedder.embedChunks).not.toHaveBeenCalled();
  });

  it("publishes indexing.failed on chunker error", async () => {
    mockChunker.chunk.mockImplementation(() => {
      throw new Error("Chunking failed");
    });

    const doc = makeDocument();
    const extracted = makeExtracted();

    await expect(worker.indexDocument(doc, extracted)).rejects.toThrow("Chunking failed");
    expect(mockPublisher.publishIndexingFailed).toHaveBeenCalled();
    expect(mockRepository.updateDocumentStatus).toHaveBeenCalledWith("doc_001", "error");
  });

  it("publishes indexing.failed on embedder error", async () => {
    mockEmbedder.embedChunks.mockRejectedValue(new Error("Embedding API down"));

    const doc = makeDocument();
    const extracted = makeExtracted();

    await expect(worker.indexDocument(doc, extracted)).rejects.toThrow("Embedding API down");
    expect(mockPublisher.publishIndexingFailed).toHaveBeenCalled();
  });

  it("publishes indexing.failed on indexer error", async () => {
    mockIndexer.writeIndex.mockRejectedValue(new Error("Qdrant unreachable"));

    const doc = makeDocument();
    const extracted = makeExtracted();

    await expect(worker.indexDocument(doc, extracted)).rejects.toThrow("Qdrant unreachable");
    expect(mockPublisher.publishIndexingFailed).toHaveBeenCalled();
  });

  it("passes correlationId through the pipeline", async () => {
    const doc = makeDocument();
    const extracted = makeExtracted();
    const cid = "trace_abc_123";

    await worker.indexDocument(doc, extracted, cid);

    expect(mockPublisher.publishChunksCreated).toHaveBeenCalledWith("doc_001", 1, cid);
    expect(mockPublisher.publishEmbeddingsGenerated).toHaveBeenCalledWith("doc_001", 1, cid);
    expect(mockPublisher.publishDocumentIndexed).toHaveBeenCalledWith("doc_001", 1, cid);
  });

  it("can be constructed with createIndexingWorker factory", () => {
    const w = createIndexingWorker({
      chunker: mockChunker as any,
      embedder: mockEmbedder as any,
      indexer: mockIndexer as any,
      repository: mockRepository as any,
      publisher: mockPublisher as any,
    });
    expect(w).toBeInstanceOf(IndexingWorker);
  });
});
