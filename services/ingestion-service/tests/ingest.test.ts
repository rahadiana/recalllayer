import { describe, it, expect, beforeEach, vi } from "vitest";
import { DocumentIngestHandler, IngestValidationError } from "../src/handlers/ingest.js";
import { DocumentRepository } from "../src/repository.js";
import { EventPublisher } from "../src/events.js";
import type { WorkspaceId, DocumentId } from "@memory-platform/shared-schemas";
import type { DocumentRecord } from "../src/types.js";

function makeMockRepo(): DocumentRepository {
  return {
    createDocument: vi.fn(),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    updateStatus: vi.fn(),
  } as unknown as DocumentRepository;
}

function makeMockEvents(): EventPublisher {
  return {
    publishDocumentReceived: vi.fn().mockResolvedValue("evt_received_123"),
    publishDocumentValidated: vi.fn().mockResolvedValue("evt_validated_456"),
    publishDocumentRejected: vi.fn().mockResolvedValue("evt_rejected_789"),
  } as unknown as EventPublisher;
}

function makeMockDoc(overrides?: Partial<DocumentRecord>): DocumentRecord {
  return {
    id: "doc_test123" as DocumentId,
    workspace_id: "ws_test" as WorkspaceId,
    title: "Test Document",
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
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("DocumentIngestHandler", () => {
  let handler: DocumentIngestHandler;
  let mockRepo: DocumentRepository;
  let mockEvents: EventPublisher;

  const validPayload = {
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
  };

  beforeEach(() => {
    mockRepo = makeMockRepo();
    mockEvents = makeMockEvents();
    handler = new DocumentIngestHandler(mockRepo, mockEvents);
  });

  describe("handleIngestDocument", () => {
    it("successfully ingests a valid document", async () => {
      const doc = makeMockDoc();
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      const result = await handler.handleIngestDocument(validPayload);

      expect(result.document).toEqual(doc);
      expect(result.event_id).toBe("evt_validated_456");

      expect(mockRepo.createDocument).toHaveBeenCalledWith({
        workspaceId: "ws_test",
        dto: validPayload.document,
        createdBy: "user_xyz",
      });

      expect(mockEvents.publishDocumentReceived).toHaveBeenCalledWith(
        "ws_test",
        expect.objectContaining({
          document_id: "doc_test123",
          title: "Test Document",
          source_type: "upload",
        }),
        undefined,
      );

      expect(mockEvents.publishDocumentValidated).toHaveBeenCalled();
      expect(mockEvents.publishDocumentRejected).not.toHaveBeenCalled();
    });

    it("publishes both received and validated events", async () => {
      const doc = makeMockDoc();
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      const result = await handler.handleIngestDocument(validPayload);

      expect(result.event_id).toBe("evt_validated_456");
      expect(mockEvents.publishDocumentReceived).toHaveBeenCalledTimes(1);
      expect(mockEvents.publishDocumentValidated).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid payload and publishes rejected event", async () => {
      await expect(
        handler.handleIngestDocument({ invalid: true }),
      ).rejects.toThrow(IngestValidationError);

      expect(mockRepo.createDocument).not.toHaveBeenCalled();
      expect(mockEvents.publishDocumentReceived).not.toHaveBeenCalled();
    });

    it("rejects unsupported MIME type", async () => {
      await expect(
        handler.handleIngestDocument({
          ...validPayload,
          document: {
            ...validPayload.document,
            source: {
              type: "upload" as const,
              mime_type: "application/octet-stream",
              size_bytes: 1024,
            },
          },
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

    it("rejects oversized file", async () => {
      await expect(
        handler.handleIngestDocument({
          ...validPayload,
          document: {
            ...validPayload.document,
            source: {
              type: "upload" as const,
              mime_type: "text/plain",
              size_bytes: 60 * 1024 * 1024,
            },
          },
        }),
      ).rejects.toThrow(IngestValidationError);

      expect(mockEvents.publishDocumentRejected).toHaveBeenCalledWith(
        "ws_test",
        expect.objectContaining({
          error_code: "DOCUMENT_TOO_LARGE",
        }),
        undefined,
      );
    });

    it("passes correlation_id to events", async () => {
      const doc = makeMockDoc();
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      await handler.handleIngestDocument({
        ...validPayload,
        correlation_id: "corr_123",
      });

      expect(mockEvents.publishDocumentReceived).toHaveBeenCalledWith(
        "ws_test",
        expect.any(Object),
        "corr_123",
      );
    });

    it("handles document with URL source", async () => {
      const doc = makeMockDoc({
        source: {
          type: "url",
          location: "https://example.com/doc",
          mime_type: "text/html",
        },
      });
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      const result = await handler.handleIngestDocument({
        workspace_id: "ws_test",
        document: {
          title: "Web Doc",
          source: {
            type: "url",
            location: "https://example.com/doc",
            mime_type: "text/html",
          },
        },
        created_by: "user_xyz",
      });

      expect(result.document.source.type).toBe("url");
      expect(result.document.source.location).toBe("https://example.com/doc");
    });

    it("handles document with connector source", async () => {
      const doc = makeMockDoc({
        source: {
          type: "connector",
          connector: "slack",
          location: "C123456",
        },
      });
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      const result = await handler.handleIngestDocument({
        workspace_id: "ws_test",
        document: {
          title: "Slack Message",
          source: {
            type: "connector",
            connector: "slack",
            location: "C123456",
          },
        },
        created_by: "user_xyz",
      });

      expect(result.document.source.type).toBe("connector");
    });

    it("includes validation time in validated event", async () => {
      const doc = makeMockDoc();
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      await handler.handleIngestDocument(validPayload);

      expect(mockEvents.publishDocumentValidated).toHaveBeenCalledWith(
        "ws_test",
        expect.objectContaining({
          document_id: "doc_test123",
          validation_time_ms: expect.any(Number),
        }),
        undefined,
      );
    });

    it("stores metadata and tags from the payload", async () => {
      const doc = makeMockDoc();
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockResolvedValue(doc);

      await handler.handleIngestDocument({
        ...validPayload,
        document: {
          ...validPayload.document,
          metadata: { author: "John", priority: "high" },
          tags: ["important", "review"],
        },
      });

      expect(mockRepo.createDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          dto: expect.objectContaining({
            metadata: { author: "John", priority: "high" },
            tags: ["important", "review"],
          }),
        }),
      );
    });

    it("propagates repository errors", async () => {
      (mockRepo.createDocument as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("DB connection failed"),
      );

      await expect(
        handler.handleIngestDocument(validPayload),
      ).rejects.toThrow("DB connection failed");

      expect(mockEvents.publishDocumentReceived).not.toHaveBeenCalled();
    });
  });
});
