import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { createEventPublisher, type EventPublisher } from "../src/events.js";
import type { Publisher } from "@memory-platform/queue";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

function makeMockPublisher(): Publisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  } as unknown as Publisher;
}

describe("EventPublisher", () => {
  let events: EventPublisher;
  let mockPublisher: ReturnType<typeof makeMockPublisher>;

  beforeEach(() => {
    mockPublisher = makeMockPublisher();
    events = createEventPublisher(mockPublisher);
  });

  it("publishes sync requested event with correct envelope", async () => {
    const eventId = await events.publishSyncRequested("ws_test" as WorkspaceId, {
      connector_type: "google-drive",
      account_id: "acct_123",
      sync_mode: "incremental",
    });

    expect(eventId).toMatch(/^evt/);
    expect(mockPublisher.publish).toHaveBeenCalledTimes(1);

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("connector-events");
    expect(call[1].type).toBe("connector.sync.requested");
    expect(call[1].payload.connector_type).toBe("google-drive");
  });

  it("publishes document discovered event", async () => {
    const eventId = await events.publishDocumentDiscovered("ws_test" as WorkspaceId, {
      connector_type: "slack",
      account_id: "acct_456",
      external_id: "ext_789",
      name: "test-doc.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      checksum: "abc123",
    });

    expect(eventId).toMatch(/^evt/);
    expect(mockPublisher.publish).toHaveBeenCalledTimes(1);

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].type).toBe("external.document.discovered");
    expect(call[1].payload.name).toBe("test-doc.pdf");
  });

  it("publishes document updated event", async () => {
    await events.publishDocumentUpdated("ws_test" as WorkspaceId, {
      connector_type: "notion",
      account_id: "acct_789",
      external_id: "ext_001",
      name: "updated-doc.md",
    });

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].type).toBe("external.document.updated");
  });

  it("publishes document deleted event", async () => {
    await events.publishDocumentDeleted("ws_test" as WorkspaceId, {
      connector_type: "google-drive",
      account_id: "acct_123",
      external_id: "ext_deleted",
      document_id: "doc_old",
    });

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].type).toBe("external.document.deleted");
    expect(call[1].payload.external_id).toBe("ext_deleted");
  });

  it("publishes sync started event", async () => {
    await events.publishSyncStarted("ws_test" as WorkspaceId, "slack", "acct_456");

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].type).toBe("connector.sync_started");
    expect(call[1].payload.connector_id).toBe("slack");
  });

  it("publishes sync completed event", async () => {
    await events.publishSyncCompleted("ws_test" as WorkspaceId, "gmail", "acct_001", 42);

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].type).toBe("connector.sync_completed");
    expect(call[1].payload.documents_synced).toBe(42);
  });

  it("publishes sync failed event", async () => {
    await events.publishSyncFailed("ws_test" as WorkspaceId, "notion", "acct_007", "API rate limit");

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].type).toBe("connector.sync_failed");
    expect(call[1].payload.error).toBe("API rate limit");
  });

  it("emits published event via EventEmitter", async () => {
    const listener = vi.fn();
    events.events.on("published", listener);

    await events.publishSyncRequested("ws_test" as WorkspaceId, {
      connector_type: "test",
      account_id: "acct_1",
      sync_mode: "full",
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "connector.sync.requested",
        workspaceId: "ws_test",
      }),
    );
  });

  it("includes metadata in event envelope", async () => {
    await events.publishDocumentDiscovered("ws_meta" as WorkspaceId, {
      connector_type: "test",
      account_id: "acct_1",
      external_id: "ext_1",
      name: "doc",
    });

    const call = (mockPublisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].metadata).toEqual({ workspace_id: "ws_meta" });
    expect(call[1].correlationId).toMatch(/^corr/);
  });
});
