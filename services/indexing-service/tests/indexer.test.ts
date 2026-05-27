import { describe, it, expect, beforeEach, vi } from "vitest";
import { IndexWriter, createIndexWriter } from "../src/indexer.js";
import type { Chunk, EmbeddingRecord, WorkspaceId } from "../src/types.js";

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

function makeEmbedding(chunkId: string, overrides: Partial<EmbeddingRecord> = {}): EmbeddingRecord {
  return {
    id: `emb_${chunkId}`,
    target_id: chunkId,
    target_type: "chunk",
    vector: Array(1536).fill(0.1),
    dimensions: 1536,
    model: "text-embedding-3-small",
    workspace_id: "ws_001" as WorkspaceId,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const mockQdrantClient = {
  upsert: vi.fn().mockResolvedValue({ status: "completed" }),
  search: vi.fn().mockResolvedValue([]),
  collectionExists: vi.fn().mockResolvedValue(true),
  createCollection: vi.fn().mockResolvedValue(true),
  getCollections: vi.fn().mockResolvedValue({ collections: [] }),
};

const mockPostgresSql = vi.fn().mockReturnValue([]) as any;
mockPostgresSql.end = vi.fn().mockResolvedValue(undefined);
mockPostgresSql.options = {};

const mockVectorClient = {
  client: mockQdrantClient,
  health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
  close: vi.fn().mockResolvedValue(undefined),
  listCollections: vi.fn().mockResolvedValue([]),
};

const mockPostgresPool = {
  sql: mockPostgresSql,
  health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@memory-platform/shared-utils", () => ({
  generateId: vi.fn((prefix?: string) => `${prefix ?? ""}${Math.random().toString(36).slice(2, 10)}`),
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

describe("IndexWriter", () => {
  let writer: IndexWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = createIndexWriter(mockVectorClient as any, mockPostgresPool as any);
  });

  it("returns zero counts for empty chunks", async () => {
    const result = await writer.writeIndex([], []);
    expect(result.vectorPointsWritten).toBe(0);
    expect(result.keywordRecordsWritten).toBe(0);
    expect(result.durationMs).toBe(0);
  });

  it("writes vector points to Qdrant", async () => {
    const chunks = [makeChunk(), makeChunk({ id: "chunk_002" })];
    const embeddings = [makeEmbedding("chunk_001"), makeEmbedding("chunk_002")];

    const result = await writer.writeIndex(chunks, embeddings);

    expect(mockQdrantClient.upsert).toHaveBeenCalledTimes(1);
    expect(result.vectorPointsWritten).toBe(2);
    expect(result.keywordRecordsWritten).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("skips vector write when no vector client", async () => {
    const writerNoVector = createIndexWriter(null, mockPostgresPool as any);
    const chunks = [makeChunk()];
    const embeddings = [makeEmbedding("chunk_001")];

    const result = await writerNoVector.writeIndex(chunks, embeddings);

    expect(result.vectorPointsWritten).toBe(0);
    expect(result.keywordRecordsWritten).toBe(1);
  });

  it("skips keyword write when no postgres client", async () => {
    const writerNoPg = createIndexWriter(mockVectorClient as any, null);
    const chunks = [makeChunk()];
    const embeddings = [makeEmbedding("chunk_001")];

    const result = await writerNoPg.writeIndex(chunks, embeddings);

    expect(result.vectorPointsWritten).toBe(1);
    expect(result.keywordRecordsWritten).toBe(0);
  });

  it("creates collection if autoCreateCollection is enabled and collection missing", async () => {
    mockQdrantClient.collectionExists.mockResolvedValueOnce(false);
    const chunks = [makeChunk()];
    const embeddings = [makeEmbedding("chunk_001")];

    await writer.writeIndex(chunks, embeddings);

    expect(mockQdrantClient.createCollection).toHaveBeenCalled();
  });

  it("skips chunks without matching embeddings for vector write", async () => {
    const chunks = [makeChunk(), makeChunk({ id: "chunk_002" })];
    const embeddings = [makeEmbedding("chunk_001")];

    const result = await writer.writeIndex(chunks, embeddings);

    expect(result.vectorPointsWritten).toBe(1);
  });

  it("includes payload metadata in vector points", async () => {
    const chunk = makeChunk({ id: "chunk_001", metadata: { section: "intro" } });
    const embedding = makeEmbedding("chunk_001");

    await writer.writeIndex([chunk], [embedding]);

    const upsertCall = mockQdrantClient.upsert.mock.calls[0];
    expect(upsertCall[1].points[0].payload).toMatchObject({
      document_id: chunk.document_id,
      workspace_id: chunk.workspace_id,
      sequence_number: chunk.sequence_number,
    });
  });

  it("closes cleanly", async () => {
    await writer.close();
    expect(true).toBe(true);
  });
});
