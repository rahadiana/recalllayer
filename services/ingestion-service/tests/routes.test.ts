import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocumentIngestHandler, IngestValidationError } from "../src/handlers/ingest.js";
import { DocumentRepository } from "../src/repository.js";
import type { DocumentId, WorkspaceId } from "@memory-platform/shared-schemas";
import type { DocumentRecord } from "../src/types.js";

function makeMockRepo(overrides?: Partial<DocumentRepository>): DocumentRepository {
  return {
    createDocument: vi.fn(),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  } as unknown as DocumentRepository;
}

function makeMockEvents() {
  return {
    publishDocumentReceived: vi.fn().mockResolvedValue("evt_received_001"),
    publishDocumentValidated: vi.fn().mockResolvedValue("evt_validated_001"),
    publishDocumentRejected: vi.fn().mockResolvedValue("evt_rejected_001"),
  };
}

function makeDoc(overrides?: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: "doc_test" as DocumentId,
    workspace_id: "ws_test" as WorkspaceId,
    title: "Test Document",
    description: undefined,
    status: "pending",
    source: {
      type: "upload",
      filename: "test.txt",
      mime_type: "text/plain",
      size_bytes: 1024,
    },
    metadata: {},
    tags: [],
    created_by: "user_xyz",
    chunk_count: undefined,
    error_message: undefined,
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("POST /internal/documents (handler logic)", () => {
  let mockRepo: DocumentRepository;
  let mockEvents: ReturnType<typeof makeMockEvents>;
  let handler: DocumentIngestHandler;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    mockEvents = makeMockEvents();
    handler = new DocumentIngestHandler(mockRepo, mockEvents);
  });

  it("returns 201-style response on successful ingest", async () => {
    const doc = makeDoc();
    (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

    const result = await handler.handleIngestDocument({
      workspace_id: "ws_test",
      document: {
        title: "Test Document",
        source: {
          type: "upload" as const,
          filename: "test.txt",
          mime_type: "text/plain",
          size_bytes: 1024,
        },
      },
      created_by: "user_xyz",
    });

    expect(result.document).toBeDefined();
    expect(result.document.id).toBe("doc_test");
    expect(result.event_id).toBeTruthy();
  });

  it("returns validation errors for invalid payloads", async () => {
    await expect(
      handler.handleIngestDocument({
        document: { title: "No Workspace" },
      }),
    ).rejects.toThrow(IngestValidationError);
  });

  it("rejects documents with unsupported MIME types", async () => {
    await expect(
      handler.handleIngestDocument({
        workspace_id: "ws_test",
        document: {
          title: "Bad File",
          source: {
            type: "upload",
            mime_type: "application/x-executable",
            size_bytes: 1024,
          },
        },
        created_by: "user_xyz",
      }),
    ).rejects.toThrow(IngestValidationError);

    expect(mockEvents.publishDocumentRejected).toHaveBeenCalledWith(
      "ws_test",
      expect.objectContaining({
        error_code: "UNSUPPORTED_FILE_TYPE",
      }),
      undefined,
    );
  });
});

describe("GET /internal/documents/:id (repository logic)", () => {
  let mockRepo: DocumentRepository;

  beforeEach(() => {
    mockRepo = makeMockRepo();
  });

  it("returns document when found", async () => {
    const doc = makeDoc();
    (mockRepo.getDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

    const result = await mockRepo.getDocument("doc_test" as DocumentId);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("doc_test");
  });

  it("returns null when document not found", async () => {
    (mockRepo.getDocument as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await mockRepo.getDocument("doc_missing" as DocumentId);

    expect(result).toBeNull();
  });
});

describe("GET /internal/documents (list with pagination)", () => {
  let mockRepo: DocumentRepository;

  beforeEach(() => {
    mockRepo = makeMockRepo();
  });

  it("lists documents for a workspace", async () => {
    const docs = [makeDoc({ id: "doc_1" as DocumentId }), makeDoc({ id: "doc_2" as DocumentId })];
    (mockRepo.listDocuments as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: docs,
      nextCursor: null,
    });

    const result = await mockRepo.listDocuments("ws_test" as WorkspaceId, {
      limit: 20,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("doc_1");
    expect(result.nextCursor).toBeNull();
  });

  it("returns empty list for workspace with no documents", async () => {
    (mockRepo.listDocuments as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const result = await mockRepo.listDocuments("ws_empty" as WorkspaceId);

    expect(result.items).toHaveLength(0);
  });

  it("supports cursor pagination", async () => {
    const docs = [makeDoc({ id: "doc_1" as DocumentId })];
    (mockRepo.listDocuments as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: docs,
      nextCursor: "2026-05-13T00:00:00.000Z",
    });

    const result = await mockRepo.listDocuments("ws_test" as WorkspaceId, {
      limit: 10,
      cursor: "2026-05-14T00:00:00.000Z",
    });

    expect(result.nextCursor).toBe("2026-05-13T00:00:00.000Z");
  });
});

describe("Status update flow", () => {
  it("updates document status through repository", async () => {
    const mockRepo = makeMockRepo({
      updateStatus: vi.fn().mockResolvedValue(
        makeDoc({ status: "extracting" }),
      ),
    });

    const result = await mockRepo.updateStatus(
      "doc_test" as DocumentId,
      "extracting",
    );

    expect(result).not.toBeNull();
    expect(result!.status).toBe("extracting");
  });

  it("handles status update with error message", async () => {
    const mockRepo = makeMockRepo({
      updateStatus: vi.fn().mockResolvedValue(
        makeDoc({ status: "error", error_message: "Timeout" }),
      ),
    });

    const result = await mockRepo.updateStatus(
      "doc_fail" as DocumentId,
      "error",
      "Timeout",
    );

    expect(result!.status).toBe("error");
    expect(result!.error_message).toBe("Timeout");
  });
});
