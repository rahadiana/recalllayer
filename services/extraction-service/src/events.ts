import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import {
  Publisher,
  type QueueConfig,
  type EventEnvelope,
} from "@memory-platform/queue";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

export interface DocumentExtractedPayload {
  job_id: string;
  document_id: string;
  extracted_text_length: number;
}

export interface ExtractionFailedPayload {
  job_id: string;
  document_id: string;
  error: string;
}

export class EventPublisher {
  #publisher: Publisher;
  #log: Logger;
  #channel: string;

  constructor(redis: Redis, config: QueueConfig) {
    const events = new EventEmitter();
    this.#publisher = new Publisher(redis, config, events, "extraction-service");
    this.#log = createLogger("extraction:events");
    this.#channel = config.defaultChannel ?? "extraction";

    events.on("queue:published", (envelope, channel) => {
      this.#log.debug("Event published", {
        eventType: (envelope as EventEnvelope).type,
        channel: channel as string,
      });
    });

    events.on("queue:error", (_msg, error) => {
      this.#log.error("Event publish error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async publishDocumentExtracted(
    workspaceId: WorkspaceId,
    payload: DocumentExtractedPayload,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<DocumentExtractedPayload> = {
      id: generateId(),
      type: "document.extracted",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing document.extracted", {
      jobId: payload.job_id,
      documentId: payload.document_id,
      textLength: payload.extracted_text_length,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }

  async publishExtractionFailed(
    workspaceId: WorkspaceId,
    payload: ExtractionFailedPayload,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<ExtractionFailedPayload> = {
      id: generateId(),
      type: "extraction.failed",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.error("Publishing extraction.failed", {
      jobId: payload.job_id,
      documentId: payload.document_id,
      error: payload.error,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }
}
