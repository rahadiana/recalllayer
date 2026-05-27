import { describe, it, expect } from "vitest";
import { FixedSizeChunker, createChunker } from "../src/chunker.js";
import { DEFAULT_CHUNKER_OPTIONS } from "../src/types.js";
import type { ChunkerOptions } from "../src/types.js";

const DOC_ID = "doc_test_001" as import("@memory-platform/shared-schemas").DocumentId;
const WS_ID = "ws_test_001" as import("@memory-platform/shared-schemas").WorkspaceId;

function makeOpts(overrides: Partial<ChunkerOptions> = {}): ChunkerOptions {
  return { ...DEFAULT_CHUNKER_OPTIONS, ...overrides };
}

describe("FixedSizeChunker", () => {
  const chunker = new FixedSizeChunker();

  it("returns an empty array for empty text", () => {
    const result = chunker.chunk("", DOC_ID, WS_ID, makeOpts());
    expect(result).toEqual([]);
  });

  it("returns a single chunk for text smaller than maxChunkSize", () => {
    const result = chunker.chunk("Hello world", DOC_ID, WS_ID, makeOpts({ maxChunkSize: 100 }));
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello world");
    expect(result[0].sequence_number).toBe(0);
    expect(result[0].document_id).toBe(DOC_ID);
    expect(result[0].workspace_id).toBe(WS_ID);
  });

  it("splits text into multiple chunks when exceeding maxChunkSize", () => {
    const text = "A".repeat(2500);
    const result = chunker.chunk(text, DOC_ID, WS_ID, makeOpts({ maxChunkSize: 1000, overlapSize: 0, preserveSentences: false }));
    expect(result.length).toBeGreaterThan(1);
    expect(result.length).toBe(3);
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(1000);
    }
  });

  it("assigns sequential sequence numbers", () => {
    const text = "A".repeat(2500);
    const result = chunker.chunk(text, DOC_ID, WS_ID, makeOpts({ maxChunkSize: 1000, overlapSize: 0, preserveSentences: false }));
    for (let i = 0; i < result.length; i++) {
      expect(result[i].sequence_number).toBe(i);
    }
  });

  it("includes base metadata in each chunk", () => {
    const result = chunker.chunk(
      "Hello world",
      DOC_ID,
      WS_ID,
      makeOpts(),
      { source: "test", language: "en" },
    );
    expect(result[0].metadata).toMatchObject({ source: "test", language: "en" });
    expect(result[0].metadata).toHaveProperty("position", 0);
  });

  it("preserves sentence boundaries when preserveSentences is true", () => {
    const text = "First sentence. Second sentence. Third sentence. Fourth sentence.";
    const result = chunker.chunk(text, DOC_ID, WS_ID, makeOpts({
      maxChunkSize: 20,
      overlapSize: 0,
      preserveSentences: true,
    }));

    for (const chunk of result) {
      expect(
        chunk.text.endsWith(".") ||
        chunk.text.endsWith("!") ||
        chunk.text.endsWith("?") ||
        chunk.text.length <= 20,
      ).toBe(true);
    }
  });

  it("handles overlap between chunks", () => {
    const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const result = chunker.chunk(text, DOC_ID, WS_ID, makeOpts({
      maxChunkSize: 10,
      overlapSize: 5,
      preserveSentences: false,
    }));

    expect(result.length).toBeGreaterThan(1);
  });

  it("generates unique chunk IDs", () => {
    const text = "A".repeat(3000);
    const result = chunker.chunk(text, DOC_ID, WS_ID, makeOpts({ maxChunkSize: 1000, preserveSentences: false }));
    const ids = new Set(result.map((c) => c.id));
    expect(ids.size).toBe(result.length);
  });

  it("records text_length correctly", () => {
    const result = chunker.chunk("Hello, World!", DOC_ID, WS_ID, makeOpts());
    expect(result[0].text_length).toBe("Hello, World!".length);
  });

  it("trims whitespace from chunks", () => {
    const result = chunker.chunk("  hello  ", DOC_ID, WS_ID, makeOpts());
    expect(result[0].text).toBe("hello");
  });
});

describe("createChunker", () => {
  it("returns FixedSizeChunker for 'fixed' strategy", () => {
    const c = createChunker("fixed");
    expect(c).toBeInstanceOf(FixedSizeChunker);
    expect(c.name).toBe("fixed");
  });

  it("returns FixedSizeChunker by default", () => {
    const c = createChunker();
    expect(c).toBeInstanceOf(FixedSizeChunker);
  });

  it("throws for unknown strategy", () => {
    expect(() => createChunker("magic")).toThrow("Unknown chunking strategy: magic");
  });
});

describe("FixedSizeChunker.toConfig", () => {
  it("converts ChunkerOptions to ChunkingConfig", () => {
    const chunker = new FixedSizeChunker();
    const config = chunker.toConfig(makeOpts({ maxChunkSize: 800, overlapSize: 100 }));
    expect(config).toEqual({
      max_chunk_size: 800,
      overlap_size: 100,
      strategy: "fixed",
      separators: DEFAULT_CHUNKER_OPTIONS.separators,
    });
  });
});
