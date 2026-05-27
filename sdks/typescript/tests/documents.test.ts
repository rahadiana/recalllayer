import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentsClient } from "../src/documents.js";
import { HttpClient } from "../src/client.js";

function createMockHttp(responseData: unknown, status = 200) {
  return {
    request: vi.fn().mockResolvedValue({ data: responseData, status }),
  } as unknown as HttpClient;
}

describe("DocumentsClient", () => {
  let http: HttpClient;
  let client: DocumentsClient;

  const sampleDocument = {
    id: "doc-1" as never,
    workspace_id: "ws-1" as never,
    title: "Test Document",
    status: "ready" as const,
    source: { type: "api" as const },
    metadata: {} as Record<string, unknown>,
    tags: [],
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    http = createMockHttp(sampleDocument);
    client = new DocumentsClient(http);
  });

  it("add() should POST to /v1/documents with payload", async () => {
    const payload = {
      title: "New Doc",
      source: { type: "api" as const },
      tags: ["test"],
      workspaceId: "ws-2",
    };

    await client.add(payload);

    expect(http.request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/documents",
      body: {
        title: "New Doc",
        source: { type: "api" },
        tags: ["test"],
      },
      workspaceId: "ws-2",
    });
  });

  it("add() should return the created document", async () => {
    const result = await client.add({
      title: "New Doc",
      source: { type: "api" },
    });

    expect(result).toEqual(sampleDocument);
  });

  it("get() should GET /v1/documents/:id", async () => {
    await client.get("doc-1");
    expect(http.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/documents/doc-1",
      workspaceId: undefined,
    });
  });

  it("get() should pass workspaceId", async () => {
    await client.get("doc-1", "ws-3");
    expect(http.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/documents/doc-1",
      workspaceId: "ws-3",
    });
  });

  it("get() should URL-encode the document ID", async () => {
    await client.get("doc/with slashes");
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/documents/doc%2Fwith%20slashes" }),
    );
  });

  it("list() should GET /v1/documents with query params", async () => {
    const paginatedResponse = {
      items: [sampleDocument],
      next_cursor: "cursor-1",
      total: 1,
    };

    const mockHttp = createMockHttp(paginatedResponse);
    const docsClient = new DocumentsClient(mockHttp);

    await docsClient.list({ limit: 10, status: "ready", tags: ["tag-a"] });

    expect(mockHttp.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/documents",
      queryParams: expect.objectContaining({
        limit: 10,
        status: "ready",
        tags: "tag-a",
      }),
      workspaceId: undefined,
    });
  });

  it("list() should return paginated response", async () => {
    const paginatedResponse = {
      items: [sampleDocument],
      next_cursor: null,
    };
    const mockHttp = createMockHttp(paginatedResponse);
    const docsClient = new DocumentsClient(mockHttp);

    const result = await docsClient.list();
    expect(result.items).toHaveLength(1);
    expect(result.next_cursor).toBeNull();
  });

  it("list() should omit undefined params", async () => {
    await client.list({ limit: 50 });
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        queryParams: { limit: 50 },
      }),
    );
  });
});
