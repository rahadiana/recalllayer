import { generateId } from "@memory-platform/shared-utils";
import { retry, type RetryConfig } from "@memory-platform/shared-utils";
import {
  generateEmbeddings,
  type EmbeddingProvider,
} from "@memory-platform/llm";
import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type { Chunk, EmbeddingRecord, WorkspaceId } from "./types.js";
import type { EmbedderOptions } from "./types.js";
import { DEFAULT_EMBEDDER_OPTIONS } from "./types.js";

export interface EmbeddingResult {
  embeddings: EmbeddingRecord[];
  model: string;
  totalTokens: number;
  durationMs: number;
}

export class EmbeddingWorker {
  private readonly logger: Logger;
  private readonly options: EmbedderOptions;
  private readonly retryConfig: RetryConfig;
  private readonly provider: EmbeddingProvider | null;

  constructor(
    options: Partial<EmbedderOptions> = {},
    provider?: EmbeddingProvider,
  ) {
    this.options = { ...DEFAULT_EMBEDDER_OPTIONS, ...options };
    this.provider = provider ?? null;
    this.logger = createLogger("indexing:embedder");
    this.retryConfig = {
      maxRetries: this.options.maxRetries,
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      jitterFactor: 0.1,
      strategy: "exponential",
      shouldRetry: (_error: unknown, _attempt: number) => true,
    };
  }

  async embedChunks(
    chunks: Chunk[],
    workspaceId: WorkspaceId,
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();

    if (chunks.length === 0) {
      return {
        embeddings: [],
        model: this.options.model,
        totalTokens: 0,
        durationMs: 0,
      };
    }

    this.logger.info("Starting embedding generation", {
      chunkCount: chunks.length,
      model: this.options.model,
      batchSize: this.options.batchSize,
    });

    const batches = this.createBatches(chunks);
    const allEmbeddings: EmbeddingRecord[] = [];
    let totalTokens = 0;

    for (const batch of batches) {
      const result = await this.processBatch(batch, workspaceId);
      allEmbeddings.push(...result.embeddings);
      totalTokens += result.tokens;

      recordMetric("indexing.embedding.chunks_processed", batch.length, {
        model: this.options.model,
      });
    }

    const durationMs = Date.now() - startTime;

    recordMetric("indexing.embedding.total_chunks", chunks.length, {
      model: this.options.model,
    });
    recordMetric("indexing.embedding.duration_ms", durationMs, {
      model: this.options.model,
    }, "histogram");

    this.logger.info("Embedding generation complete", {
      chunkCount: chunks.length,
      embeddingCount: allEmbeddings.length,
      totalTokens,
      durationMs,
    });

    return {
      embeddings: allEmbeddings,
      model: this.options.model,
      totalTokens,
      durationMs,
    };
  }

  private createBatches(chunks: Chunk[]): Chunk[][] {
    const batches: Chunk[][] = [];
    for (let i = 0; i < chunks.length; i += this.options.batchSize) {
      batches.push(chunks.slice(i, i + this.options.batchSize));
    }
    return batches;
  }

  private async processBatch(
    chunks: Chunk[],
    workspaceId: WorkspaceId,
  ): Promise<{ embeddings: EmbeddingRecord[]; tokens: number }> {
    const texts = chunks.map((c) => c.text);
    const now = new Date().toISOString();

    try {
      const result = await retry(
        async () => {
          if (chunks.length === 1 && this.provider) {
            return this.provider.generateEmbedding(texts[0], {
              model: this.options.model,
            });
          }
          return generateEmbeddings(texts, {
            model: this.options.model,
          });
        },
        this.retryConfig,
      );

      const vectors: number[][] = Array.isArray(result.data[0])
        ? (result.data as number[][])
        : [result.data as number[]];

      const embeddings: EmbeddingRecord[] = chunks.map((chunk, i) => ({
        id: generateId("emb_"),
        target_id: chunk.id,
        target_type: "chunk" as const,
        vector: vectors[i] ?? vectors[0],
        dimensions: vectors[i]?.length ?? vectors[0]?.length ?? 0,
        model: result.model,
        workspace_id: workspaceId,
        created_at: now,
      }));

      const tokens = result.usage?.totalTokens ?? 0;

      this.logger.debug("Batch embedding generated", {
        batchSize: chunks.length,
        dimensions: embeddings[0]?.dimensions ?? 0,
        tokens,
      });

      return { embeddings, tokens };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Embedding batch failed", {
        batchSize: chunks.length,
        error: message,
      });
      throw new Error(`Embedding generation failed: ${message}`);
    }
  }

  get model(): string {
    return this.options.model;
  }
}

export function createEmbeddingWorker(
  options?: Partial<EmbedderOptions>,
  provider?: EmbeddingProvider,
): EmbeddingWorker {
  return new EmbeddingWorker(options, provider);
}
