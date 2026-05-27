import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExtractionWorker } from "../src/worker.js";
import { ExtractionError } from "../src/types.js";
import type { ExtractionRepository, CreateJobParams } from "../src/repository.js";
import type { EventPublisher } from "../src/events.js";
import type { Message } from "@memory-platform/queue";
import type { ExtractionJob, ExtractionStatus, ExtractedDocument } from "@memory-platform/shared-schemas";

function createMockRepo(): ExtractionRepository {
  const jobs = new Map<string, ExtractionJob>();
  const docs = new Map<string, ExtractedDocument>();

  return {
    createJob: vi.fn(async (params: CreateJobParams): Promise<ExtractionJob> => {
      const job: ExtractionJob = {
        id: `job-${Date.now()}`,
        workspace_id: params.workspaceId,
        document_id: params.documentId,
        status: "pending",
        strategy: params.dto.strategy ?? "auto",
        config: params.dto.config ?? {},
        retry_count: 0,
        max_retries: 3,
        created_by: params.createdBy,
        created_at: new Date().toISOString(),
      };
      jobs.set(job.id, job);
      return job;
    }),
    getJob: vi.fn(async (id: string) => jobs.get(id) ?? null),
    getJobByDocument: vi.fn(async () => null),
    updateJobStatus: vi.fn(async (id: string, status: ExtractionStatus) => {
      const job = jobs.get(id);
      if (!job) return null;
      job.status = status;
      jobs.set(id, job);
      return job;
    }),
    incrementRetry: vi.fn(async (id: string) => {
      const job = jobs.get(id);
      if (!job) return null;
      job.retry_count += 1;
      return job;
    }),
    saveExtractedDocument: vi.fn(async (doc: ExtractedDocument) => {
      docs.set(doc.job_id, doc);
    }),
    getExtractedDocument: vi.fn(async (jobId: string) => docs.get(jobId) ?? null),
    ensureTables: vi.fn(async () => {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ExtractionRepository;
}

function createMockEvents(): EventPublisher {
  return {
    publishDocumentExtracted: vi.fn(async () => "event-id-1"),
    publishExtractionFailed: vi.fn(async () => "event-id-2"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as EventPublisher;
}

function createMessage(overrides: Partial<{
  document_id: string;
  workspace_id: string;
  title: string;
  content: string;
  mime_type: string;
  source_type: string;
  correlationId: string;
}> = {}): Message<{
  document_id: string;
  workspace_id: string;
  title: string;
  content?: string;
  source_type: string;
  mime_type?: string;
  size_bytes?: number;
  created_by: string;
}> {
  return {
    id: "msg-1",
    event: {
      id: "evt-1",
      type: "document.received",
      timestamp: new Date().toISOString(),
      payload: {
        document_id: overrides.document_id ?? "doc-123",
        workspace_id: overrides.workspace_id ?? "ws-1",
        title: overrides.title ?? "Test Document",
        content: overrides.content,
        source_type: overrides.source_type ?? "upload",
        mime_type: overrides.mime_type ?? "text/plain",
        created_by: "test-user",
      },
      correlationId: overrides.correlationId ?? "corr-1",
    },
    meta: {
      enqueuedAt: new Date().toISOString(),
      attempt: 1,
      channel: "extraction",
      consumerId: "consumer-1",
    },
  };
}

describe("ExtractionWorker", () => {
  let repo: ExtractionRepository;
  let events: EventPublisher;
  let worker: ExtractionWorker;

  beforeEach(() => {
    repo = createMockRepo();
    events = createMockEvents();
    worker = new ExtractionWorker(repo, events, { maxConcurrency: 3 });
  });

  it("processes a plain text document successfully", async () => {
    const message = createMessage({
      content: "Hello World",
      mime_type: "text/plain",
    });

    await worker.processDocument(message);

    expect(repo.createJob).toHaveBeenCalled();
    expect(repo.updateJobStatus).toHaveBeenCalledWith(
      expect.any(String),
      "completed",
      expect.any(Object),
    );
    expect(repo.saveExtractedDocument).toHaveBeenCalled();
    expect(events.publishDocumentExtracted).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        document_id: "doc-123",
        extracted_text_length: expect.any(Number),
      }),
      "corr-1",
    );
  });

  it("uses title as content fallback when no content field", async () => {
    const message = createMessage({
      title: "Just the title",
      mime_type: "text/plain",
    });

    await worker.processDocument(message);

    expect(repo.saveExtractedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        document_id: "doc-123",
      }),
    );
    expect(events.publishDocumentExtracted).toHaveBeenCalled();
  });

  it("processes HTML document with correct extractor", async () => {
    const message = createMessage({
      content: "<h1>Title</h1><p>Paragraph</p>",
      mime_type: "text/html",
    });

    await worker.processDocument(message);

    const saveCall = (repo.saveExtractedDocument as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.metadata.mime_type).toBe("text/html");
    expect(saveCall.metadata.strategy).toBe("html-cleanse");
  });

  it("processes markdown document with correct extractor", async () => {
    const message = createMessage({
      content: "# Title\n\n**bold** text",
      mime_type: "text/markdown",
    });

    await worker.processDocument(message);

    const saveCall = (repo.saveExtractedDocument as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.metadata.strategy).toBe("md-strip");
  });

  it("publishes extraction.failed on error", async () => {
    const message = createMessage({
      content: "",
      mime_type: "text/plain",
    });

    (repo.createJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Database connection failed"),
    );

    await worker.processDocument(message);

    expect(events.publishExtractionFailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        document_id: "doc-123",
        error: expect.stringContaining("Database connection failed"),
      }),
      "corr-1",
    );
  });

  it("updates job status to failed on error", async () => {
    const message = createMessage({ content: "test" });

    (repo.saveExtractedDocument as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Save failed"),
    );

    await worker.processDocument(message);

    expect(repo.updateJobStatus).toHaveBeenCalledWith(
      expect.any(String),
      "failed",
      expect.objectContaining({
        errorMessage: "Save failed",
      }),
    );
  });

  it("does not rethrow for non-retryable errors", async () => {
    const message = createMessage({ content: "test" });
    const error = new ExtractionError("Fatal extraction error", {
      code: "FATAL",
      retryable: false,
    });

    (repo.saveExtractedDocument as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    await expect(
      worker.processDocument(message),
    ).resolves.toBeUndefined();
  });

  it("rethrows for retryable errors", async () => {
    const message = createMessage({ content: "test" });
    const error = new ExtractionError("Retryable error", {
      code: "TRANSIENT",
      retryable: true,
    });

    (repo.saveExtractedDocument as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error);

    await expect(
      worker.processDocument(message),
    ).rejects.toThrow("Retryable error");
  });

  it("respects maxConcurrency limit", async () => {
    const workerWithLimit = new ExtractionWorker(repo, events, { maxConcurrency: 1 });
    const message = createMessage({ content: "test" });

    (repo.createJob as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );

    const p1 = workerWithLimit.processDocument(message);
    const p2 = workerWithLimit.processDocument(message);

    await expect(Promise.all([p1, p2])).rejects.toThrow("Worker at capacity");
  });

  it("includes duration_ms in saved metadata", async () => {
    const message = createMessage({ content: "test content" });

    await worker.processDocument(message);

    const saveCall = (repo.saveExtractedDocument as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saveCall.metadata.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("uses auto strategy when mime_type is missing", async () => {
    const message = createMessage({ content: "test", mime_type: undefined });

    await worker.processDocument(message);

    const createCall = (repo.createJob as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.dto.strategy).toBe("text/plain");
  });
});
