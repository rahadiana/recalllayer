import { performance } from "node:perf_hooks";
import type { WorkspaceId } from "@memory-platform/shared-schemas";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import { DocumentRepository } from "../repository.js";
import { EventPublisher } from "../events.js";
import {
  validateIngestPayload,
  validateFileMetadata,
} from "../validation.js";
import type {
  IngestDocumentRequest,
  IngestDocumentResponse,
} from "../types.js";

export class DocumentIngestHandler {
  #repo: DocumentRepository;
  #events: EventPublisher;
  #log: Logger;

  constructor(repo: DocumentRepository, events: EventPublisher) {
    this.#repo = repo;
    this.#events = events;
    this.#log = createLogger("ingestion:ingest-handler");
  }

  async handleIngestDocument(
    rawBody: unknown,
  ): Promise<IngestDocumentResponse> {
    const startTime = performance.now();

    const validation = validateIngestPayload(rawBody);

    if (!validation.valid) {
      const errorMsg = `Validation failed: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`;
      this.#log.warn("Document validation failed", {
        errors: validation.errors,
      });

      const rejectedId = generateId();

      await this.#events.publishDocumentRejected(
        "" as WorkspaceId,
        {
          document_id: rejectedId,
          workspace_id: (rawBody as Record<string, unknown>)?.workspace_id as string ?? "",
          reason: errorMsg,
          error_code: "VALIDATION_ERROR",
        },
        (rawBody as Record<string, unknown>)?.correlation_id as string | undefined,
      );

      throw new IngestValidationError(errorMsg, validation.errors);
    }

    const payload = validation.data as IngestDocumentRequest;
    const workspaceId = payload.workspace_id;

    const source = payload.document.source;

    if (source.mime_type || source.size_bytes !== undefined) {
      const fileValidation = validateFileMetadata({
        mime_type: source.mime_type,
        size_bytes: source.size_bytes,
      });

      if (!fileValidation.valid) {
        this.#log.warn("File metadata validation failed", {
          errorCode: fileValidation.errorCode,
          message: fileValidation.message,
        });

        await this.#events.publishDocumentRejected(workspaceId, {
          document_id: generateId(),
          workspace_id: workspaceId as string,
          reason: fileValidation.message,
          error_code: fileValidation.errorCode,
        }, payload.correlation_id);

        throw new IngestValidationError(fileValidation.message, []);
      }
    }

    const docSize = Buffer.byteLength(JSON.stringify(payload.document), "utf-8");
    const quotaCheck = await this.#repo.checkQuota(workspaceId as string, docSize);
    if (!quotaCheck.allowed) {
      this.#log.warn("Quota exceeded", { workspaceId, reason: quotaCheck.reason, quota: quotaCheck.quota });
      throw new IngestValidationError(quotaCheck.reason || "Quota exceeded", []);
    }

    const doc = await this.#repo.createDocument({
      workspaceId,
      dto: payload.document,
      createdBy: payload.created_by,
    });

    this.#log.info("Document stored", {
      documentId: doc.id as string,
      workspaceId: workspaceId as string,
      title: doc.title,
    });

    await this.#repo.updateUsage(workspaceId as string, docSize);

    await this.#events.publishDocumentReceived(workspaceId, {
      document_id: doc.id as string,
      workspace_id: workspaceId as string,
      title: doc.title,
      source_type: source.type,
      mime_type: source.mime_type,
      size_bytes: source.size_bytes,
      created_by: payload.created_by,
    }, payload.correlation_id);

    const validationTimeMs = Math.round(performance.now() - startTime);

    const eventId = await this.#events.publishDocumentValidated(workspaceId, {
      document_id: doc.id as string,
      workspace_id: workspaceId as string,
      validation_time_ms: validationTimeMs,
    }, payload.correlation_id);

    return {
      document: doc,
      event_id: eventId,
    };
  }
}

export class IngestValidationError extends Error {
  public readonly errors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    errors: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "IngestValidationError";
    this.errors = errors;
  }
}
