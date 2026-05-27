import { createLogger, type Logger } from "@memory-platform/observability";
import type {
  RagTrace,
  HallucinationRiskIndicators,
  EvaluationServiceConfig,
} from "./types.js";
import { DEFAULT_EVAL_CONFIG } from "./types.js";

export interface RagAnalyzer {
  analyzeTrace(trace: RagTrace, config?: Partial<EvaluationServiceConfig>): HallucinationRiskIndicators;
  analyzeTraces(traces: RagTrace[], config?: Partial<EvaluationServiceConfig>): HallucinationRiskIndicators;
  isContextSufficient(trace: RagTrace, minRelevance?: number): boolean;
  detectHallucinatedSources(llmResponse: string, retrievedChunkIds: string[]): boolean;
}

export function createRagAnalyzer(): RagAnalyzer {
  const logger: Logger = createLogger("evaluation:rag-analyzer");

  return {
    analyzeTrace(
      trace: RagTrace,
      config?: Partial<EvaluationServiceConfig>,
    ): HallucinationRiskIndicators {
      const cfg = { ...DEFAULT_EVAL_CONFIG, ...config };
      const issues: string[] = [];
      const chunks = trace.retrieved_chunks;

      const avgScore =
        chunks.length > 0
          ? chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length
          : 0;

      const lowQualityCount = chunks.filter(
        (c) => c.score < cfg.low_quality_score_threshold,
      ).length;

      const contextSufficient = this.isContextSufficient(trace, cfg.min_relevance_threshold);

      const contextTruncated =
        trace.context_window != null &&
        trace.retrieved_chunks.length > cfg.default_top_k;

      const chunkIds = chunks.map((c) => c.chunk_id);
      const hallucinatedSources =
        trace.llm_response != null
          ? this.detectHallucinatedSources(trace.llm_response, chunkIds)
          : false;

      if (!contextSufficient) {
        issues.push("Retrieved context insufficient — consider increasing top_k or improving embeddings");
      }

      if (hallucinatedSources) {
        issues.push("LLM response referenced sources not present in retrieved chunks — hallucination risk");
      }

      if (contextTruncated) {
        issues.push("Context window was truncated — some relevant chunks may have been excluded");
      }

      if (lowQualityCount > 0) {
        issues.push(
          `${lowQualityCount} low-quality chunks (score < ${cfg.low_quality_score_threshold}) found in results`,
        );
      }

      if (chunks.length === 0) {
        issues.push("No chunks retrieved — retrieval pipeline may be failing");
      }

      let riskScore = 0;

      if (!contextSufficient) riskScore += 0.4;
      if (hallucinatedSources) riskScore += 0.3;
      if (contextTruncated) riskScore += 0.15;
      if (lowQualityCount > chunks.length * 0.3) riskScore += 0.1;
      if (avgScore < 0.3) riskScore += 0.05;

      riskScore = Math.min(1, riskScore);

      let riskLevel: HallucinationRiskIndicators["risk_level"] = "low";
      if (riskScore >= 0.7) riskLevel = "critical";
      else if (riskScore >= 0.5) riskLevel = "high";
      else if (riskScore >= 0.3) riskLevel = "medium";

      logger.info("RAG trace analyzed", {
        traceId: trace.id,
        riskLevel,
        riskScore: riskScore.toFixed(3),
        issueCount: issues.length,
      });

      return {
        risk_level: riskLevel,
        risk_score: Math.round(riskScore * 1000) / 1000,
        context_sufficient: contextSufficient,
        hallucinated_sources: hallucinatedSources,
        context_truncated: contextTruncated,
        low_quality_chunks_count: lowQualityCount,
        avg_chunk_relevance: Math.round(avgScore * 1000) / 1000,
        total_chunks_retrieved: chunks.length,
        chunks_in_context: chunks.length,
        issues,
      };
    },

    analyzeTraces(
      traces: RagTrace[],
      config?: Partial<EvaluationServiceConfig>,
    ): HallucinationRiskIndicators {
      if (traces.length === 0) {
        return {
          risk_level: "low",
          risk_score: 0,
          context_sufficient: true,
          hallucinated_sources: false,
          context_truncated: false,
          low_quality_chunks_count: 0,
          avg_chunk_relevance: 0,
          total_chunks_retrieved: 0,
          chunks_in_context: 0,
          issues: [],
        };
      }

      const allIssues: string[] = [];
      let aggregatedRiskScore = 0;
      let sufficientCount = 0;
      let hallucinatedCount = 0;
      let truncatedCount = 0;
      let totalLowQuality = 0;
      let totalChunks = 0;
      let sumAvgRelevance = 0;
      let totalChunksInContext = 0;

      for (const trace of traces) {
        const result = this.analyzeTrace(trace, config);
        aggregatedRiskScore += result.risk_score;
        totalChunks += result.total_chunks_retrieved;
        totalLowQuality += result.low_quality_chunks_count;
        sumAvgRelevance += result.avg_chunk_relevance;
        totalChunksInContext += result.chunks_in_context;

        if (result.context_sufficient) sufficientCount++;
        if (result.hallucinated_sources) hallucinatedCount++;
        if (result.context_truncated) truncatedCount++;

        for (const issue of result.issues) {
          if (!allIssues.includes(issue)) {
            allIssues.push(issue);
          }
        }
      }

      const avgRiskScore = aggregatedRiskScore / traces.length;
      const avgChunkRelevance = sumAvgRelevance / traces.length;

      let riskLevel: HallucinationRiskIndicators["risk_level"] = "low";
      if (avgRiskScore >= 0.7) riskLevel = "critical";
      else if (avgRiskScore >= 0.5) riskLevel = "high";
      else if (avgRiskScore >= 0.3) riskLevel = "medium";

      return {
        risk_level: riskLevel,
        risk_score: Math.round(avgRiskScore * 1000) / 1000,
        context_sufficient: sufficientCount === traces.length,
        hallucinated_sources: hallucinatedCount > 0,
        context_truncated: truncatedCount > 0,
        low_quality_chunks_count: totalLowQuality,
        avg_chunk_relevance: Math.round(avgChunkRelevance * 1000) / 1000,
        total_chunks_retrieved: totalChunks,
        chunks_in_context: totalChunksInContext,
        issues: allIssues,
      };
    },

    isContextSufficient(trace: RagTrace, minRelevance?: number): boolean {
      const threshold = minRelevance ?? DEFAULT_EVAL_CONFIG.min_relevance_threshold;
      if (trace.retrieved_chunks.length === 0) return false;
      const highQualityChunks = trace.retrieved_chunks.filter(
        (c) => c.score >= threshold,
      );
      return highQualityChunks.length > 0;
    },

    detectHallucinatedSources(
      llmResponse: string,
      retrievedChunkIds: string[],
    ): boolean {
      const chunkIdSet = new Set(retrievedChunkIds);
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const prefixedIdRegex = /(?:doc_|chunk_|dsi_)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

      const allMatches = [
        ...(llmResponse.match(uuidRegex) ?? []),
        ...(llmResponse.match(prefixedIdRegex) ?? []),
      ];

      for (const match of allMatches) {
        const normalized = match.toLowerCase();
        if (!chunkIdSet.has(match) && !chunkIdSet.has(normalized)) {
          const isRetrieved = [...chunkIdSet].some(
            (id) => id.includes(match) || match.includes(id),
          );
          if (!isRetrieved) {
            logger.warn("Hallucinated source detected", {
              sourceId: match,
              responseLength: llmResponse.length,
            });
            return true;
          }
        }
      }

      return false;
    },
  };
}
