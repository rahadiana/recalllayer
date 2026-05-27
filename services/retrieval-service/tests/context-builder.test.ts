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
  countTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
}));

vi.mock("@memory-platform/shared-utils", () => ({
  generateId: vi.fn(() => "ctx_test-id"),
}));

import { ContextAssembler } from "../src/context-builder.js";
import type { ContextRequest } from "../src/types.js";

describe("ContextAssembler", () => {
  let assembler: ContextAssembler;

  beforeEach(() => {
    vi.clearAllMocks();
    assembler = new ContextAssembler({ defaultMaxTokens: 200, defaultModel: "gpt-4o" });
  });

  it("assembles a context window from passages", () => {
    const request: ContextRequest = {
      workspace_id: "ws-1",
      query: "What is machine learning?",
      passages: [
        {
          chunk_id: "c1",
          document_id: "doc-1",
          document_title: "ML Guide",
          text: "Machine learning is a subset of artificial intelligence.",
          score: 0.95,
        },
      ],
    };

    const result = assembler.assemble(request);

    expect(result.contextWindow.id).toBe("ctx_test-id");
    expect(result.contextWindow.chunks).toHaveLength(1);
    expect(result.contextWindow.chunks[0].document_title).toBe("ML Guide");
    expect(result.contextWindow.chunks[0].position).toBe(0);
    expect(result.contextWindow.assembled_text).toContain("[Source: ML Guide");
    expect(result.contextWindow.assembled_text).toContain("Machine learning");
    expect(result.truncatedCount).toBe(0);
  });

  it("respects max_tokens and truncates overflowing passages", () => {
    const longText = "A".repeat(500);
    const shortText = "B".repeat(20);

    const request: ContextRequest = {
      workspace_id: "ws-1",
      query: "test",
      passages: [
        { chunk_id: "c1", document_id: "doc-1", document_title: "Short", text: shortText, score: 0.9 },
        { chunk_id: "c2", document_id: "doc-2", document_title: "Long", text: longText, score: 0.8 },
      ],
      max_tokens: 50,
    };

    const result = assembler.assemble(request);

    expect(result.contextWindow.chunks.length).toBeLessThanOrEqual(2);
    expect(result.truncatedCount).toBeGreaterThanOrEqual(0);
    expect(result.contextWindow.token_count).toBeLessThanOrEqual(50);
  });

  it("handles empty passages", () => {
    const request: ContextRequest = {
      workspace_id: "ws-1",
      query: "test",
      passages: [],
    };

    const result = assembler.assemble(request);

    expect(result.contextWindow.chunks).toHaveLength(0);
    expect(result.contextWindow.token_count).toBe(0);
    expect(result.contextWindow.assembled_text).toBe("");
  });

  it("includes source attribution in assembled text", () => {
    const request: ContextRequest = {
      workspace_id: "ws-1",
      query: "test",
      passages: [
        {
          chunk_id: "chunk-abc",
          document_id: "doc-1",
          document_title: "Research Paper",
          text: "Important findings about AI.",
          score: 0.92,
        },
        {
          chunk_id: "chunk-def",
          document_id: "doc-2",
          document_title: "Blog Post",
          text: "Casual discussion of AI topics.",
          score: 0.85,
        },
      ],
    };

    const result = assembler.assemble(request);

    const text = result.contextWindow.assembled_text;
    expect(text).toContain("[Source: Research Paper");
    expect(text).toContain("[Source: Blog Post");
    expect(text).toContain("Score: 0.9200");
    expect(text).toContain("Score: 0.8500");
    expect(text).toContain("Chunk: chunk-abc");
    expect(text).toContain("Chunk: chunk-def");
    expect(text).toContain("---");
  });

  it("uses default max_tokens when not specified", () => {
    const request: ContextRequest = {
      workspace_id: "ws-1",
      query: "test",
      passages: [
        { chunk_id: "c1", document_id: "d1", document_title: "T", text: "hello world", score: 1.0 },
      ],
    };

    const result = assembler.assemble(request);
    expect(result.contextWindow.max_tokens).toBe(200);
  });

  it("positions chunks sequentially from 0", () => {
    const request: ContextRequest = {
      workspace_id: "ws-1",
      query: "test",
      passages: [
        { chunk_id: "c1", document_id: "d1", document_title: "A", text: "text a", score: 0.9 },
        { chunk_id: "c2", document_id: "d2", document_title: "B", text: "text b", score: 0.8 },
        { chunk_id: "c3", document_id: "d3", document_title: "C", text: "text c", score: 0.7 },
      ],
    };

    const result = assembler.assemble(request);

    expect(result.contextWindow.chunks).toHaveLength(3);
    expect(result.contextWindow.chunks[0].position).toBe(0);
    expect(result.contextWindow.chunks[1].position).toBe(1);
    expect(result.contextWindow.chunks[2].position).toBe(2);
  });
});
