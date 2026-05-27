import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Express } from "express";
import supertest from "supertest";
import { ConnectorRepository } from "../src/repository.js";
import { ConnectorRegistry } from "../src/connector-registry.js";
import { OAuthManager } from "../src/oauth-manager.js";
import { SyncWorker } from "../src/worker.js";
import { SyncScheduler } from "../src/sync-scheduler.js";
import { createConnectorRoutes } from "../src/routes/connectors.js";
import type { EventPublisher } from "../src/events.js";
import type { ConnectorPlugin, SyncJobRecord } from "../src/types.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

function makeMockRepo(): ConnectorRepository {
  return {
    getAccount: vi.fn(),
    getAccountByTypeAndWorkspace: vi.fn(),
    createAccount: vi.fn(),
    getSyncState: vi.fn(),
    getLatestSyncJob: vi.fn(),
    getActiveSyncJobs: vi.fn(),
    createSyncJob: vi.fn(),
    listAccountsByWorkspace: vi.fn(),
    storeOAuthState: vi.fn(),
    getOAuthState: vi.fn(),
    deleteOAuthState: vi.fn(),
    storeToken: vi.fn(),
    getLatestToken: vi.fn(),
    updateSyncJobStatus: vi.fn(),
    updateAccountLastSync: vi.fn(),
  } as unknown as ConnectorRepository;
}

function makeMockRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  const mockPlugin: ConnectorPlugin = {
    type: "google-drive",
    displayName: "Google Drive",
    getAuthorizationUrl: vi.fn().mockReturnValue("https://auth.example.com"),
    exchangeCodeForTokens: vi.fn().mockResolvedValue({ access_token: "test-token" }),
    refreshAccessToken: vi.fn(),
    validateCredentials: vi.fn().mockResolvedValue(true),
    sync: vi.fn(),
  };
  registry.register(mockPlugin);
  return registry;
}

function makeMockOAuth(): OAuthManager {
  return {
    handleCallback: vi.fn().mockResolvedValue({
      workspaceId: "ws_test",
      connectorType: "google-drive",
      tokenResult: { access_token: "test-token" },
    }),
    storeTokens: vi.fn(),
    getValidAccessToken: vi.fn(),
  } as unknown as OAuthManager;
}

function makeMockEvents(): EventPublisher {
  return {
    publishSyncRequested: vi.fn().mockResolvedValue("evt_test"),
    publishSyncStarted: vi.fn(),
    publishSyncCompleted: vi.fn(),
    publishSyncFailed: vi.fn(),
    publishDocumentDiscovered: vi.fn(),
    publishDocumentUpdated: vi.fn(),
    publishDocumentDeleted: vi.fn(),
    events: { on: vi.fn() } as never,
    close: vi.fn(),
  } as unknown as EventPublisher;
}

function makeMockWorker(): SyncWorker {
  return {
    executeSyncJob: vi.fn().mockResolvedValue({} as SyncJobRecord),
  } as unknown as SyncWorker;
}

function makeMockScheduler(): SyncScheduler {
  return {
    addActiveJob: vi.fn(),
    removeActiveJob: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(),
    activeJobCount: 0,
  } as unknown as SyncScheduler;
}

