import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncScheduler } from "../src/sync-scheduler.js";
import { ConnectorRegistry } from "../src/connector-registry.js";
import type { ConnectorRepository } from "../src/repository.js";
import type { ConnectorPlugin, SyncJobRecord, ConnectorAccountRecord } from "../src/types.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

function makeMockRepo(): ConnectorRepository {
  return {
    getActiveSyncJobs: vi.fn().mockResolvedValue([]),
    listAccountsByWorkspace: vi.fn().mockResolvedValue([]),
    getSyncState: vi.fn().mockResolvedValue(null),
    createSyncJob: vi.fn(),
  } as unknown as ConnectorRepository;
}

function makeMockPlugin(): ConnectorPlugin {
  return {
    type: "google-drive",
    displayName: "Google Drive",
    getAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    validateCredentials: vi.fn(),
    sync: vi.fn(),
  };
}

describe("SyncScheduler", () => {
  let scheduler: SyncScheduler;
  let mockRepo: ReturnType<typeof makeMockRepo>;
  let mockRegistry: ConnectorRegistry;
  let onSyncRequested: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    mockRegistry = new ConnectorRegistry();
    mockRegistry.register(makeMockPlugin());
    onSyncRequested = vi.fn().mockResolvedValue({ id: "csync_scheduled" });
  });

  afterEach(() => {
    if (scheduler) scheduler.stop();
  });

  it("starts and stops the scheduler", () => {
    scheduler = new SyncScheduler(mockRepo, mockRegistry, onSyncRequested, {
      pollIntervalMs: 100,
      maxConcurrentJobs: 5,
    });

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("does not start twice", () => {
    scheduler = new SyncScheduler(mockRepo, mockRegistry, onSyncRequested, {
      pollIntervalMs: 1000,
      maxConcurrentJobs: 5,
    });

    scheduler.start();
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
  });

  it("triggers delta sync for accounts needing update", async () => {
    const mockAccount: ConnectorAccountRecord = {
      id: "acct_1",
      workspace_id: "ws_test" as WorkspaceId,
      connector_type: "google-drive",
      label: "My Drive",
      credential_ref: "cred",
      config: { settings: {} },
      is_active: true,
      created_at: "2026-05-14T00:00:00.000Z",
      updated_at: "2026-05-14T00:00:00.000Z",
    };

    (mockRepo.listAccountsByWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue([mockAccount]);
    (mockRepo.getSyncState as ReturnType<typeof vi.fn>).mockResolvedValue({
      last_synced_at: new Date(Date.now() - 3600_000).toISOString(),
      resource_checksums: {},
      sync_count: 1,
    });
    (mockRepo.getActiveSyncJobs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    scheduler = new SyncScheduler(mockRepo, mockRegistry, onSyncRequested, {
      pollIntervalMs: 50,
      maxConcurrentJobs: 5,
    });

    scheduler.start();

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onSyncRequested).toHaveBeenCalledWith(
      mockAccount,
      "incremental",
    );

    scheduler.stop();
  });

  it("skips accounts with recent sync", async () => {
    const mockAccount: ConnectorAccountRecord = {
      id: "acct_1",
      workspace_id: "ws_test" as WorkspaceId,
      connector_type: "google-drive",
      label: "My Drive",
      credential_ref: "cred",
      config: { settings: {} },
      is_active: true,
      created_at: "2026-05-14T00:00:00.000Z",
      updated_at: "2026-05-14T00:00:00.000Z",
    };

    (mockRepo.listAccountsByWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue([mockAccount]);
    (mockRepo.getSyncState as ReturnType<typeof vi.fn>).mockResolvedValue({
      last_synced_at: new Date().toISOString(),
      resource_checksums: {},
      sync_count: 1,
    });
    (mockRepo.getActiveSyncJobs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    scheduler = new SyncScheduler(mockRepo, mockRegistry, onSyncRequested, {
      pollIntervalMs: 50,
      maxConcurrentJobs: 5,
    });

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    scheduler.stop();

    expect(onSyncRequested).not.toHaveBeenCalled();
  });

  it("skips inactive accounts", async () => {
    const mockAccount: ConnectorAccountRecord = {
      id: "acct_1",
      workspace_id: "ws_test" as WorkspaceId,
      connector_type: "google-drive",
      label: "My Drive",
      credential_ref: "cred",
      config: { settings: {} },
      is_active: false,
      created_at: "2026-05-14T00:00:00.000Z",
      updated_at: "2026-05-14T00:00:00.000Z",
    };

    (mockRepo.listAccountsByWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue([mockAccount]);
    (mockRepo.getActiveSyncJobs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    scheduler = new SyncScheduler(mockRepo, mockRegistry, onSyncRequested, {
      pollIntervalMs: 50,
      maxConcurrentJobs: 5,
    });

    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    scheduler.stop();

    expect(onSyncRequested).not.toHaveBeenCalled();
  });

  it("tracks active jobs", () => {
    scheduler = new SyncScheduler(mockRepo, mockRegistry, onSyncRequested, {
      pollIntervalMs: 1000,
      maxConcurrentJobs: 5,
    });

    expect(scheduler.activeJobCount).toBe(0);
    scheduler.addActiveJob("csync_1");
    expect(scheduler.activeJobCount).toBe(1);
    scheduler.addActiveJob("csync_2");
    expect(scheduler.activeJobCount).toBe(2);
    scheduler.removeActiveJob("csync_1");
    expect(scheduler.activeJobCount).toBe(1);
  });
});
