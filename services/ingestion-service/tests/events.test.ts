import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPublish = vi.fn().mockResolvedValue("evt_123");
const mockEventsEmit = vi.fn();
const mockEventsOn = vi.fn();

vi.mock("@memory-platform/queue", () => ({
  Publisher: vi.fn().mockImplementation((_redis, _config, _events, _consumerId) => ({
    publish: mockPublish,
  })),
  buildKey: vi.fn((prefix: string, ...segments: string[]) =>
    [prefix, ...segments].join(":")
  ),
}));

vi.mock("node:events", () => ({
  EventEmitter: vi.fn().mockImplementation(() => ({
    emit: mockEventsEmit,
    on: mockEventsOn,
  })),
}));

import { EventPublisher } from "../src/events.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

describe("EventPublisher", () => {
  let publisher: EventPublisher;
  const mockRedis = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    publisher = new EventPublisher(mockRedis, {
      redisUrl: "redis://localhost:6379",
      defaultChannel: "ingestion",
    });
  });

  describe("publishDocumentReceived", () => {
    it("publishes document.received event", async () => {
      const eventId = await publisher.publishDocumentReceived(
        "ws_test" as WorkspaceId,
        {
          document_id: "doc_123",
          workspace_id: "ws_test",
          title: "Test Doc",
          source_type: "upload",
          mime_type: "text/plain",
          size_bytes: 1024,
          created_by: "user_abc",
        },
      );

      expect(eventId).toBe("evt_123");
      expect(mockPublish).toHaveBeenCalledTimes(1);

      const callArgs = mockPublish.mock.calls[0];
      expect(callArgs[0]).toBe("ingestion");
      expect(callArgs[1].type).toBe("document.received");
      expect(callArgs[1].payload.title).toBe("Test Doc");
      expect(callArgs[1].payload.document_id).toBe("doc_123");
    });

    it("passes correlation ID when provided", async () => {
      await publisher.publishDocumentReceived(
        "ws_test" as WorkspaceId,
        {
          document_id: "doc_456",
          workspace_id: "ws_test",
          title: "Doc with Corr",
          source_type: "url",
          created_by: "user_abc",
        },
        "corr_xyz",
      );

      const callArgs = mockPublish.mock.calls[0];
      expect(callArgs[1].correlationId).toBe("corr_xyz");
    });
  });

  describe("publishDocumentValidated", () => {
    it("publishes document.validated event", async () => {
      const eventId = await publisher.publishDocumentValidated(
        "ws_test" as WorkspaceId,
        {
          document_id: "doc_789",
          workspace_id: "ws_test",
          validation_time_ms: 42,
        },
      );

      expect(eventId).toBe("evt_123");
      expect(mockPublish).toHaveBeenCalledTimes(1);

      const callArgs = mockPublish.mock.calls[0];
      expect(callArgs[1].type).toBe("document.validated");
      expect(callArgs[1].payload.document_id).toBe("doc_789");
      expect(callArgs[1].payload.validation_time_ms).toBe(42);
    });
  });

  describe("publishDocumentRejected", () => {
    it("publishes document.rejected event", async () => {
      const eventId = await publisher.publishDocumentRejected(
        "ws_test" as WorkspaceId,
        {
          document_id: "doc_fail",
          workspace_id: "ws_test",
          reason: "Unsupported file type",
          error_code: "UNSUPPORTED_FILE_TYPE",
        },
      );

      expect(eventId).toBe("evt_123");
      expect(mockPublish).toHaveBeenCalledTimes(1);

      const callArgs = mockPublish.mock.calls[0];
      expect(callArgs[1].type).toBe("document.rejected");
      expect(callArgs[1].payload.reason).toBe("Unsupported file type");
      expect(callArgs[1].payload.error_code).toBe("UNSUPPORTED_FILE_TYPE");
    });
  });

  describe("event sequence", () => {
    it("generates unique event IDs per call", async () => {
      const ids: string[] = [];

      mockPublish
        .mockResolvedValueOnce("evt_a")
        .mockResolvedValueOnce("evt_b")
        .mockResolvedValueOnce("evt_c");

      ids.push(
        await publisher.publishDocumentReceived("ws_test" as WorkspaceId, {
          document_id: "doc_1",
          workspace_id: "ws_test",
          title: "Doc 1",
          source_type: "upload",
          created_by: "user",
        }),
      );

      ids.push(
        await publisher.publishDocumentValidated("ws_test" as WorkspaceId, {
          document_id: "doc_1",
          workspace_id: "ws_test",
          validation_time_ms: 10,
        }),
      );

      ids.push(
        await publisher.publishDocumentRejected("ws_test" as WorkspaceId, {
          document_id: "doc_2",
          workspace_id: "ws_test",
          reason: "Too large",
          error_code: "DOCUMENT_TOO_LARGE",
        }),
      );

      expect(mockPublish).toHaveBeenCalledTimes(3);
      expect(new Set(ids).size).toBe(3);
    });
  });
});
