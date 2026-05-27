import { describe, it, expect, beforeEach } from "vitest";
import { createMetricsCalculator } from "../src/metrics-calculator.js";
import type { EvalDatasetItemRow } from "../src/types.js";

function makeItem(
  id: string,
  query: string,
  relevantIds: string[],
): EvalDatasetItemRow {
  return {
    id,
    dataset_id: "ds-1",
    query,
    relevant_document_ids: relevantIds,
    partially_relevant_document_ids: null,
    non_relevant_document_ids: null,
  };
}

describe("MetricsCalculator", () => {
  let calc: ReturnType<typeof createMetricsCalculator>;

  beforeEach(() => {
    calc = createMetricsCalculator();
  });

  describe("MRR", () => {
    it("returns 1.0 when first result is relevant", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-2"])];
      const retrieved = new Map([["1", ["doc-1", "doc-3", "doc-4"]]]);
      expect(calc.calculateMrr(items, retrieved)).toBeCloseTo(1.0, 5);
    });

    it("returns 0.5 when second result is relevant", () => {
      const items = [makeItem("1", "q1", ["doc-2"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2", "doc-3"]]]);
      expect(calc.calculateMrr(items, retrieved)).toBeCloseTo(0.5, 5);
    });

    it("returns 0 when no relevant results", () => {
      const items = [makeItem("1", "q1", ["doc-5"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2"]]]);
      expect(calc.calculateMrr(items, retrieved)).toBe(0);
    });

    it("averages MRR across multiple queries", () => {
      const items = [
        makeItem("1", "q1", ["doc-1"]),
        makeItem("2", "q2", ["doc-3"]),
      ];
      const retrieved = new Map([
        ["1", ["doc-1", "doc-2"]],
        ["2", ["doc-1", "doc-3"]],
      ]);
      const mrr = calc.calculateMrr(items, retrieved);
      expect(mrr).toBeCloseTo((1.0 + 0.5) / 2, 5);
    });

    it("returns 0 for empty items", () => {
      expect(calc.calculateMrr([], new Map())).toBe(0);
    });
  });

  describe("Precision@K", () => {
    it("returns 1.0 when all top-k are relevant", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-2", "doc-3"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2", "doc-3"]]]);
      expect(calc.calculatePrecisionAtK(items, retrieved, 3)).toBeCloseTo(1.0, 5);
    });

    it("returns 0.5 when half are relevant", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-3"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2", "doc-3", "doc-4"]]]);
      expect(calc.calculatePrecisionAtK(items, retrieved, 4)).toBeCloseTo(0.5, 5);
    });

    it("respects K value", () => {
      const items = [makeItem("1", "q1", ["doc-1"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2", "doc-3"]]]);
      expect(calc.calculatePrecisionAtK(items, retrieved, 1)).toBeCloseTo(1.0, 5);
      expect(calc.calculatePrecisionAtK(items, retrieved, 3)).toBeCloseTo(1 / 3, 5);
    });
  });

  describe("Recall@K", () => {
    it("returns 1.0 when all relevant docs are retrieved", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-2"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2", "doc-3"]]]);
      expect(calc.calculateRecallAtK(items, retrieved, 3)).toBeCloseTo(1.0, 5);
    });

    it("returns 0.5 when half of relevant docs are retrieved", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-2", "doc-3", "doc-4"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2"]]]);
      expect(calc.calculateRecallAtK(items, retrieved, 2)).toBeCloseTo(0.5, 5);
    });

    it("returns 1.0 when there are no relevant docs", () => {
      const items = [makeItem("1", "q1", [])];
      const retrieved = new Map([["1", ["doc-1", "doc-2"]]]);
      expect(calc.calculateRecallAtK(items, retrieved, 2)).toBe(1);
    });
  });

  describe("NDCG", () => {
    it("returns 1.0 for perfect ranking", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-2", "doc-3"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2", "doc-3"]]]);
      expect(calc.calculateNdcg(items, retrieved, 3)).toBeCloseTo(1.0, 5);
    });

    it("returns less than 1.0 for suboptimal ranking", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-2"])];
      const retrieved = new Map([["1", ["doc-3", "doc-1", "doc2"]]]);
      const ndcg = calc.calculateNdcg(items, retrieved, 3);
      expect(ndcg).toBeGreaterThan(0);
      expect(ndcg).toBeLessThan(1);
    });

    it("returns 0 for no relevant results", () => {
      const items = [makeItem("1", "q1", ["doc-5"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2"]]]);
      expect(calc.calculateNdcg(items, retrieved, 2)).toBe(0);
    });
  });

  describe("MAP", () => {
    it("returns 1.0 for perfect ranking", () => {
      const items = [makeItem("1", "q1", ["doc-1", "doc-2"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2"]]]);
      expect(calc.calculateMap(items, retrieved, 2)).toBeCloseTo(1.0, 5);
    });

    it("returns 0 for no relevant results", () => {
      const items = [makeItem("1", "q1", ["doc-5"])];
      const retrieved = new Map([["1", ["doc-1", "doc-2"]]]);
      expect(calc.calculateMap(items, retrieved, 2)).toBe(0);
    });

    it("averages across multiple queries", () => {
      const items = [
        makeItem("1", "q1", ["doc-1"]),
        makeItem("2", "q2", ["doc-2"]),
      ];
      const retrieved = new Map([
        ["1", ["doc-1", "doc-3"]],
        ["2", ["doc-3", "doc-4"]],
      ]);
      const map = calc.calculateMap(items, retrieved, 2);
      expect(map).toBe(0.5);
    });
  });

  describe("computeAggregatedMetrics", () => {
    it("returns complete metrics object", () => {
      const items = [makeItem("1", "q1", ["doc-1"])];
      const retrieved = new Map([["1", ["doc-1"]]]);
      const metrics = calc.computeAggregatedMetrics(items, retrieved, 150, 10);

      expect(metrics.mrr).toBeDefined();
      expect(metrics.precision_at_k).toBeDefined();
      expect(metrics.recall_at_k).toBeDefined();
      expect(metrics.ndcg).toBeDefined();
      expect(metrics.map).toBeDefined();
      expect(metrics.avg_latency_ms).toBe(150);
      expect(metrics.total_queries).toBe(1);
    });
  });

  describe("calculatePerQueryScores", () => {
    it("returns per-query score entries", () => {
      const items = [makeItem("dsi-1", "what is x?", ["doc-1", "doc-2"])];
      const retrieved = new Map([["dsi-1", ["doc-1", "doc-3"]]]);
      const latencies = new Map([["dsi-1", 120]]);

      const scores = calc.calculatePerQueryScores(items, retrieved, latencies, "run-1", 10);

      expect(scores).toHaveLength(1);
      expect(scores[0].run_id).toBe("run-1");
      expect(scores[0].dataset_item_id).toBe("dsi-1");
      expect(scores[0].precision).toBe(0.5);
      expect(scores[0].recall).toBe(0.5);
      expect(scores[0].latency_ms).toBe(120);
    });
  });
});
