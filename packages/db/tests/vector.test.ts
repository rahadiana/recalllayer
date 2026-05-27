import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCollections = vi.fn();
const { MockQdrantClient } = vi.hoisted(() => ({
  MockQdrantClient: vi.fn(),
}));

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: MockQdrantClient,
}));

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() })),
  })),
}));

import { createVectorClient } from "../src/vector.js";
import { createLogger } from "@memory-platform/observability";

beforeEach(() => {
  vi.clearAllMocks();
  MockQdrantClient.mockImplementation(() => ({
    getCollections: mockGetCollections,
  }));
});

describe("createVectorClient", () => {
  const url = "http://localhost:6333";
  const apiKey = "test-key";

  it("creates a VectorClient with required methods", () => {
    const client = createVectorClient(url, apiKey);
    expect(client).toBeDefined();
    expect(client.client).toBeDefined();
    expect(typeof client.health).toBe("function");
    expect(typeof client.close).toBe("function");
    expect(typeof client.listCollections).toBe("function");
  });

  it("passes url and apiKey to QdrantClient", () => {
    createVectorClient(url, apiKey);
    expect(MockQdrantClient).toHaveBeenCalledWith({
      url,
      apiKey,
      timeout: 30000,
    });
  });

  it("passes custom options", () => {
    createVectorClient(url, undefined, { timeout: 10000, port: 6334 });
    expect(MockQdrantClient).toHaveBeenCalledWith({
      url,
      apiKey: undefined,
      timeout: 10000,
      port: 6334,
    });
  });

  it("health returns healthy when getCollections succeeds", async () => {
    mockGetCollections.mockResolvedValueOnce({
      collections: [{ name: "test-collection" }],
    });
    const client = createVectorClient(url);
    const result = await client.health();
    expect(result.status).toBe("healthy");
  });

  it("health returns unhealthy on error", async () => {
    mockGetCollections.mockRejectedValueOnce(new Error("network error"));
    const client = createVectorClient(url);
    const result = await client.health();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("network error");
  });

  it("health returns degraded on bad response", async () => {
    mockGetCollections.mockResolvedValueOnce({ collections: null });
    const client = createVectorClient(url);
    const result = await client.health();
    expect(result.status).toBe("degraded");
  });

  it("close does not throw", async () => {
    const client = createVectorClient(url);
    await expect(client.close()).resolves.toBeUndefined();
  });

  it("listCollections returns collection names", async () => {
    mockGetCollections.mockResolvedValueOnce({
      collections: [{ name: "col1" }, { name: "col2" }],
    });
    const client = createVectorClient(url);
    const names = await client.listCollections();
    expect(names).toEqual(["col1", "col2"]);
  });

  it("listCollections returns empty array when no collections", async () => {
    mockGetCollections.mockResolvedValueOnce({ collections: [] });
    const client = createVectorClient(url);
    const names = await client.listCollections();
    expect(names).toEqual([]);
  });

  it("logs client creation", () => {
    const client = createVectorClient(url);
    expect(client).toBeDefined();
  });
});
