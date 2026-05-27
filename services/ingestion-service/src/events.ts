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

export interface DocumentReceivedPayload {
  document_id: string;
  workspace_id: string;
  title: string;
  source_type: string;
  mime_type?: string;
  size_bytes?: number;
  created_by: string;
}

export interface DocumentValidatedPayload {
  document_id: string;
  workspace_id: string;
  validation_time_ms: number;
}

export interface DocumentRejectedPayload {
  document_id: string;
  workspace_id: string;
  reason: string;
  error_code: string;
}

export type IngestionEventPayload =
  | DocumentReceivedPayload
  | DocumentValidatedPayload
  | DocumentRejectedPayload;

export class EventPublisher {
  #publisher: Publisher;
  #log: Logger;
  #channel: string;

  constructor(redis: Redis, config: QueueConfig) {
    const events = new EventEmitter();
    this.#publisher = new Publisher(redis, config, events, "ingestion-service");
    this.#log = createLogger("ingestion:events");
    this.#channel = config.defaultChannel ?? "ingestion";

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

  async publishDocumentReceived(
    workspaceId: WorkspaceId,
    payload: DocumentReceivedPayload,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<DocumentReceivedPayload> = {
      id: generateId(),
      type: "document.received",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing document.received", {
      documentId: payload.document_id,
      workspaceId: workspaceId as string,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }

  async publishDocumentValidated(
    _workspaceId: WorkspaceId,
    payload: DocumentValidatedPayload,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<DocumentValidatedPayload> = {
      id: generateId(),
      type: "document.validated",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing document.validated", {
      documentId: payload.document_id,
      validationTimeMs: payload.validation_time_ms,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }

  async publishDocumentRejected(
    _workspaceId: WorkspaceId,
    payload: DocumentRejectedPayload,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<DocumentRejectedPayload> = {
      id: generateId(),
      type: "document.rejected",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing document.rejected", {
      documentId: payload.document_id,
      reason: payload.reason,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }
}
