import { generateId } from "@memory-platform/shared-utils";
import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type { VectorClient, PostgresPool } from "@memory-platform/db";
import type { Chunk, EmbeddingRecord, IndexRecord } from "./types.js";
import type { IndexerOptions } from "./types.js";
import { DEFAULT_INDEXER_OPTIONS } from "./types.js";

export interface IndexWriteResult {
  vectorPointsWritten: number;
  keywordRecordsWritten: number;
  durationMs: number;
}

export class IndexWriter {
  private readonly logger: Logger;
  private readonly options: IndexerOptions;
  private readonly vectorClient: VectorClient | null;
  private readonly postgres: PostgresPool | null;
  private collectionEnsured = false;

  constructor(
    vectorClient: VectorClient | null,
    postgres: PostgresPool | null,
    options: Partial<IndexerOptions> = {},
  ) {
    this.vectorClient = vectorClient;
    this.postgres = postgres;
    this.options = { ...DEFAULT_INDEXER_OPTIONS, ...options };
    this.logger = createLogger("indexing:indexer");
  }

  async writeIndex(
    chunks: Chunk[],
    embeddings: EmbeddingRecord[],
  ): Promise<IndexWriteResult> {
    const startTime = Date.now();

    if (chunks.length === 0) {
      return { vectorPointsWritten: 0, keywordRecordsWritten: 0, durationMs: 0 };
    }

    this.logger.info("Writing index records", {
      chunkCount: chunks.length,
      embeddingCount: embeddings.length,
      vectorCollection: this.options.vectorCollection,
    });

    const [vectorCount, keywordCount] = await Promise.all([
      this.writeVectorIndex(chunks, embeddings),
      this.writeKeywordIndex(chunks),
    ]);

    const durationMs = Date.now() - startTime;

    recordMetric("indexing.vector.points_written", vectorCount);
    recordMetric("indexing.keyword.records_written", keywordCount);
    recordMetric("indexing.write.duration_ms", durationMs, {}, "histogram");

    this.logger.info("Index write complete", {
      vectorPoints: vectorCount,
      keywordRecords: keywordCount,
      durationMs,
    });

    return {
      vectorPointsWritten: vectorCount,
      keywordRecordsWritten: keywordCount,
      durationMs,
    };
  }

  private async writeVectorIndex(
    chunks: Chunk[],
    embeddings: EmbeddingRecord[],
  ): Promise<number> {
    if (!this.vectorClient) {
      this.logger.warn("No vector client configured — skipping vector index write");
      return 0;
    }

    if (embeddings.length === 0) {
      return 0;
    }

    try {
      await this.ensureCollection();

      const embeddingMap = new Map<string, number[]>();
      for (const emb of embeddings) {
        embeddingMap.set(emb.target_id, emb.vector);
      }

      const points = chunks
        .filter((chunk) => embeddingMap.has(chunk.id))
        .map((chunk) => {
          const vector = embeddingMap.get(chunk.id)!;
          return {
            id: chunk.id,
            vector,
            payload: {
              document_id: chunk.document_id,
              workspace_id: chunk.workspace_id,
              sequence_number: chunk.sequence_number,
              text: chunk.text.slice(0, 500),
              text_length: chunk.text_length,
              created_at: chunk.created_at,
              metadata: chunk.metadata,
            },
          };
        });

      if (points.length > 0) {
        await this.vectorClient.client.upsert(this.options.vectorCollection, {
          wait: true,
          points,
        });
      }

      this.logger.debug("Vector points written", {
        collection: this.options.vectorCollection,
        count: points.length,
      });

      return points.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Vector index write failed", { error: message });
      throw new Error(`Vector index write failed: ${message}`);
    }
  }

  private async ensureCollection(): Promise<void> {
    if (!this.vectorClient || this.collectionEnsured) return;

    try {
      const exists = await this.vectorClient.client.collectionExists(
        this.options.vectorCollection,
      );

      if (!exists && this.options.autoCreateCollection) {
        await this.vectorClient.client.createCollection(
          this.options.vectorCollection,
          {
            vectors: {
              size: this.options.vectorDimensions,
              distance: this.options.vectorDistance,
            },
          },
        );
        this.logger.info("Vector collection created", {
          collection: this.options.vectorCollection,
          dimensions: this.options.vectorDimensions,
          distance: this.options.vectorDistance,
        });
      } else if (!exists) {
        throw new Error(
          `Vector collection "${this.options.vectorCollection}" does not exist and autoCreateCollection is disabled`,
        );
      }

      this.collectionEnsured = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to ensure vector collection", {
        collection: this.options.vectorCollection,
        error: message,
      });
      throw error;
    }
  }

  private async writeKeywordIndex(chunks: Chunk[]): Promise<number> {
    if (!this.postgres) {
      this.logger.warn("No Postgres client configured — skipping keyword index write");
      return 0;
    }

    if (chunks.length === 0) return 0;

    try {
      const now = new Date().toISOString();
      const records: IndexRecord[] = [];

      for (const chunk of chunks) {
        const tokens = this.tokenize(chunk.text);

        records.push({
          id: generateId("idx_"),
          chunk_id: chunk.id,
          document_id: chunk.document_id,
          workspace_id: chunk.workspace_id,
          field: "text",
          tokens,
          boost: 1.0,
          created_at: now,
        });
      }

      const values = records.map((r) => ({
        id: r.id,
        chunk_id: r.chunk_id,
        document_id: r.document_id,
        workspace_id: r.workspace_id,
        field: r.field,
        tokens: r.tokens,
        boost: r.boost,
        created_at: r.created_at,
        search_vector: r.tokens.join(" "),
      }));

      await this.postgres.sql`
        INSERT INTO keyword_index_records ${this.postgres.sql(values as any, "id", "chunk_id", "document_id", "workspace_id", "field", "tokens", "boost", "created_at", "search_vector")}
        ON CONFLICT (id) DO UPDATE SET
          tokens = EXCLUDED.tokens,
          search_vector = EXCLUDED.search_vector,
          boost = EXCLUDED.boost
      `;

      this.logger.debug("Keyword index records written", {
        count: records.length,
      });

      return records.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Keyword index write failed", { error: message });
      throw new Error(`Keyword index write failed: ${message}`);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1)
      .slice(0, 500);
  }

  async close(): Promise<void> {
    this.logger.info("IndexWriter closed");
  }
}

export function createIndexWriter(
  vectorClient: VectorClient | null,
  postgres: PostgresPool | null,
  options?: Partial<IndexerOptions>,
): IndexWriter {
  return new IndexWriter(vectorClient, postgres, options);
}
