import { describe, it, expect } from "vitest";
import { MemoryClient } from "../src/index.js";
import { DocumentsClient } from "../src/documents.js";
import { SearchClient } from "../src/search.js";
import { MemoriesClient } from "../src/memories.js";
import { ConnectorsClient } from "../src/connectors.js";

describe("MemoryClient", () => {
  it("should create client with required apiKey", () => {
    const client = new MemoryClient({ apiKey: "test-key" });
    expect(client).toBeInstanceOf(MemoryClient);
  });

  it("should expose all sub-clients", () => {
    const client = new MemoryClient({ apiKey: "test-key" });

    expect(client.documents).toBeInstanceOf(DocumentsClient);
    expect(client.search).toBeInstanceOf(SearchClient);
    expect(client.memories).toBeInstanceOf(MemoriesClient);
    expect(client.connectors).toBeInstanceOf(ConnectorsClient);
  });

  it("should accept optional configuration", () => {
    const client = new MemoryClient({
      apiKey: "test-key",
      baseUrl: "https://api.example.com",
      workspaceId: "ws-1",
      timeoutMs: 30_000,
      maxRetries: 5,
    });

    expect(client).toBeInstanceOf(MemoryClient);
    expect(client.documents).toBeDefined();
    expect(client.search).toBeDefined();
  });

  it("should allow independent sub-client method calls", async () => {
    const client = new MemoryClient({ apiKey: "test-key" });
    expect(typeof client.documents.add).toBe("function");
    expect(typeof client.documents.get).toBe("function");
    expect(typeof client.documents.list).toBe("function");
    expect(typeof client.search.query).toBe("function");
    expect(typeof client.search.context).toBe("function");
    expect(typeof client.memories.get).toBe("function");
    expect(typeof client.connectors.sync).toBe("function");
    expect(typeof client.connectors.status).toBe("function");
  });
});
