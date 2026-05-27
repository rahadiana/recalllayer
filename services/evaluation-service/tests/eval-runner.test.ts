import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalRepository } from "../src/repository.js";
import type { EvalEventPublisher } from "../src/events.js";
import type { MetricsCalculator } from "../src/metrics-calculator.js";
import type { RagAnalyzer } from "../src/rag-analyzer.js";
import { createEvalRunner, type RetrievalClient } from "../src/eval-runner.js";
import type { EvalDatasetItemRow, EvalRunConfig } from "../src/types.js";

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

vi.mock("@memory-platform/shared-utils", () => {
  let counter = 0;
  return {
    generateId: vi.fn((prefix?: string) => {
      counter++;
      return `${prefix ?? ""}mock-${counter}`;
    }),
  };
});

function makeItems(count: number): EvalDatasetItemRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `dsi-${i + 1}`,
    dataset_id: "ds-1",
    query: `test query ${i + 1}`,
    relevant_document_ids: [`doc-${i + 1}`],
    partially_relevant_document_ids: null,
    non_relevant_document_ids: null,
  }));
}

describe("EvalRunner", () => {
  let repository: EvalRepository;
  let metricsCalc: MetricsCalculator;
  let ragAnalyzer: RagAnalyzer;
  let events: EvalEventPublisher;
  let retrievalClient: RetrievalClient;
  const config: EvalRunConfig = {
    search_backend: "qdrant",
    embedding_model: "text-embedding-3-small",
    hybrid: true,
    top_k: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repository = {
      createDataset: vi.fn(),
      getDataset: vi.fn(),
      listDatasets: vi.fn(),
      addDatasetItems: vi.fn(),
      getDatasetItems: vi.fn(),
      deleteDataset: vi.fn(),
      createRun: vi.fn(),
      getRun: vi.fn(),
      listRuns: vi.fn(),
      updateRunStatus: vi.fn(),
      updateRunMetrics: vi.fn(),
      setRunStarted: vi.fn().mockResolvedValue(undefined),
      setRunCompleted: vi.fn().mockResolvedValue(undefined),
      saveRetrievalScores: vi.fn().mockResolvedValue([]),
      getRetrievalScores: vi.fn(),
      saveFeedback: vi.fn(),
      getFeedback: vi.fn(),
      getFeedbackByQueryId: vi.fn(),
    };

    metricsCalc = {
      calculateMrr: vi.fn().mockReturnValue(0.8),
      calculatePrecisionAtK: vi.fn().mockReturnValue(0.75),
      calculateRecallAtK: vi.fn().mockReturnValue(0.7),
      calculateNdcg: vi.fn().mockReturnValue(0.82),
      calculateMap: vi.fn().mockReturnValue(0.78),
      calculatePerQueryScores: vi.fn().mockReturnValue([
        {
          run_id: "run-1",
          dataset_item_id: "dsi-1",
          query: "test query 1",
          retrieved_document_ids: ["doc-1"],
          precision: 1.0,
          recall: 1.0,
          latency_ms: 50,
        },
      ]),
      computeAggregatedMetrics: vi.fn().mockReturnValue({
        mrr: 0.8,
        precision_at_k: 0.75,
        recall_at_k: 0.7,
        ndcg: 0.82,
        map: 0.78,
        avg_latency_ms: 50,
        total_queries: 1,
      }),
    };

    ragAnalyzer = {
      analyzeTrace: vi.fn().mockReturnValue({
        risk_level: "low",
        risk_score: 0.05,
        context_sufficient: true,
        hallucinated_sources: false,
        context_truncated: false,
        low_quality_chunks_count: 0,
        avg_chunk_relevance: 0.9,
        total_chunks_retrieved: 3,
        chunks_in_context: 3,
        issues: [],
      }),
      analyzeTraces: vi.fn().mockReturnValue({
        risk_level: "low",
        risk_score: 0.05,
        context_sufficient: true,
        hallucinated_sources: false,
        context_truncated: false,
        low_quality_chunks_count: 0,
        avg_chunk_relevance: 0.9,
        total_chunks_retrieved: 3,
        chunks_in_context: 3,
        issues: [],
      }),
      isContextSufficient: vi.fn().mockReturnValue(true),
      detectHallucinatedSources: vi.fn().mockReturnValue(false),
    };

    events = {
      publishEvaluationCompleted: vi.fn().mockResolvedValue("evt-1"),
      publishRetrievalQualityReported: vi.fn().mockResolvedValue("evt-2"),
    };

    retrievalClient = {
      search: vi.fn().mockResolvedValue({
        chunkIds: ["chunk-1"],
        documentIds: ["doc-1"],
        scores: [0.95],
        latencyMs: 50,
      }),
    };
  });

  it("executes a run successfully and returns a quality report", async () => {
    (repository.getDatasetItems as ReturnType<typeof vi.fn>).mockResolvedValue(makeItems(1));

    const runner = createEvalRunner(
      repository,
      metricsCalc,
      ragAnalyzer,
      events,
      retrievalClient,
    );

    const report = await runner.executeRun("run-1", "ws-1", "ds-1", config, "api");

    expect(repository.setRunStarted).toHaveBeenCalledWith("run-1");
    expect(repository.getDatasetItems).toHaveBeenCalledWith("ds-1");
    expect(retrievalClient.search).toHaveBeenCalledTimes(1);
    expect(repository.saveRetrievalScores).toHaveBeenCalledTimes(1);
    expect(repository.updateRunMetrics).toHaveBeenCalledTimes(1);
    expect(repository.setRunCompleted).toHaveBeenCalledTimes(1);
    expect(events.publishEvaluationCompleted).toHaveBeenCalledTimes(1);
    expect(events.publishRetrievalQualityReported).toHaveBeenCalledTimes(1);

    expect(report.id).toBeTruthy();
    expect(report.run_id).toBe("run-1");
    expect(report.metrics).toBeDefined();
    expect(report.overall_quality).toBeDefined();
    expect(report.recommendations).toBeDefined();
  });

  it("handles errors and marks run as failed", async () => {
    (repository.getDatasetItems as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const runner = createEvalRunner(
      repository,
      metricsCalc,
      ragAnalyzer,
      events,
      retrievalClient,
    );

    await expect(
      runner.executeRun("run-1", "ws-1", "ds-1", config, "api"),
    ).rejects.toThrow("DB error");

    expect(repository.updateRunStatus).toHaveBeenCalledWith("run-1", "failed", "DB error");
    expect(events.publishEvaluationCompleted).toHaveBeenCalledTimes(1);
    expect(
      (events.publishEvaluationCompleted as ReturnType<typeof vi.fn>).mock.calls[0][0].status,
    ).toBe("failed");
  });

  it("handles empty datasets gracefully", async () => {
    (repository.getDatasetItems as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const runner = createEvalRunner(
      repository,
      metricsCalc,
      ragAnalyzer,
      events,
      retrievalClient,
    );

    await expect(
      runner.executeRun("run-1", "ws-1", "ds-1", config, "api"),
    ).rejects.toThrow("no items");
  });

  it("processes multiple queries with concurrency", async () => {
    const items = makeItems(5);
    (repository.getDatasetItems as ReturnType<typeof vi.fn>).mockResolvedValue(items);

    (retrievalClient.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      chunkIds: ["chunk-1"],
      documentIds: ["doc-1"],
      scores: [0.95],
      latencyMs: 50,
    });

    (metricsCalc.computeAggregatedMetrics as ReturnType<typeof vi.fn>).mockReturnValue({
      mrr: 0.8,
      precision_at_k: 0.75,
      recall_at_k: 0.7,
      ndcg: 0.82,
      map: 0.78,
      avg_latency_ms: 50,
      total_queries: 5,
    });

    const runner = createEvalRunner(
      repository,
      metricsCalc,
      ragAnalyzer,
      events,
      retrievalClient,
    );

    const report = await runner.executeRun("run-1", "ws-1", "ds-1", config, "api");

    expect(retrievalClient.search).toHaveBeenCalledTimes(5);
    expect(report.metrics.total_queries).toBe(5);
  });
});
