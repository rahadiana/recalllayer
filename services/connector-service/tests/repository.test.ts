import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectorRepository } from "../src/repository.js";
import type { PostgresPool } from "@memory-platform/db";

function makeMockPool(): PostgresPool {
  const sql = vi.fn() as unknown as PostgresPool["sql"];
  (sql as ReturnType<typeof vi.fn>).mockReturnValue([]);
  const pool = {
    sql,
    health: vi.fn().mockResolvedValue({ status: "healthy" as const, latencyMs: 1 }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as PostgresPool;

  (pool.sql as ReturnType<typeof vi.fn>).json = vi.fn((obj: unknown) => JSON.stringify(obj));
  (pool.sql as ReturnType<typeof vi.fn>).unsafe = vi.fn((str: string) => str);
  return pool;
}

describe("ConnectorRepository", () => {
  let repo: ConnectorRepository;
  let mockPool: PostgresPool;

  beforeEach(() => {
    mockPool = makeMockPool();
    repo = new ConnectorRepository(mockPool);
  });

  describe("createAccount", () => {
    it("creates a connector account and returns record", async () => {
      const mockRow = {
        id: "cacct_test123",
        workspace_id: "ws_test",
        connector_type: "google-drive",
        label: "My Drive",
        credential_ref: "cred_ref_1",
        config: { settings: {} },
        is_active: true,
        last_synced_at: null,
        created_at: "2026-05-14T00:00:00.000Z",
        updated_at: "2026-05-14T00:00:00.000Z",
      };

      const mockSql = mockPool.sql as ReturnType<typeof vi.fn>;
      mockSql.mockResolvedValueOnce([mockRow]);

      const account = await repo.createAccount({
        workspaceId: "ws_test" as never,
        connectorType: "google-drive",
        label: "My Drive",
        credentialRef: "cred_ref_1",
        config: { settings: {} },
      });

      expect(account.id).toMatch(/^cacct/);
      expect(account.connector_type).toBe("google-drive");
      expect(account.label).toBe("My Drive");
      expect(mockSql).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccount", () => {
    it("returns account when found", async () => {
      const mockRow = { id: "cacct_1", connector_type: "slack", label: "Slack" };
      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockRow]);

      const account = await repo.getAccount("cacct_1");
      expect(account).not.toBeNull();
      expect(account?.label).toBe("Slack");
    });

    it("returns null when not found", async () => {
      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const account = await repo.getAccount("nonexistent");
      expect(account).toBeNull();
    });
  });

  describe("storeToken", () => {
    it("stores an encrypted token", async () => {
      const mockToken = {
        id: "ctok_1",
        account_id: "cacct_1",
        token_type: "access",
        token_encrypted: "encrypted-data",
        metadata: {},
        expires_at: null,
        created_at: "2026-05-14T00:00:00.000Z",
      };

      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockToken]);

      const token = await repo.storeToken({
        accountId: "cacct_1",
        tokenType: "access",
        tokenEncrypted: "encrypted-data",
      });

      expect(token.token_type).toBe("access");
      expect(mockPool.sql).toHaveBeenCalled();
    });
  });

  describe("createSyncJob", () => {
    it("creates a sync job with pending status", async () => {
      const mockJob = {
        id: "csync_1",
        account_id: "cacct_1",
        workspace_id: "ws_test",
        connector_type: "google-drive",
        status: "pending",
        sync_mode: "incremental",
        discovered_count: 0,
        processed_count: 0,
        skipped_count: 0,
        error_count: 0,
        progress: {},
        created_at: "2026-05-14T00:00:00.000Z",
      };

      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockJob]);

      const job = await repo.createSyncJob({
        accountId: "cacct_1",
        workspaceId: "ws_test" as never,
        connectorType: "google-drive",
        syncMode: "incremental",
      });

      expect(job.id).toMatch(/^csync/);
      expect(job.status).toBe("pending");
    });
  });

  describe("updateSyncJobStatus", () => {
    it("updates job status and counts", async () => {
      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      await repo.updateSyncJobStatus("csync_1", "completed", {
        processed_count: 10,
        discovered_count: 15,
      });

      expect(mockPool.sql).toHaveBeenCalled();
    });
  });

  describe("upsertSyncState", () => {
    it("upserts a sync state record", async () => {
      const mockState = {
        id: "cstate_1",
        account_id: "cacct_1",
        connector_type: "google-drive",
        cursor: "next-page-token",
        resource_checksums: { "file1": "abc" },
        sync_count: 1,
        delta_detected: true,
        last_synced_at: "2026-05-14T00:00:00.000Z",
        created_at: "2026-05-14T00:00:00.000Z",
        updated_at: "2026-05-14T00:00:00.000Z",
      };

      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockState]);

      const state = await repo.upsertSyncState({
        accountId: "cacct_1",
        connectorType: "google-drive",
        cursor: "next-page-token",
        resourceChecksums: { "file1": "abc" },
        deltaDetected: true,
      });

      expect(state.cursor).toBe("next-page-token");
      expect(state.sync_count).toBe(1);
    });
  });

  describe("oauth state management", () => {
    it("stores and retrieves OAuth state", async () => {
      const mockState = {
        state: "oauth_test123",
        connector_type: "slack",
        workspace_id: "ws_test",
        redirect_uri: "http://localhost/callback",
        expires_at: "2026-05-14T01:00:00.000Z",
        created_at: "2026-05-14T00:00:00.000Z",
      };

      (mockPool.sql as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([mockState]);

      await repo.storeOAuthState({
        state: "oauth_test123",
        connectorType: "slack",
        workspaceId: "ws_test" as never,
        redirectUri: "http://localhost/callback",
        expiresAt: "2026-05-14T01:00:00.000Z",
      });

      const retrieved = await repo.getOAuthState("oauth_test123");
      expect(retrieved?.connector_type).toBe("slack");
    });

    it("deletes an OAuth state", async () => {
      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
      await repo.deleteOAuthState("oauth_test123");
      expect(mockPool.sql).toHaveBeenCalled();
    });
  });

  describe("getLatestToken", () => {
    it("returns latest token for account", async () => {
      const mockToken = {
        id: "ctok_1",
        account_id: "cacct_1",
        token_type: "access",
        token_encrypted: "encrypted",
        metadata: {},
        expires_at: null,
        created_at: "2026-05-14T00:00:00.000Z",
      };

      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockToken]);

      const token = await repo.getLatestToken("cacct_1", "access");
      expect(token?.token_encrypted).toBe("encrypted");
    });
  });

  describe("getActiveSyncJobs", () => {
    it("returns only pending/scanning/processing jobs", async () => {
      const mockJobs = [
        { id: "csync_1", status: "processing", account_id: "cacct_1" },
        { id: "csync_2", status: "pending", account_id: "cacct_2" },
      ];

      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockJobs);

      const jobs = await repo.getActiveSyncJobs();
      expect(jobs).toHaveLength(2);
    });
  });

  describe("runMigrations", () => {
    it("executes CREATE TABLE statements", async () => {
      (mockPool.sql as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await repo.runMigrations();

      const calls = (mockPool.sql as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(5);
      expect(calls[0][0]).toBeDefined();
    });
  });
});
