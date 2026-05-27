import type { EvalDatasetItemRow, RetrievalScoreRow, EvalMetrics } from "./types.js";

export interface MetricsCalculator {
  calculateMrr(items: EvalDatasetItemRow[], retrievedMap: Map<string, string[]>): number;
  calculatePrecisionAtK(items: EvalDatasetItemRow[], retrievedMap: Map<string, string[]>, k: number): number;
  calculateRecallAtK(items: EvalDatasetItemRow[], retrievedMap: Map<string, string[]>, k: number): number;
  calculateNdcg(items: EvalDatasetItemRow[], retrievedMap: Map<string, string[]>, k: number): number;
  calculateMap(items: EvalDatasetItemRow[], retrievedMap: Map<string, string[]>, k: number): number;
  calculatePerQueryScores(
    items: EvalDatasetItemRow[],
    retrievedMap: Map<string, string[]>,
    latencies: Map<string, number>,
    runId: string,
    k: number,
  ): Array<Omit<RetrievalScoreRow, "id">>;
  computeAggregatedMetrics(
    items: EvalDatasetItemRow[],
    retrievedMap: Map<string, string[]>,
    avgLatencyMs: number,
    k: number,
  ): EvalMetrics;
}

export function createMetricsCalculator(): MetricsCalculator {
  function relevantSet(item: EvalDatasetItemRow): Set<string> {
    return new Set(item.relevant_document_ids);
  }

  function dcgAtK(retrievedIds: string[], relevantIds: Set<string>, k: number): number {
    let dcg = 0;
    for (let i = 0; i < Math.min(retrievedIds.length, k); i++) {
      if (relevantIds.has(retrievedIds[i])) {
        dcg += 1 / Math.log2(i + 2);
      }
    }
    return dcg;
  }

  function idcgAtK(relevantIds: Set<string>, k: number): number {
    const count = Math.min(relevantIds.size, k);
    let idcg = 0;
    for (let i = 0; i < count; i++) {
      idcg += 1 / Math.log2(i + 2);
    }
    return idcg;
  }

  function precisionAtK(retrievedIds: string[], relevantIds: Set<string>, k: number): number {
    const limit = Math.min(retrievedIds.length, k);
    if (limit === 0) return 0;
    let hits = 0;
    for (let i = 0; i < limit; i++) {
      if (relevantIds.has(retrievedIds[i])) hits++;
    }
    return hits / limit;
  }

  function recallAtK(retrievedIds: string[], relevantIds: Set<string>, k: number): number {
    const limit = Math.min(retrievedIds.length, k);
    if (relevantIds.size === 0) return 1;
    let hits = 0;
    for (let i = 0; i < limit; i++) {
      if (relevantIds.has(retrievedIds[i])) hits++;
    }
    return hits / relevantIds.size;
  }

  function averagePrecision(retrievedIds: string[], relevantIds: Set<string>, k: number): number {
    const limit = Math.min(retrievedIds.length, k);
    if (limit === 0 || relevantIds.size === 0) return 0;
    let sum = 0;
    let hits = 0;
    for (let i = 0; i < limit; i++) {
      if (relevantIds.has(retrievedIds[i])) {
        hits++;
        sum += hits / (i + 1);
      }
    }
    return sum / Math.min(relevantIds.size, limit);
  }

  return {
    calculateMrr(
      items: EvalDatasetItemRow[],
      retrievedMap: Map<string, string[]>,
    ): number {
      if (items.length === 0) return 0;
      let sumRR = 0;
      for (const item of items) {
        const retrievedIds = retrievedMap.get(item.id) ?? [];
        const relevant = relevantSet(item);
        let found = false;
        for (let i = 0; i < retrievedIds.length; i++) {
          if (relevant.has(retrievedIds[i])) {
            sumRR += 1 / (i + 1);
            found = true;
            break;
          }
        }
        if (!found) sumRR += 0;
      }
      return sumRR / items.length;
    },

    calculatePrecisionAtK(
      items: EvalDatasetItemRow[],
      retrievedMap: Map<string, string[]>,
      k: number,
    ): number {
      if (items.length === 0) return 0;
      let sumPrecision = 0;
      for (const item of items) {
        const retrievedIds = retrievedMap.get(item.id) ?? [];
        sumPrecision += precisionAtK(retrievedIds, relevantSet(item), k);
      }
      return sumPrecision / items.length;
    },

    calculateRecallAtK(
      items: EvalDatasetItemRow[],
      retrievedMap: Map<string, string[]>,
      k: number,
    ): number {
      if (items.length === 0) return 0;
      let sumRecall = 0;
      for (const item of items) {
        const retrievedIds = retrievedMap.get(item.id) ?? [];
        sumRecall += recallAtK(retrievedIds, relevantSet(item), k);
      }
      return sumRecall / items.length;
    },

    calculateNdcg(
      items: EvalDatasetItemRow[],
      retrievedMap: Map<string, string[]>,
      k: number,
    ): number {
      if (items.length === 0) return 0;
      let sumNdcg = 0;
      for (const item of items) {
        const retrievedIds = retrievedMap.get(item.id) ?? [];
        const relevant = relevantSet(item);
        const dcg = dcgAtK(retrievedIds, relevant, k);
        const idcg = idcgAtK(relevant, k);
        sumNdcg += idcg > 0 ? dcg / idcg : 0;
      }
      return sumNdcg / items.length;
    },

    calculateMap(
      items: EvalDatasetItemRow[],
      retrievedMap: Map<string, string[]>,
      k: number,
    ): number {
      if (items.length === 0) return 0;
      let sumAP = 0;
      for (const item of items) {
        const retrievedIds = retrievedMap.get(item.id) ?? [];
        sumAP += averagePrecision(retrievedIds, relevantSet(item), k);
      }
      return sumAP / items.length;
    },

    calculatePerQueryScores(
      items: EvalDatasetItemRow[],
      retrievedMap: Map<string, string[]>,
      latencies: Map<string, number>,
      runId: string,
      k: number,
    ): Array<Omit<RetrievalScoreRow, "id">> {
      return items.map((item) => {
        const retrievedIds = retrievedMap.get(item.id) ?? [];
        const relevant = relevantSet(item);
        return {
          run_id: runId,
          dataset_item_id: item.id,
          query: item.query,
          retrieved_document_ids: retrievedIds,
          precision: precisionAtK(retrievedIds, relevant, k),
          recall: recallAtK(retrievedIds, relevant, k),
          latency_ms: latencies.get(item.id) ?? 0,
        };
      });
    },

    computeAggregatedMetrics(
      items: EvalDatasetItemRow[],
      retrievedMap: Map<string, string[]>,
      avgLatencyMs: number,
      k: number,
    ): EvalMetrics {
      return {
        mrr: this.calculateMrr(items, retrievedMap),
        precision_at_k: this.calculatePrecisionAtK(items, retrievedMap, k),
        recall_at_k: this.calculateRecallAtK(items, retrievedMap, k),
        ndcg: this.calculateNdcg(items, retrievedMap, k),
        map: this.calculateMap(items, retrievedMap, k),
        avg_latency_ms: Math.round(avgLatencyMs),
        total_queries: items.length,
      };
    },
  };
}
