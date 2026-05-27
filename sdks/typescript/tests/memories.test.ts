import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoriesClient } from "../src/memories.js";
import { HttpClient } from "../src/client.js";

function createMockHttp(responseData: unknown) {
  return {
    request: vi.fn().mockResolvedValue({ data: responseData, status: 200 }),
  } as unknown as HttpClient;
}

describe("MemoriesClient", () => {
  let http: HttpClient;
  let client: MemoriesClient;

  const sampleEntity = {
    id: "ent-1",
    workspace_id: "ws-1" as never,
    entity_type: "person",
    name: "Alice",
    aliases: [],
    properties: {},
    source_document_ids: ["doc-1"],
    confidence: 0.95,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  beforeEach(() => {
    http = createMockHttp(sampleEntity);
    client = new MemoriesClient(http);
  });

  it("get() should GET /v1/memories/:id", async () => {
    await client.get("ent-1");

    expect(http.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/memories/ent-1",
      workspaceId: undefined,
    });
  });

  it("get() should pass workspaceId", async () => {
    await client.get("ent-1", "ws-2");

    expect(http.request).toHaveBeenCalledWith({
      method: "GET",
      path: "/v1/memories/ent-1",
      workspaceId: "ws-2",
    });
  });

  it("get() should URL-encode the memory ID", async () => {
    await client.get("entity/with spaces");

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/memories/entity%2Fwith%20spaces" }),
    );
  });

  it("get() should return the entity", async () => {
    const result = await client.get("ent-1");
    expect(result.id).toBe("ent-1");
    expect(result.entity_type).toBe("person");
    expect(result.name).toBe("Alice");
  });
});
