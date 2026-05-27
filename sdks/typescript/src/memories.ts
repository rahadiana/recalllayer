import type { Entity } from "./types.js";
import type { HttpClient } from "./client.js";

export class MemoriesClient {
  constructor(private readonly http: HttpClient) {}

  async get(id: string, workspaceId?: string): Promise<Entity> {
    const response = await this.http.request<Entity>({
      method: "GET",
      path: `/v1/memories/${encodeURIComponent(id)}`,
      workspaceId,
    });
    return response.data;
  }
}