describe("Connector Routes", () => {
  let app: Express;
  let mockRepo: ReturnType<typeof makeMockRepo>;
  let mockRegistry: ConnectorRegistry;
  let mockOAuth: ReturnType<typeof makeMockOAuth>;
  let mockEvents: ReturnType<typeof makeMockEvents>;
  let mockWorker: ReturnType<typeof makeMockWorker>;
  let mockScheduler: ReturnType<typeof makeMockScheduler>;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    mockRegistry = makeMockRegistry();
    mockOAuth = makeMockOAuth();
    mockEvents = makeMockEvents();
    mockWorker = makeMockWorker();
    mockScheduler = makeMockScheduler();

    app = express();
    app.use(express.json());

    const routes = createConnectorRoutes(
      mockRepo,
      mockRegistry,
      mockOAuth,
      mockEvents,
      mockWorker,
      mockScheduler,
      "http://localhost:3003",
    );
    app.use(routes);
  });

  describe("POST /internal/connectors/oauth/callback", () => {
    it("returns 400 when missing code parameter", async () => {
      const res = await supertest(app)
        .post("/internal/connectors/oauth/callback")
        .query({ state: "test-state" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 when missing state parameter", async () => {
      const res = await supertest(app)
        .post("/internal/connectors/oauth/callback")
        .query({ code: "test-code" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("INVALID_REQUEST");
    });

    it("processes a valid OAuth callback", async () => {
      (mockRepo.getOAuthState as ReturnType<typeof vi.fn>).mockResolvedValue({
        connector_type: "google-drive",
        workspace_id: "ws_test",
        state: "test-state",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        created_at: new Date().toISOString(),
      });
      (mockRepo.getAccountByTypeAndWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockRepo.createAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "cacct_new",
        workspace_id: "ws_test",
        connector_type: "google-drive",
        label: "Google Drive Account",
        credential_ref: "cred-ref",
        config: { settings: {} },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const res = await supertest(app)
        .post("/internal/connectors/oauth/callback")
        .query({ code: "auth-code", state: "test-state" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.account_id).toBeDefined();
    });

    it("returns 500 when handleCallback throws", async () => {
      (mockRepo.getOAuthState as ReturnType<typeof vi.fn>).mockResolvedValue({
        connector_type: "google-drive",
        workspace_id: "ws_test",
        state: "bad-state",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        created_at: new Date().toISOString(),
      });
      (mockOAuth.handleCallback as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("OAuth error"));

      const res = await supertest(app)
        .post("/internal/connectors/oauth/callback")
        .query({ code: "auth-code", state: "bad-state" });

      expect(res.status).toBe(500);
      expect(res.body.code).toBe("OAUTH_CALLBACK_FAILED");
    });
  });

  describe("POST /internal/connectors/:type/sync", () => {
    it("returns 404 for unknown connector type", async () => {
      const res = await supertest(app)
        .post("/internal/connectors/unknown-type/sync")
        .send({ account_id: "acct_1" });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("UNKNOWN_CONNECTOR");
    });

    it("returns 400 when account_id is missing", async () => {
      const res = await supertest(app)
        .post("/internal/connectors/google-drive/sync")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ACCOUNT_REQUIRED");
    });

    it("returns 404 when account not found", async () => {
      (mockRepo.getAccount as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await supertest(app)
        .post("/internal/connectors/google-drive/sync")
        .send({ account_id: "nonexistent" });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("triggers a sync job successfully", async () => {
      (mockRepo.getAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "acct_1",
        workspace_id: "ws_test",
        connector_type: "google-drive",
        label: "My Drive",
        config: { settings: {} },
        is_active: true,
      });
      (mockRepo.getSyncState as ReturnType<typeof vi.fn>).mockResolvedValue({
        cursor: "prev-cursor",
        resource_checksums: {},
        sync_count: 1,
      });
      (mockRepo.createSyncJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "csync_new",
        account_id: "acct_1",
        workspace_id: "ws_test",
        connector_type: "google-drive",
        status: "pending",
        sync_mode: "incremental",
        cursor_before: "prev-cursor",
        discovered_count: 0,
        processed_count: 0,
        skipped_count: 0,
        error_count: 0,
        progress: {},
        created_at: new Date().toISOString(),
      });

      const res = await supertest(app)
        .post("/internal/connectors/google-drive/sync")
        .send({ account_id: "acct_1", sync_mode: "full" });

      expect(res.status).toBe(202);
      expect(res.body.job_id).toBe("csync_new");
      expect(res.body.sync_mode).toBe("full");
      expect(mockEvents.publishSyncRequested).toHaveBeenCalled();
    });
  });

  describe("GET /internal/connectors/:type/status", () => {
    it("returns 404 for unknown connector type", async () => {
      const res = await supertest(app)
        .get("/internal/connectors/unknown-type/status")
        .query({ account_id: "acct_1" });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("UNKNOWN_CONNECTOR");
    });

    it("returns 400 when account_id is missing", async () => {
      const res = await supertest(app)
        .get("/internal/connectors/google-drive/status");

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("ACCOUNT_REQUIRED");
    });

    it("returns 404 when account not found", async () => {
      (mockRepo.getAccount as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await supertest(app)
        .get("/internal/connectors/google-drive/status")
        .query({ account_id: "nonexistent" });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("returns status with sync information", async () => {
      (mockRepo.getAccount as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "acct_1",
        workspace_id: "ws_test",
        connector_type: "google-drive",
        label: "My Drive",
        config: { settings: {} },
        is_active: true,
        last_synced_at: null,
      });
      (mockRepo.getSyncState as ReturnType<typeof vi.fn>).mockResolvedValue({
        cursor: "next-token",
        last_synced_at: "2026-05-14T00:00:00.000Z",
        resource_checksums: { "file_1": "abc" },
        sync_count: 5,
      });
      (mockRepo.getLatestSyncJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "csync_last",
        status: "completed",
        started_at: "2026-05-14T00:00:00.000Z",
        completed_at: "2026-05-14T00:05:00.000Z",
        discovered_count: 10,
        processed_count: 8,
      });
      (mockRepo.getActiveSyncJobs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const res = await supertest(app)
        .get("/internal/connectors/google-drive/status")
        .query({ account_id: "acct_1" });

      expect(res.status).toBe(200);
      expect(res.body.connector_type).toBe("google-drive");
      expect(res.body.account_label).toBe("My Drive");
      expect(res.body.is_active).toBe(true);
      expect(res.body.last_sync).toBeDefined();
      expect(res.body.last_sync.status).toBe("completed");
      expect(res.body.sync_state.sync_count).toBe(5);
    });
  });
});
