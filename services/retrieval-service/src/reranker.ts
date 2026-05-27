import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import { rerank as rerankFn, type RerankerProvider } from "@memory-platform/llm";
import type { RerankConfig, SearchResult } from "@memory-platform/shared-schemas";

export interface RerankerPipelineConfig {
  rerankerProvider?: RerankerProvider;
}

export class RerankerPipeline {
  private readonly logger: Logger;
  private readonly rerankerProvider: RerankerProvider | undefined;

  constructor(config: RerankerPipelineConfig = {}) {
    this.logger = createLogger("retrieval:reranker");
    this.rerankerProvider = config.rerankerProvider;
  }

  async rerank(
    query: string,
    results: SearchResult[],
    rerankConfig: RerankConfig,
  ): Promise<SearchResult[]> {
    const startTime = Date.now();

    const topN = rerankConfig.top_n;
    const candidates = results.slice(0, topN);

    if (candidates.length === 0) {
      this.logger.debug("No candidates to rerank");
      return results;
    }

    this.logger.debug("Reranking candidates", {
      query: query.slice(0, 100),
      candidatesCount: candidates.length,
      model: rerankConfig.model,
    });

    const documents = candidates.map((c) => c.text);

    let rerankedScores: Map<number, number>;

    if (this.rerankerProvider) {
      const rerankResult = await this.rerankerProvider.rerank(query, documents, {
        model: rerankConfig.model,
        topK: topN,
        returnDocuments: false,
      });

      rerankedScores = new Map<number, number>();
      for (const item of rerankResult.data) {
        rerankedScores.set(item.index, item.relevanceScore);
      }
    } else {
      const rerankResult = await rerankFn(query, documents, topN, {
        model: rerankConfig.model,
        returnDocuments: false,
      });

      rerankedScores = new Map<number, number>();
      for (const item of rerankResult.data) {
        rerankedScores.set(item.index, item.relevanceScore);
      }
    }

    const reranked: SearchResult[] = candidates.map((candidate, idx) => ({
      ...candidate,
      rerank_score: rerankedScores.get(idx) ?? candidate.score,
    }));

    reranked.sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));

    for (let i = 0; i < reranked.length; i++) {
      reranked[i] = { ...reranked[i], rank: i + 1 };
    }

    const remaining = results.slice(topN);
    for (let i = 0; i < remaining.length; i++) {
      remaining[i] = {
        ...remaining[i],
        rank: reranked.length + i + 1,
      };
    }

    const latencyMs = Date.now() - startTime;

    recordMetric("retrieval.reranker.requests", 1, {
      model: rerankConfig.model,
    });
    recordMetric("retrieval.reranker.latency_ms", latencyMs, {
      model: rerankConfig.model,
    }, "histogram");

    this.logger.info("Reranking completed", {
      candidatesCount: candidates.length,
      latencyMs,
    });

    return [...reranked, ...remaining];
  }
}
