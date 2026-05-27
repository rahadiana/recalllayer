import { randomUUID } from "node:crypto";
import type { Queue } from "@memory-platform/queue";
import type { EventEnvelope, Message } from "@memory-platform/queue";
import { createLogger, type Logger } from "@memory-platform/observability";
import type {
  ExtractionJobCompletedPayload,
  IndexingChunksCreatedPayload,
  IndexingEmbeddingsGeneratedPayload,
  IndexingCompletedPayload,
  IndexingFailedPayload,
} from "@memory-platform/shared-schemas";
import type { Document, ExtractedDocument } from "./types.js";

export interface IndexingEventHandlers {
  onDocumentExtracted: (document: Document, extracted: ExtractedDocument, correlationId: string | null) => Promise<void>;
}

function buildEnvelope<T>(
  type: string,
  payload: T,
  correlationId?: string | null,
): EventEnvelope<T> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    payload,
    metadata: {},
    correlationId: correlationId ?? undefined,
    causationId: undefined,
  };
}

export class IndexingEventPublisher {
  private readonly queue: Queue;
  private readonly logger: Logger;
  private readonly eventsChannel: string;

  constructor(queue: Queue, eventsChannel = "indexing.events") {
    this.queue = queue;
    this.eventsChannel = eventsChannel;
    this.logger = createLogger("indexing:events:publisher");
  }

  async publishChunksCreated(
    documentId: string,
    chunkCount: number,
    correlationId?: string | null,
  ): Promise<void> {
    const payload: IndexingChunksCreatedPayload = {
      document_id: documentId,
      chunk_count: chunkCount,
    };

    const event = buildEnvelope("indexing.chunks_created", payload, correlationId);

    try {
      await this.queue.enqueue(this.eventsChannel, event);
      this.logger.info("Published indexing.chunks_created", {
        documentId,
        chunkCount,
      });
    } catch (error) {
      this.logger.error("Failed to publish indexing.chunks_created", {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async publishEmbeddingsGenerated(
    documentId: string,
    embeddingCount: number,
    correlationId?: string | null,
  ): Promise<void> {
    const payload: IndexingEmbeddingsGeneratedPayload = {
      document_id: documentId,
      embedding_count: embeddingCount,
    };

    const event = buildEnvelope("indexing.embeddings_generated", payload, correlationId);

    try {
      await this.queue.enqueue(this.eventsChannel, event);
      this.logger.info("Published indexing.embeddings_generated", {
        documentId,
        embeddingCount,
      });
    } catch (error) {
      this.logger.error("Failed to publish indexing.embeddings_generated", {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async publishDocumentIndexed(
    documentId: string,
    chunkCount: number,
    correlationId?: string | null,
  ): Promise<void> {
    const payload: IndexingCompletedPayload = {
      document_id: documentId,
      chunk_count: chunkCount,
    };

    const event = buildEnvelope("indexing.completed", payload, correlationId);

    try {
      await this.queue.enqueue(this.eventsChannel, event);
      this.logger.info("Published indexing.completed", {
        documentId,
        chunkCount,
      });
    } catch (error) {
      this.logger.error("Failed to publish indexing.completed", {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async publishIndexingFailed(
    documentId: string,
    error: string,
    correlationId?: string | null,
  ): Promise<void> {
    const payload: IndexingFailedPayload = {
      document_id: documentId,
      error,
    };

    const event = buildEnvelope("indexing.failed", payload, correlationId);

    try {
      await this.queue.enqueue(this.eventsChannel, event);
      this.logger.info("Published indexing.failed", {
        documentId,
        error,
      });
    } catch (publishError) {
      this.logger.error("Failed to publish indexing.failed", {
        documentId,
        publishError: publishError instanceof Error ? publishError.message : String(publishError),
      });
    }
  }
}

export function setupConsumer(
  queue: Queue,
  handlers: IndexingEventHandlers,
  channel = "document.extracted",
): () => void {
  const logger = createLogger("indexing:events:consumer");

  logger.info("Setting up consumer", { channel });

  const unsubscribe = queue.process<ExtractionJobCompletedPayload>(
    channel,
    async (message: Message<ExtractionJobCompletedPayload>) => {
      const { event, meta } = message;
      const payload = event.payload;
      const correlationId = event.correlationId ?? null;

      logger.info("Received extraction job completed event", {
        jobId: payload.job_id,
        documentId: payload.document_id,
        textLength: payload.extracted_text_length,
        attempt: meta.attempt,
        correlationId,
      });

      const document: Document = {
        id: payload.document_id as Document["id"],
        workspace_id: "" as Document["workspace_id"],
        title: "",
        status: "extracting",
        source: { type: "api" },
        metadata: {},
        tags: [],
        created_by: "",
        created_at: "",
        updated_at: "",
      };

      const extracted: ExtractedDocument = {
        job_id: payload.job_id,
        document_id: payload.document_id as ExtractedDocument["document_id"],
        text: "",
        text_length: payload.extracted_text_length,
        metadata: {},
        sections: [],
        extracted_at: new Date().toISOString(),
      };

      try {
        await handlers.onDocumentExtracted(document, extracted, correlationId);
      } catch (error) {
        logger.error("Handler failed for document.extracted", {
          documentId: payload.document_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      concurrency: 3,
      useDLQ: true,
    },
  );

  return unsubscribe;
}
