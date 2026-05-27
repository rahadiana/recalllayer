import type { SearchResponse, ContextWindow } from "./types.js";
import type { SearchQueryParams, ContextBuildParams } from "./types.js";
import type { HttpClient } from "./client.js";

export class SearchClient {
  constructor(private readonly http: HttpClient) {}

  async query(params: SearchQueryParams): Promise<SearchResponse> {
    const { workspaceId, ...body } = params;
    const response = await this.http.request<SearchResponse>({
      method: "POST",
      path: "/v1/search",
      body: {
        query: body.query,
        top_k: body.topK ?? 10,
        similarity_threshold: body.similarityThreshold ?? 0.5,
        filters: body.filters ?? {},
        hybrid: body.hybrid ?? true,
      },
      workspaceId,
    });
    return response.data;
  }

  async context(params: ContextBuildParams): Promise<ContextWindow> {
    const { workspaceId, ...body } = params;
    const response = await this.http.request<ContextWindow>({
      method: "POST",
      path: "/v1/context",
      body: {
        query_id: body.queryId,
        max_tokens: body.maxTokens,
      },
      workspaceId,
    });
    return response.data;
  }
}
