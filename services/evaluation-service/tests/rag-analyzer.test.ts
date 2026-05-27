import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
  recordMetric: vi.fn(),
  getCorrelationId: vi.fn().mockReturnValue(null),
}));

import { createRagAnalyzer } from "../src/rag-analyzer.js";
import type { RagTrace, WorkspaceId } from "../src/types.js";

function makeTrace(overrides: Partial<RagTrace> = {}): RagTrace {
  return {
    id: "trace-1",
    query: "test query",
    workspace_id: "ws-1" as WorkspaceId,
    retrieved_chunks: [
      { chunk_id: "chunk-1", document_id: "doc-1", text: "relevant content", score: 0.9, rank: 1 },
      { chunk_id: "chunk-2", document_id: "doc-2", text: "somewhat relevant", score: 0.6, rank: 2 },
      { chunk_id: "chunk-3", document_id: "doc-3", text: "not relevant", score: 0.2, rank: 3 },
    ],
    captured_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("RagAnalyzer", () => {
  let analyzer: ReturnType<typeof createRagAnalyzer>;

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = createRagAnalyzer();
  });

  describe("analyzeTrace", () => {
    it("returns low risk for high-quality trace", () => {
      const result = analyzer.analyzeTrace(makeTrace());
      expect(result.risk_level).toBe("low");
      expect(result.risk_score).toBeLessThanOrEqual(0.1);
      expect(result.context_sufficient).toBe(true);
      expect(result.hallucinated_sources).toBe(false);
    });

    it("returns medium/high risk when no chunks retrieved", () => {
      const result = analyzer.analyzeTrace(
        makeTrace({ retrieved_chunks: [] }),
      );
      expect(result.risk_level).toBe("medium");
      expect(result.context_sufficient).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("detects low-quality chunks", () => {
      const result = analyzer.analyzeTrace(
        makeTrace({
          retrieved_chunks: [
            { chunk_id: "c1", document_id: "d1", text: "", score: 0.1, rank: 1 },
            { chunk_id: "c2", document_id: "d2", text: "", score: 0.2, rank: 2 },
          ],
        }),
      );
      expect(result.low_quality_chunks_count).toBe(2);
      expect(result.avg_chunk_relevance).toBeCloseTo(0.15, 2);
      expect(result.context_sufficient).toBe(false);
    });

    it("detects hallucinated sources via UUID patterns", () => {
      const result = analyzer.analyzeTrace(
        makeTrace({
          llm_response: "Source doc_00000000-0000-4000-a000-000000000001 confirms this.",
          retrieved_chunks: [
            { chunk_id: "chunk-1", document_id: "doc-1", text: "", score: 0.9, rank: 1 },
          ],
        }),
      );

      expect(result.hallucinated_sources).toBe(true);
    });

    it("does not flag references to retrieved chunks as hallucination", () => {
      const trace = makeTrace({
        llm_response: "Source chunk-1 confirms this.",
      });
      const result = analyzer.analyzeTrace(trace);
      expect(result.hallucinated_sources).toBe(false);
    });

    it("detects context sufficiency correctly", () => {
      const result = analyzer.analyzeTrace(
        makeTrace({
          retrieved_chunks: [
            { chunk_id: "c1", document_id: "d1", text: "", score: 0.9, rank: 1 },
          ],
        }),
      );
      expect(result.context_sufficient).toBe(true);
    });
  });

  describe("analyzeTraces", () => {
    it("aggregates risk across multiple traces", () => {
      const traces = [
        makeTrace({ id: "t1", retrieved_chunks: [] }),
        makeTrace({ id: "t2", retrieved_chunks: [] }),
        makeTrace({ id: "t3", retrieved_chunks: [] }),
      ];

      const result = analyzer.analyzeTraces(traces);
      expect(result.risk_level).toBe("medium");
      expect(result.total_chunks_retrieved).toBe(0);
      expect(result.context_sufficient).toBe(false);
    });

    it("returns low risk for empty traces", () => {
      const result = analyzer.analyzeTraces([]);
      expect(result.risk_level).toBe("low");
      expect(result.risk_score).toBe(0);
    });

    it("deduplicates issues across traces", () => {
      const traces = [
        makeTrace({ id: "t1", retrieved_chunks: [] }),
        makeTrace({ id: "t2", retrieved_chunks: [] }),
      ];

      const result = analyzer.analyzeTraces(traces);
      const noChunkIssue = result.issues.filter((i) => i.includes("No chunks"));
      expect(noChunkIssue).toHaveLength(1);
    });
  });

  describe("isContextSufficient", () => {
    it("returns true when high-quality chunks exist", () => {
      expect(analyzer.isContextSufficient(makeTrace())).toBe(true);
    });

    it("returns false when no chunks exceed threshold", () => {
      const trace = makeTrace({
        retrieved_chunks: [
          { chunk_id: "c1", document_id: "d1", text: "", score: 0.2, rank: 1 },
        ],
      });
      expect(analyzer.isContextSufficient(trace, 0.5)).toBe(false);
    });

    it("returns false for empty chunks", () => {
      const trace = makeTrace({ retrieved_chunks: [] });
      expect(analyzer.isContextSufficient(trace)).toBe(false);
    });
  });

  describe("detectHallucinatedSources", () => {
    it("returns false when no UUIDs in response", () => {
      expect(analyzer.detectHallucinatedSources("Plain text response", ["chunk-1"])).toBe(false);
    });

    it("returns true when UUID not in chunk set", () => {
      expect(
        analyzer.detectHallucinatedSources(
          "Source 00000000-0000-4000-a000-000000000001",
          ["different-id"],
        ),
      ).toBe(true);
    });

    it("returns false when UUID matches retrieved chunk", () => {
      expect(
        analyzer.detectHallucinatedSources(
          "Source 00000000-0000-4000-a000-000000000001",
          ["00000000-0000-4000-a000-000000000001"],
        ),
      ).toBe(false);
    });

    it("detects prefixed IDs in response", () => {
      expect(
        analyzer.detectHallucinatedSources(
          "As mentioned in doc_12345678-1234-4000-a000-000000000001",
          ["chunk-1"],
        ),
      ).toBe(true);
    });
  });
});
