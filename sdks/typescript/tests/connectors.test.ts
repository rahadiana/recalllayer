import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectorsClient } from "../src/connectors.js";
import { HttpClient } from "../src/client.js";

function createMockHttp(responseData: unknown) {
  return {
    request: vi.fn().mockResolvedValue({ data: responseData, status: 200 }),
  } as unknown as HttpClient;
}

describe("ConnectorsClient", () => {
  let http: HttpClient;
  let client: ConnectorsClient;

  const sampleSyncJob = {
    id: "sync-1",
    account_id: "acct-1",
    workspace_id: "ws-1" as never,
    status: "completed" as const,
    sync_mode: "incremental" as const,
    discovered_count: 10,
    processed_count: 8,
    skipped_count: 2,
    error_count: 0,
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:01:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    http = createMockHttp(sampleSyncJob);
    client = new ConnectorsClient(http);
  });

  it("sync() should POST to /v1/connectors/:type/sync with defaults", async () => {
    await client.sync("google-drive");

    expect(http.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/connectors/google-drive/sync",
      body: { sync_mode: "incremental" },
      workspaceId: undefined,
    });
  });

  it("sync() should pass syncMode and workspaceId", async () => {
    await client.sync("notion", { syncMode: "full", workspaceId: "ws-2" });

    expect(http.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/connectors/notion/sync",
      body: { sync_mode: "full" },
      workspaceId: "ws-2",
    });
  });

  it("sync() should URL-encode the connector type", async () => {
    await client.sync("google drive");

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/connectors/google%20drive/sync" }),
    );
  });

  it("sync() should return sync job", async () => {
    const result = await client.sync("google-drive");
    expect(result.id).toBe("sync-1");
    expect(result.status).toBe("completed");
  });

  it("status() should GET /v1/connectors/:type/status", async () => {
    const statusResponse = { status: "completed" as const, lastSyncedAt: "2026-01-01T00:01:00.000Z" };
    const mockHttp = createMockHttp(statusResponse);
    const connClient = new ConnectorsClient(mockHttp);

    await connClient.status("google-drive");

    expect(mockHttp.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/connectors/google-drive/status",
      workspaceId: undefined,
    });
  });

  it("status() should pass workspaceId", async () => {
    const statusResponse = { status: "pending" as const };
    const mockHttp = createMockHttp(statusResponse);
    const connClient = new ConnectorsClient(mockHttp);

    await connClient.status("slack", "ws-3");

    expect(mockHttp.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/connectors/slack/status",
      workspaceId: "ws-3",
    });
  });

  it("status() should return status and lastSyncedAt", async () => {
    const statusResponse = {
      status: "failed" as const,
      lastSyncedAt: "2026-01-01T00:01:00.000Z",
    };
    const mockHttp = createMockHttp(statusResponse);
    const connClient = new ConnectorsClient(mockHttp);

    const result = await connClient.status("github");
    expect(result.status).toBe("failed");
    expect(result.lastSyncedAt).toBe("2026-01-01T00:01:00.000Z");
  });
});
