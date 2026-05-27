import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type { VectorClient, PostgresPool } from "@memory-platform/db";
import type { SearchFilters } from "@memory-platform/shared-schemas";
import type { FusedSearchResult, VectorSearchResult, KeywordSearchResult } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { VectorSearch } from "./vector.js";
import { KeywordSearch } from "./keyword.js";

export interface HybridSearchConfig {
  rrfK?: number;
  collectionName?: string;
  tableName?: string;
}

function reciprocalRankFusion(
  vectorResults: VectorSearchResult[],
  keywordResults: KeywordSearchResult[],
  k: number,
): FusedSearchResult[] {
  const scoreMap = new Map<
    string,
    {
      chunkId: string;
      documentId: string;
      text: string;
      metadata: Record<string, unknown>;
      vectorScore: number;
      keywordScore: number;
      vectorRank: number;
      keywordRank: number;
    }
  >();

  for (let i = 0; i < vectorResults.length; i++) {
    const r = vectorResults[i];
    const rank = i + 1;
    scoreMap.set(r.chunk_id, {
      chunkId: r.chunk_id,
      documentId: r.document_id,
      text: r.text,
      metadata: r.metadata,
      vectorScore: 1 / (k + rank),
      keywordScore: 0,
      vectorRank: rank,
      keywordRank: 0,
    });
  }

  for (let i = 0; i < keywordResults.length; i++) {
    const r = keywordResults[i];
    const rank = i + 1;
    const existing = scoreMap.get(r.chunk_id);
    if (existing) {
      existing.keywordScore = 1 / (k + rank);
      existing.keywordRank = rank;
    } else {
      scoreMap.set(r.chunk_id, {
        chunkId: r.chunk_id,
        documentId: r.document_id,
        text: r.text,
        metadata: r.metadata,
        vectorScore: 0,
        keywordScore: 1 / (k + rank),
        vectorRank: 0,
        keywordRank: rank,
      });
    }
  }

  const fused: FusedSearchResult[] = [];
  for (const [, entry] of scoreMap) {
    const fusedScore = entry.vectorScore + entry.keywordScore;
    fused.push({
      chunk_id: entry.chunkId,
      document_id: entry.documentId as FusedSearchResult["document_id"],
      text: entry.text,
      fused_score: fusedScore,
      source_scores: {
        vector: entry.vectorScore > 0 ? entry.vectorScore : undefined,
        keyword: entry.keywordScore > 0 ? entry.keywordScore : undefined,
      },
      metadata: entry.metadata,
    });
  }

  fused.sort((a, b) => b.fused_score - a.fused_score);
  return fused;
}

export class HybridSearch {
  private readonly logger: Logger;
  private readonly vectorSearch: VectorSearch;
  private readonly keywordSearch: KeywordSearch;
  private readonly rrfK: number;

  constructor(
    vectorClient: VectorClient,
    postgresPool: PostgresPool,
    config: HybridSearchConfig = {},
  ) {
    this.logger = createLogger("retrieval:hybrid");
    this.vectorSearch = new VectorSearch(vectorClient, {
      collectionName: config.collectionName,
    });
    this.keywordSearch = new KeywordSearch(postgresPool, {
      tableName: config.tableName,
    });
    this.rrfK = config.rrfK ?? DEFAULT_CONFIG.rrf_k;
  }

  async search(
    query: string,
    queryEmbedding: number[] | undefined,
    workspaceId: string,
    filters: SearchFilters,
    topK: number,
    similarityThreshold: number,
  ): Promise<FusedSearchResult[]> {
    const startTime = Date.now();

    const fetchTopK = Math.max(topK * 2, 20);

    this.logger.debug("Executing hybrid search", {
      workspaceId,
      query: query.slice(0, 100),
      topK,
      fetchTopK,
      hasEmbedding: !!queryEmbedding,
    });

    const tasks: [Promise<VectorSearchResult[]>, Promise<KeywordSearchResult[]>] = [
      queryEmbedding
        ? this.vectorSearch.search(queryEmbedding, workspaceId, filters, fetchTopK, similarityThreshold)
        : Promise.resolve([]),
      this.keywordSearch.search(query, workspaceId, filters, fetchTopK),
    ];

    const [vectorResults, keywordResults] = await Promise.all(tasks);

    const fused = reciprocalRankFusion(vectorResults, keywordResults, this.rrfK);

    const topResults = fused.slice(0, topK);

    const latencyMs = Date.now() - startTime;

    recordMetric("retrieval.hybrid.search.requests", 1, {
      workspace_id: workspaceId,
    });
    recordMetric("retrieval.hybrid.search.latency_ms", latencyMs, {
      workspace_id: workspaceId,
    }, "histogram");
    recordMetric("retrieval.hybrid.search.vector_results", vectorResults.length, {
      workspace_id: workspaceId,
    });
    recordMetric("retrieval.hybrid.search.keyword_results", keywordResults.length, {
      workspace_id: workspaceId,
    });
    recordMetric("retrieval.hybrid.search.fused_results", fused.length, {
      workspace_id: workspaceId,
    });

    this.logger.info("Hybrid search completed", {
      workspaceId,
      vectorCount: vectorResults.length,
      keywordCount: keywordResults.length,
      fusedCount: fused.length,
      returned: topResults.length,
      latencyMs,
    });

    return topResults;
  }
}
