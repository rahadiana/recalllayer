import { retry, type RetryConfig } from "@memory-platform/shared-utils";
import { createLogger, recordMetric, type Logger } from "@memory-platform/observability";
import type { Document, ExtractedDocument } from "./types.js";
import type { ChunkStrategy } from "./chunker.js";
import type { ChunkerOptions } from "./types.js";
import { DEFAULT_CHUNKER_OPTIONS } from "./types.js";
import type { EmbeddingWorker } from "./embedder.js";
import type { IndexWriter } from "./indexer.js";
import type { IndexRepository } from "./repository.js";
import type { IndexingEventPublisher } from "./events.js";

const WORKER_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 60_000,
  jitterFactor: 0.1,
  strategy: "exponential",
};

export class IndexingWorker {
  private readonly logger: Logger;
  private readonly chunker: ChunkStrategy;
  private readonly embedder: EmbeddingWorker;
  private readonly indexer: IndexWriter;
  private readonly repository: IndexRepository;
  private readonly publisher: IndexingEventPublisher;
  private readonly chunkerOptions: ChunkerOptions;

  constructor(deps: {
    chunker: ChunkStrategy;
    embedder: EmbeddingWorker;
    indexer: IndexWriter;
    repository: IndexRepository;
    publisher: IndexingEventPublisher;
    chunkerOptions?: Partial<ChunkerOptions>;
  }) {
    this.chunker = deps.chunker;
    this.embedder = deps.embedder;
    this.indexer = deps.indexer;
    this.repository = deps.repository;
    this.publisher = deps.publisher;
    this.chunkerOptions = { ...DEFAULT_CHUNKER_OPTIONS, ...deps.chunkerOptions };
    this.logger = createLogger("indexing:worker");
  }

  async indexDocument(
    document: Document,
    extracted: ExtractedDocument,
    correlationId?: string | null,
  ): Promise<void> {
    const documentId = extracted.document_id;
    const workspaceId = document.workspace_id;

    this.logger.info("Starting indexing pipeline", {
      documentId,
      workspaceId,
      textLength: extracted.text_length,
      correlationId,
    });

    try {
      await retry(
        async (attempt: number) => {
          this.logger.info("Indexing attempt", { documentId, attempt: attempt + 1 });

          await this.repository.updateDocumentStatus(documentId, "chunking");

          const chunks = this.chunker.chunk(
            extracted.text,
            documentId,
            workspaceId,
            this.chunkerOptions,
            extracted.metadata,
          );

          if (chunks.length === 0) {
            this.logger.warn("No chunks produced — skipping embedding and indexing", {
              documentId,
            });
            await this.publisher.publishDocumentIndexed(documentId, 0, correlationId);
            await this.repository.updateDocumentStatus(documentId, "ready", 0);
            return;
          }

          recordMetric("indexing.chunks.created", chunks.length, {
            documentId: String(documentId),
          });

          await this.publisher.publishChunksCreated(documentId, chunks.length, correlationId);

          await this.repository.saveChunks(chunks);

          await this.repository.updateDocumentStatus(documentId, "indexing");

          const { embeddings, totalTokens } = await this.embedder.embedChunks(
            chunks,
            workspaceId,
          );

          recordMetric("indexing.embeddings.generated", embeddings.length, {
            documentId: String(documentId),
            model: this.embedder.model,
          });

          await this.publisher.publishEmbeddingsGenerated(
            documentId,
            embeddings.length,
            correlationId,
          );

          await this.repository.saveEmbeddings(embeddings);

          const { vectorPointsWritten, keywordRecordsWritten } =
            await this.indexer.writeIndex(chunks, embeddings);

          await this.repository.updateDocumentStatus(documentId, "ready", chunks.length);

          await this.publisher.publishDocumentIndexed(documentId, chunks.length, correlationId);

          this.logger.info("Indexing pipeline completed successfully", {
            documentId,
            chunks: chunks.length,
            embeddings: embeddings.length,
            vectorPoints: vectorPointsWritten,
            keywordRecords: keywordRecordsWritten,
            totalTokens,
          });

          recordMetric("indexing.documents.indexed", 1, {
            documentId: String(documentId),
          });
        },
        {
          ...WORKER_RETRY_CONFIG,
          onRetry: (error: unknown, attempt: number, delayMs: number) => {
            this.logger.warn("Retrying indexing pipeline", {
              documentId,
              attempt,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error("Indexing pipeline failed after retries", {
        documentId,
        error: message,
      });

      try {
        await this.repository.updateDocumentStatus(documentId, "error");
        await this.publisher.publishIndexingFailed(documentId, message, correlationId);
      } catch (publishError) {
        this.logger.error("Failed to publish indexing failure", {
          documentId,
          error: publishError instanceof Error ? publishError.message : String(publishError),
        });
      }

      recordMetric("indexing.documents.failed", 1, {
        documentId: String(documentId),
      });

      throw error;
    }
  }
}

export function createIndexingWorker(deps: {
  chunker: ChunkStrategy;
  embedder: EmbeddingWorker;
  indexer: IndexWriter;
  repository: IndexRepository;
  publisher: IndexingEventPublisher;
  chunkerOptions?: Partial<ChunkerOptions>;
}): IndexingWorker {
  return new IndexingWorker(deps);
}
