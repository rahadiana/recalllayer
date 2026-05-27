import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { EvalDatasetItemRow } from "./types.js";
import type { EvalRunConfig, EvalMetrics, WorkspaceId } from "@memory-platform/shared-schemas";
import type { EvalRepository } from "./repository.js";
import type { EvalEventPublisher } from "./events.js";
import type { MetricsCalculator } from "./metrics-calculator.js";
import type { RagAnalyzer } from "./rag-analyzer.js";
import type { RagTrace, RagTraceChunk, QualityReport, EvaluationServiceConfig } from "./types.js";
import { DEFAULT_EVAL_CONFIG } from "./types.js";

export interface RetrievalClient {
  search(params: {
    query: string;
    workspaceId: string;
    topK: number;
    similarityThreshold: number;
    hybrid: boolean;
    rerankModel?: string;
  }): Promise<{
    chunkIds: string[];
    documentIds: string[];
    scores: number[];
    latencyMs: number;
  }>;
}

export interface EvalRunner {
  executeRun(
    runId: string,
    workspaceId: string,
    datasetId: string,
    config: EvalRunConfig,
    createdBy: string,
  ): Promise<QualityReport>;
}

export function createEvalRunner(
  repository: EvalRepository,
  metricsCalculator: MetricsCalculator,
  ragAnalyzer: RagAnalyzer,
  events: EvalEventPublisher,
  retrievalClient: RetrievalClient,
  serviceConfig?: Partial<EvaluationServiceConfig>,
): EvalRunner {
  const logger: Logger = createLogger("evaluation:eval-runner");
  const cfg = { ...DEFAULT_EVAL_CONFIG, ...serviceConfig };

  return {
    async executeRun(
      runId: string,
      workspaceId: string,
      datasetId: string,
      config: EvalRunConfig,
      _createdBy: string,
    ): Promise<QualityReport> {
      logger.info("Starting eval run", { runId, datasetId, workspaceId });

      await repository.setRunStarted(runId);

      try {
        const items = await repository.getDatasetItems(datasetId);

        if (items.length === 0) {
          throw new Error(`Dataset ${datasetId} has no items`);
        }

        logger.info("Running queries against retrieval-service", {
          runId,
          queryCount: items.length,
        });

        const retrievedMap = new Map<string, string[]>();
        const latencies = new Map<string, number>();
        const traces: RagTrace[] = [];
        const k = config.top_k ?? cfg.default_top_k;

        const concurrency = cfg.max_query_concurrency;
        for (let i = 0; i < items.length; i += concurrency) {
          const batch = items.slice(i, i + concurrency);
          const results = await Promise.all(
            batch.map(async (item) => {
              const searchResult = await retrievalClient.search({
                query: item.query,
                workspaceId: workspaceId,
                topK: k,
                similarityThreshold: cfg.default_similarity_threshold,
                hybrid: config.hybrid,
                rerankModel: config.rerank_model,
              });

              const traceChunks: RagTraceChunk[] = searchResult.documentIds.map(
                (docId, idx) => ({
                  chunk_id: searchResult.chunkIds[idx] ?? docId,
                  document_id: docId,
                  text: "",
                  score: searchResult.scores[idx] ?? 0,
                  rank: idx + 1,
                }),
              );

              traces.push({
                id: generateId("trace_"),
                query: item.query,
                workspace_id: workspaceId as WorkspaceId,
                retrieved_chunks: traceChunks,
                captured_at: new Date().toISOString(),
              });

              return {
                itemId: item.id,
                documentIds: searchResult.documentIds,
                latencyMs: searchResult.latencyMs,
              };
            }),
          );

          for (const result of results) {
            retrievedMap.set(result.itemId, result.documentIds);
            latencies.set(result.itemId, result.latencyMs);
          }
        }

        const totalLatency = [...latencies.values()].reduce((a, b) => a + b, 0);
        const avgLatencyMs = items.length > 0 ? totalLatency / items.length : 0;

        const perQueryScores = metricsCalculator.calculatePerQueryScores(
          items,
          retrievedMap,
          latencies,
          runId,
          k,
        );

        const metrics = metricsCalculator.computeAggregatedMetrics(
          items,
          retrievedMap,
          avgLatencyMs,
          k,
        );

        const hallucinationRisk = ragAnalyzer.analyzeTraces(traces, cfg);

        await repository.saveRetrievalScores(perQueryScores);
        await repository.updateRunMetrics(runId, metrics);
        await repository.setRunCompleted(runId);

        let overallQuality: QualityReport["overall_quality"] = "good";
        if (metrics.ndcg >= 0.8 && metrics.mrr >= 0.7 && hallucinationRisk.risk_level === "low") {
          overallQuality = "excellent";
        } else if (metrics.ndcg < 0.3 || metrics.mrr < 0.2 || hallucinationRisk.risk_level === "critical") {
          overallQuality = "poor";
        } else if (metrics.ndcg < 0.5 || metrics.mrr < 0.4) {
          overallQuality = "fair";
        }

        const recommendations: string[] = [];

        if (metrics.precision_at_k < 0.5) {
          recommendations.push("Consider improving embedding quality or fine-tuning search parameters to increase precision");
        }
        if (metrics.recall_at_k < 0.5) {
          recommendations.push("Increase top_k or enable hybrid search to improve recall");
        }
        if (hallucinationRisk.low_quality_chunks_count > 0) {
          recommendations.push("Review low-quality chunks and consider adjusting relevance thresholds");
        }
        if (hallucinationRisk.context_truncated) {
          recommendations.push("Increase context window size to prevent truncation");
        }
        if (!hallucinationRisk.context_sufficient) {
          recommendations.push("Improve retrieval pipeline — insufficient context retrieved for queries");
        }

        const reportId = generateId("rpt_");
        const report: QualityReport = {
          id: reportId,
          run_id: runId,
          workspace_id: workspaceId as WorkspaceId,
          metrics,
          hallucination_risk: hallucinationRisk,
          retrieval_scores: perQueryScores.map((s) => ({
            run_id: s.run_id,
            dataset_item_id: s.dataset_item_id,
            query: s.query,
            retrieved_document_ids: s.retrieved_document_ids,
            precision: s.precision,
            recall: s.recall,
            latency_ms: s.latency_ms,
          })),
          traces_analyzed: traces.length,
          overall_quality: overallQuality,
          recommendations,
          generated_at: new Date().toISOString(),
        };

        await events.publishEvaluationCompleted({
          run_id: runId,
          workspace_id: workspaceId,
          dataset_id: datasetId,
          metrics,
          status: "completed",
        });

        await events.publishRetrievalQualityReported({
          report_id: reportId,
          run_id: runId,
          workspace_id: workspaceId as WorkspaceId,
          overall_quality: overallQuality,
          hallucination_risk_score: hallucinationRisk.risk_score,
          metrics_summary: {
            mrr: metrics.mrr,
            ndcg: metrics.ndcg,
            map: metrics.map,
          },
        });

        logger.info("Eval run completed", {
          runId,
          overallQuality,
          mrr: metrics.mrr.toFixed(4),
          ndcg: metrics.ndcg.toFixed(4),
          map: metrics.map.toFixed(4),
        });

        return report;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Eval run failed", { runId, error: message });

        await repository.updateRunStatus(runId, "failed", message);

        await events.publishEvaluationCompleted({
          run_id: runId,
          workspace_id: workspaceId,
          dataset_id: datasetId,
          metrics: {
            mrr: 0,
            precision_at_k: 0,
            recall_at_k: 0,
            ndcg: 0,
            map: 0,
            avg_latency_ms: 0,
            total_queries: 0,
          },
          status: "failed",
        });

        throw err;
      }
    },
  };
}
