import type { Document, CreateDocumentDto, PaginatedResponse } from "./types.js";
import type { DocumentListParams } from "./types.js";
import type { HttpClient } from "./client.js";

export class DocumentsClient {
  constructor(private readonly http: HttpClient) {}

  async add(payload: CreateDocumentDto & { workspaceId?: string }): Promise<Document> {
    const { workspaceId, ...body } = payload;
    const response = await this.http.request<Document>({
      method: "POST",
      path: "/v1/documents",
      body,
      workspaceId,
    });
    return response.data;
  }

  async get(id: string, workspaceId?: string): Promise<Document> {
    const response = await this.http.request<Document>({
      method: "GET",
      path: `/v1/documents/${encodeURIComponent(id)}`,
      workspaceId,
    });
    return response.data;
  }

  async list(params: DocumentListParams = {}): Promise<PaginatedResponse<Document>> {
    const { workspaceId, ...queryParams } = params;
    const response = await this.http.request<PaginatedResponse<Document>>({
      method: "GET",
      path: "/v1/documents",
      queryParams: this.cleanParams(queryParams),
      workspaceId,
    });
    return response.data;
  }

  private cleanParams(
    params: Record<string, unknown>,
  ): Record<string, string | number | boolean> {
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        cleaned[key] = value.join(",");
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
}
