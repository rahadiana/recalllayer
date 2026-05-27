import { Router, type Request, type Response } from "express";
import { createLogger, recordMetric } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { SearchResponse, SearchResult } from "@memory-platform/shared-schemas";
import type { VectorClient, PostgresPool } from "@memory-platform/db";
import type { RerankerProvider } from "@memory-platform/llm";
import type { SearchRequest } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { HybridSearch } from "../searchers/hybrid.js";
import { RerankerPipeline } from "../reranker.js";
import { createSearchTracker, type SearchTracker } from "../tracker.js";

export function createSearchRouter(
  vectorClient: VectorClient,
  postgresPool: PostgresPool,
  rerankerProvider?: RerankerProvider,
  searchTracker?: SearchTracker,
): Router {
  const router = Router();
  const logger = createLogger("retrieval:routes:search");
  const hybridSearch = new HybridSearch(vectorClient, postgresPool);
  const reranker = new RerankerPipeline({ rerankerProvider });
  const tracker = searchTracker ?? createSearchTracker();

  router.post("/internal/search", async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const body = req.body as SearchRequest;

      const topK = body.top_k ?? DEFAULT_CONFIG.default_top_k;
      const similarityThreshold =
        body.similarity_threshold ?? DEFAULT_CONFIG.default_similarity_threshold;
      const hybrid = body.hybrid ?? true;
      const filters = body.filters ?? {};
      const queryId = generateId("query_");

      logger.info("Search request received", {
        queryId,
        workspaceId: body.workspace_id,
        query: body.query.slice(0, 100),
        topK,
        hybrid,
      });

      let rankedResults: SearchResult[];

      if (hybrid) {
        const fusedResults = await hybridSearch.search(
          body.query,
          body.query_embedding,
          body.workspace_id,
          filters,
          topK,
          similarityThreshold,
        );

        rankedResults = fusedResults.map((r, idx) => ({
          rank: idx + 1,
          chunk_id: r.chunk_id,
          document_id: r.document_id as SearchResult["document_id"],
          text: r.text,
          score: r.fused_score,
          source_scores: r.source_scores,
          metadata: r.metadata,
        }));
      } else {
        const vectorSearch = (await import("../searchers/vector.js")).VectorSearch;
        const vs = new vectorSearch(vectorClient);
        let results;

        if (body.query_embedding) {
          results = await vs.search(
            body.query_embedding,
            body.workspace_id,
            filters,
            topK,
            similarityThreshold,
          );
        } else {
          const keywordSearch = (await import("../searchers/keyword.js")).KeywordSearch;
          const ks = new keywordSearch(postgresPool);
          results = await ks.search(
            body.query,
            body.workspace_id,
            filters,
            topK,
          );
        }

        rankedResults = results.map((r: { chunk_id: string; document_id: string; text: string; score: number; metadata: Record<string, unknown> }, idx: number) => ({
          rank: idx + 1,
          chunk_id: r.chunk_id,
          document_id: r.document_id as SearchResult["document_id"],
          text: r.text,
          score: r.score,
          metadata: r.metadata,
        }));
      }

      if (body.rerank && rankedResults.length > 0) {
        rankedResults = await reranker.rerank(body.query, rankedResults, body.rerank);
      }

      const totalHits = rankedResults.length;
      const latencyMs = Date.now() - startTime;

      tracker.logSearch({
        query_id: queryId,
        workspace_id: body.workspace_id,
        query: body.query,
        result_count: rankedResults.length,
        latency_ms: latencyMs,
        hybrid,
        rerank_applied: !!body.rerank,
      });

      const response: SearchResponse = {
        query_id: queryId,
        results: rankedResults,
        pagination: {
          limit: topK,
          cursor: body.cursor,
          next_cursor: null,
        },
        total_hits: totalHits,
        latency_ms: latencyMs,
      };

      recordMetric("retrieval.search.requests", 1, {
        workspace_id: body.workspace_id,
        hybrid: String(hybrid),
      });
      recordMetric("retrieval.search.latency_ms", latencyMs, {
        workspace_id: body.workspace_id,
      }, "histogram");

      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Search failed", { error: message });
      res.status(500).json({
        code: "SEARCH_FAILED",
        message: "Search execution failed",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
