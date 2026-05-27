import type { SyncJob, SyncJobStatus } from "./types.js";
import type { ConnectorSyncParams } from "./types.js";
import type { HttpClient } from "./client.js";

export class ConnectorsClient {
  constructor(private readonly http: HttpClient) {}

  async sync(type: string, params: ConnectorSyncParams = {}): Promise<SyncJob> {
    const { workspaceId, ...body } = params;
    const response = await this.http.request<SyncJob>({
      method: "POST",
      path: `/v1/connectors/${encodeURIComponent(type)}/sync`,
      body: {
        sync_mode: body.syncMode ?? "incremental",
      },
      workspaceId,
    });
    return response.data;
  }

  async status(type: string, workspaceId?: string): Promise<{ status: SyncJobStatus; lastSyncedAt?: string }> {
    const response = await this.http.request<{ status: SyncJobStatus; lastSyncedAt?: string }>({
      method: "GET",
      path: `/v1/connectors/${encodeURIComponent(type)}/status`,
      workspaceId,
    });
    return response.data;
  }
}
