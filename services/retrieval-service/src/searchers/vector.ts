import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type { VectorClient } from "@memory-platform/db";
import type { SearchFilters } from "@memory-platform/shared-schemas";
import type { VectorSearchResult } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";
import { filterBuilder } from "../filters.js";

export interface VectorSearchConfig {
  collectionName?: string;
}

export class VectorSearch {
  private readonly logger: Logger;
  private readonly collectionName: string;

  constructor(
    private readonly vectorClient: VectorClient,
    config: VectorSearchConfig = {},
  ) {
    this.logger = createLogger("retrieval:vector");
    this.collectionName = config.collectionName ?? DEFAULT_CONFIG.chunks_collection;
  }

  async search(
    queryEmbedding: number[],
    workspaceId: string,
    filters: SearchFilters,
    topK: number,
    similarityThreshold: number,
  ): Promise<VectorSearchResult[]> {
    const startTime = Date.now();

    const qdrantFilter = filterBuilder.buildQdrantFilter(filters, workspaceId);

    this.logger.debug("Executing vector search", {
      workspaceId,
      collection: this.collectionName,
      topK,
      threshold: similarityThreshold,
      vectorDim: queryEmbedding.length,
    });

    const response = await this.vectorClient.client.search(this.collectionName, {
      vector: queryEmbedding,
      limit: topK,
      score_threshold: similarityThreshold,
      filter: qdrantFilter,
      with_payload: true,
      with_vector: false,
    });

    const results: VectorSearchResult[] = response.map((point) => {
      const payload = (point.payload ?? {}) as Record<string, unknown>;
      return {
        chunk_id: String(point.id ?? ""),
        document_id: String(payload.document_id ?? "") as VectorSearchResult["document_id"],
        workspace_id: String(payload.workspace_id ?? "") as VectorSearchResult["workspace_id"],
        text: String(payload.text ?? ""),
        score: point.score,
        metadata: (payload.metadata ?? {}) as Record<string, unknown>,
      };
    });

    const latencyMs = Date.now() - startTime;

    recordMetric("retrieval.vector.search.requests", 1, {
      workspace_id: workspaceId,
    });
    recordMetric("retrieval.vector.search.latency_ms", latencyMs, {
      workspace_id: workspaceId,
    }, "histogram");
    recordMetric("retrieval.vector.search.results", results.length, {
      workspace_id: workspaceId,
    });

    this.logger.info("Vector search completed", {
      workspaceId,
      resultCount: results.length,
      latencyMs,
    });

    return results;
  }
}
