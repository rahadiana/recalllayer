import { describe, it, expect, vi, beforeEach } from "vitest";

const mockS3Send = vi.fn();
const mockS3Destroy = vi.fn();
const { MockS3Client, MockListBucketsCommand } = vi.hoisted(() => ({
  MockS3Client: vi.fn(),
  MockListBucketsCommand: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: MockS3Client,
  ListBucketsCommand: MockListBucketsCommand,
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

import { createStorageClient } from "../src/storage.js";
import { createLogger } from "@memory-platform/observability";

beforeEach(() => {
  vi.clearAllMocks();
  MockS3Client.mockImplementation(() => ({
    send: mockS3Send,
    destroy: mockS3Destroy,
  }));
});

describe("createStorageClient", () => {
  const endpoint = "http://localhost:9000";
  const region = "us-east-1";
  const credentials = { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" };

  it("creates a StorageClient with required methods", () => {
    const client = createStorageClient(endpoint, region, credentials);
    expect(client).toBeDefined();
    expect(client.client).toBeDefined();
    expect(typeof client.health).toBe("function");
    expect(typeof client.close).toBe("function");
    expect(typeof client.listBuckets).toBe("function");
  });

  it("passes config to S3Client", () => {
    createStorageClient(endpoint, region, credentials);
    expect(MockS3Client).toHaveBeenCalledWith({
      endpoint,
      region,
      credentials,
      forcePathStyle: true,
    });
  });

  it("uses env vars when credentials are absent", () => {
    process.env.S3_ACCESS_KEY_ID = "env-key";
    process.env.S3_SECRET_ACCESS_KEY = "env-secret";
    createStorageClient(endpoint, region);
    expect(MockS3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { accessKeyId: "env-key", secretAccessKey: "env-secret" },
      }),
    );
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
  });

  it("passes custom forcePathStyle option", () => {
    createStorageClient(endpoint, region, credentials, { forcePathStyle: false });
    expect(MockS3Client).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: false }),
    );
  });

  it("health returns healthy when listBuckets succeeds", async () => {
    mockS3Send.mockResolvedValueOnce({ Buckets: [{ Name: "my-bucket" }] });
    const client = createStorageClient(endpoint, region, credentials);
    const result = await client.health();
    expect(result.status).toBe("healthy");
  });

  it("health returns unhealthy on error", async () => {
    mockS3Send.mockRejectedValueOnce(new Error("network error"));
    const client = createStorageClient(endpoint, region, credentials);
    const result = await client.health();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("network error");
  });

  it("health returns degraded on bad response", async () => {
    mockS3Send.mockResolvedValueOnce({ Buckets: undefined });
    const client = createStorageClient(endpoint, region, credentials);
    const result = await client.health();
    expect(result.status).toBe("degraded");
  });

  it("close calls client.destroy", () => {
    const client = createStorageClient(endpoint, region, credentials);
    client.close();
    expect(mockS3Destroy).toHaveBeenCalled();
  });

  it("listBuckets returns bucket names", async () => {
    mockS3Send.mockResolvedValueOnce({
      Buckets: [{ Name: "bucket-a" }, { Name: "bucket-b" }],
    });
    const client = createStorageClient(endpoint, region, credentials);
    const names = await client.listBuckets();
    expect(names).toEqual(["bucket-a", "bucket-b"]);
  });

  it("listBuckets filters out undefined names", async () => {
    mockS3Send.mockResolvedValueOnce({
      Buckets: [{ Name: "valid" }, { Name: undefined }],
    });
    const client = createStorageClient(endpoint, region, credentials);
    const names = await client.listBuckets();
    expect(names).toEqual(["valid"]);
  });

  it("listBuckets returns empty array when no buckets", async () => {
    mockS3Send.mockResolvedValueOnce({ Buckets: [] });
    const client = createStorageClient(endpoint, region, credentials);
    const names = await client.listBuckets();
    expect(names).toEqual([]);
  });

  it("logs client creation", () => {
    const client = createStorageClient(endpoint, region, credentials);
    expect(client).toBeDefined();
  });
});
