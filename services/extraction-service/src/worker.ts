import { performance } from "node:perf_hooks";
import type { Message } from "@memory-platform/queue";
import type {
  CreateExtractionJobDto,
  ExtractedDocument,
  WorkspaceId,
  DocumentId,
  Timestamp,
} from "@memory-platform/shared-schemas";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { ExtractionRepository } from "./repository.js";
import type { EventPublisher } from "./events.js";
import { getExtractor } from "./extractors/index.js";
import type { ExtractionResult } from "./types.js";
import { ExtractionError } from "./types.js";

export interface ExtractionWorkerConfig {
  maxConcurrency: number;
}

const DEFAULT_CONFIG: ExtractionWorkerConfig = {
  maxConcurrency: 3,
};

interface DocumentReceivedEventPayload {
  document_id: string;
  workspace_id: string;
  title: string;
  content?: string;
  source_type: string;
  mime_type?: string;
  size_bytes?: number;
  created_by: string;
}

export class ExtractionWorker {
  #repo: ExtractionRepository;
  #events: EventPublisher;
  #log: Logger;
  #config: ExtractionWorkerConfig;
  #activeJobs = 0;

  constructor(
    repo: ExtractionRepository,
    events: EventPublisher,
    config?: Partial<ExtractionWorkerConfig>,
  ) {
    this.#repo = repo;
    this.#events = events;
    this.#log = createLogger("extraction:worker");
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  async processDocument(message: Message<DocumentReceivedEventPayload>): Promise<void> {
    if (this.#activeJobs >= this.#config.maxConcurrency) {
      this.#log.warn("Extraction worker at capacity, requeueing", {
        documentId: message.event.payload.document_id,
        activeJobs: this.#activeJobs,
      });
      throw new Error("Worker at capacity — retry later");
    }

    this.#activeJobs++;

    const correlationId = message.event.correlationId ?? undefined;
    const payload = message.event.payload;
    const workspaceId = payload.workspace_id as WorkspaceId;
    const documentId = payload.document_id as DocumentId;
    const mimeType = payload.mime_type ?? "text/plain";
    const createdBy = payload.created_by ?? "system";

    let jobId: string | undefined;

    try {
      const dto: CreateExtractionJobDto = {
        document_id: documentId,
        strategy: mimeType,
      };

      const job = await this.#repo.createJob({
        workspaceId,
        documentId,
        dto,
        createdBy,
      });

      jobId = job.id;

      await this.#repo.updateJobStatus(jobId, "processing", {
        startedAt: new Date().toISOString() as Timestamp,
      });

      const rawContent = payload.content ?? payload.title;

      this.#log.info("Starting extraction", {
        jobId,
        documentId: documentId as string,
        mimeType,
        contentLength: rawContent.length,
      });

      const extractor = getExtractor(mimeType);

      const start = performance.now();
      const result: ExtractionResult = extractor.extract(rawContent, {
        preserveSections: true,
      });

      const now = new Date().toISOString() as Timestamp;
      const extractedDoc: ExtractedDocument = {
        job_id: jobId,
        document_id: documentId,
        text: result.text,
        text_length: result.textLength,
        language: (result.metadata.language as string) ?? undefined,
        metadata: {
          ...result.metadata,
          mime_type: mimeType,
          strategy: result.strategy,
          duration_ms: result.durationMs,
        },
        sections: result.sections,
        extracted_at: now,
      };

      await this.#repo.saveExtractedDocument(extractedDoc);
      await this.#repo.updateJobStatus(jobId, "completed", {
        completedAt: now,
      });

      await this.#events.publishDocumentExtracted(
        workspaceId,
        {
          job_id: jobId,
          document_id: documentId as string,
          extracted_text_length: result.textLength,
        },
        correlationId,
      );

      this.#log.info("Extraction completed", {
        jobId,
        documentId: documentId as string,
        textLength: result.textLength,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = err instanceof ExtractionError ? err.code : "EXTRACTION_FAILED";
      const retryable = err instanceof ExtractionError ? err.retryable : false;

      this.#log.error("Extraction failed", {
        jobId: jobId ?? "unknown",
        documentId: documentId as string,
        error: errorMessage,
        errorCode,
        retryable,
      });

      if (jobId) {
        await this.#repo.updateJobStatus(jobId, "failed", {
          errorMessage,
          completedAt: new Date().toISOString() as Timestamp,
        });
      }

      await this.#events.publishExtractionFailed(
        workspaceId,
        {
          job_id: jobId ?? "unknown",
          document_id: documentId as string,
          error: errorMessage,
        },
        correlationId,
      );

      if (retryable === false) {
        return;
      }

      throw err;
    } finally {
      this.#activeJobs--;
    }
  }
}
