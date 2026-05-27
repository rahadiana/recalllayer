import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncWorker } from "../src/worker.js";
import { ConnectorRegistry } from "../src/connector-registry.js";
import type { ConnectorRepository } from "../src/repository.js";
import type { OAuthManager } from "../src/oauth-manager.js";
import type { EventPublisher } from "../src/events.js";
import type { ConnectorPlugin, SyncJobRecord, ConnectorAccountRecord } from "../src/types.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

function makeMockRepo(): ConnectorRepository {
  return {
    getSyncJob: vi.fn(),
    getAccount: vi.fn(),
    updateSyncJobStatus: vi.fn(),
    updateSyncJobCounts: vi.fn(),
    upsertSyncState: vi.fn(),
    updateAccountLastSync: vi.fn(),
    getSyncState: vi.fn(),
    getLatestSyncJob: vi.fn(),
  } as unknown as ConnectorRepository;
}

function makeMockOAuth(): OAuthManager {
  return {
    getValidAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
  } as unknown as OAuthManager;
}

function makeMockEvents(): EventPublisher {
  return {
    publishSyncStarted: vi.fn().mockResolvedValue("evt_start"),
    publishSyncCompleted: vi.fn().mockResolvedValue("evt_done"),
    publishSyncFailed: vi.fn().mockResolvedValue("evt_fail"),
    publishSyncRequested: vi.fn().mockResolvedValue("evt_req"),
    publishDocumentDiscovered: vi.fn().mockResolvedValue("evt_disc"),
    publishDocumentUpdated: vi.fn().mockResolvedValue("evt_upd"),
    publishDocumentDeleted: vi.fn().mockResolvedValue("evt_del"),
    events: { on: vi.fn(), emit: vi.fn() } as never,
    close: vi.fn(),
  } as unknown as EventPublisher;
}

function makeMockPlugin(): ConnectorPlugin {
  return {
    type: "google-drive",
    displayName: "Google Drive",
    getAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    validateCredentials: vi.fn(),
    sync: vi.fn().mockResolvedValue({
      items: [
        {
          externalId: "file_1",
          name: "test-doc.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          checksum: "abc123",
          updatedAt: "2026-05-14T00:00:00.000Z",
          isDeleted: false,
          raw: {},
        },
        {
          externalId: "file_2",
          name: "deleted-doc.txt",
          isDeleted: true,
          raw: {},
        },
        {
          externalId: "file_3",
          name: "unchanged-doc.md",
          checksum: "existing-checksum",
          isDeleted: false,
          raw: {},
        },
      ],
      cursor: "next-page-token-123",
      hasMore: false,
      metadata: { totalFiles: 3 },
    }),
  };
}

function makeMockJob(overrides?: Partial<SyncJobRecord>): SyncJobRecord {
  return {
    id: "csync_test",
    account_id: "cacct_test",
    workspace_id: "ws_test" as WorkspaceId,
    connector_type: "google-drive",
    status: "pending",
    sync_mode: "incremental",
    cursor_before: "prev-cursor",
    cursor_after: undefined,
    discovered_count: 0,
    processed_count: 0,
    skipped_count: 0,
    error_count: 0,
    progress: {},
    created_at: "2026-05-14T00:00:00.000Z",
    ...overrides,
  };
}

function makeMockAccount(): ConnectorAccountRecord {
  return {
    id: "cacct_test",
    workspace_id: "ws_test" as WorkspaceId,
    connector_type: "google-drive",
    label: "My Drive",
    credential_ref: "cred_ref",
    config: { settings: {} },
    is_active: true,
    last_synced_at: "2026-05-13T00:00:00.000Z",
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
  };
}

describe("SyncWorker", () => {
  let worker: SyncWorker;
  let mockRepo: ReturnType<typeof makeMockRepo>;
  let mockRegistry: ConnectorRegistry;
  let mockOAuth: ReturnType<typeof makeMockOAuth>;
  let mockEvents: ReturnType<typeof makeMockEvents>;
  let mockPlugin: ConnectorPlugin;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    mockRegistry = new ConnectorRegistry();
    mockOAuth = makeMockOAuth();
    mockEvents = makeMockEvents();
    mockPlugin = makeMockPlugin();

    mockRegistry.register(mockPlugin);

    (mockRepo.getSyncJob as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockJob());
    (mockRepo.getAccount as ReturnType<typeof vi.fn>).mockResolvedValue(makeMockAccount());
    (mockRepo.getSyncState as ReturnType<typeof vi.fn>).mockResolvedValue({
      resource_checksums: { "file_3": "existing-checksum" },
    });

    worker = new SyncWorker(mockRepo, mockRegistry, mockOAuth, mockEvents);
  });

  it("throws when job not found", async () => {
    (mockRepo.getSyncJob as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(worker.executeSyncJob("nonexistent")).rejects.toThrow(
      "Sync job not found",
    );
  });

  it("skips already completed jobs", async () => {
    (mockRepo.getSyncJob as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeMockJob({ status: "completed" }),
    );

    const job = await worker.executeSyncJob("csync_done");
    expect(job.status).toBe("completed");
    expect(mockEvents.publishSyncStarted).not.toHaveBeenCalled();
  });

  it("executes a full sync flow successfully", async () => {
    const result = await worker.executeSyncJob("csync_test");

    expect(mockEvents.publishSyncStarted).toHaveBeenCalledWith(
      "ws_test",
      "google-drive",
      "cacct_test",
    );

    expect(mockRepo.updateSyncJobStatus).toHaveBeenCalledWith(
      "csync_test",
      "completed",
      expect.objectContaining({
        processed_count: 2,
        skipped_count: 1,
      }),
    );

    expect(mockEvents.publishDocumentDiscovered).toHaveBeenCalled();
    expect(mockEvents.publishDocumentUpdated).toHaveBeenCalled();
    expect(mockEvents.publishDocumentDeleted).toHaveBeenCalledWith(
      "ws_test",
      expect.objectContaining({
        external_id: "file_2",
      }),
    );

    expect(mockEvents.publishSyncCompleted).toHaveBeenCalledWith(
      "ws_test",
      "google-drive",
      "cacct_test",
      2,
    );

    expect(result.status).toBeDefined();
  });

  it("handles sync failures and publishes failed event", async () => {
    (mockPlugin.sync as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("API rate limit exceeded"),
    );

    await expect(worker.executeSyncJob("csync_test")).rejects.toThrow(
      "API rate limit exceeded",
    );

    expect(mockRepo.updateSyncJobStatus).toHaveBeenCalledWith(
      "csync_test",
      "failed",
      expect.objectContaining({
        error_message: "API rate limit exceeded",
      }),
    );

    expect(mockEvents.publishSyncFailed).toHaveBeenCalledWith(
      "ws_test",
      "google-drive",
      "cacct_test",
      "API rate limit exceeded",
    );
  });

  it("skips items with matching checksums", async () => {
    await worker.executeSyncJob("csync_test");

    expect(mockEvents.publishDocumentDiscovered).toHaveBeenCalledTimes(1);
    expect(mockEvents.publishDocumentDiscovered).toHaveBeenCalledWith(
      "ws_test",
      expect.objectContaining({ external_id: "file_1" }),
    );
  });

  it("handles empty sync result", async () => {
    (mockPlugin.sync as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      cursor: undefined,
      hasMore: false,
      metadata: {},
    });

    await worker.executeSyncJob("csync_empty");

    expect(mockRepo.updateSyncJobStatus).toHaveBeenCalledWith(
      "csync_empty",
      "completed",
      expect.objectContaining({
        processed_count: 0,
        discovered_count: 0,
      }),
    );
  });
});
