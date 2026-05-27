import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { initApiGateway } from "../src/index.js";
import { createStubProxy } from "./helpers.js";
import type { Express } from "express";
import type { InternalProxy } from "../../src/proxy.js";
import type { AddressInfo } from "node:net";
import { resetHealth } from "@memory-platform/observability";

const TEST_JWT_SECRET = "test-secret-for-route-tests";

function listen(app: Express): Promise<{ url: string; server: http.Server }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${addr.port}`, server });
    });
    server.on("error", reject);
  });
}

async function httpRequest(
  server: http.Server,
  method: string,
  path: string,
  options?: {
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}${path}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options?.headers ?? {}),
  };

  const init: RequestInit = { method, headers };
  if (options?.body && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  return { status: response.status, body: data as Record<string, unknown> };
}

function createTestApp(overrides?: { proxy?: InternalProxy }): Express {
  return initApiGateway({
    auth: { jwtSecret: TEST_JWT_SECRET },
    services: {
      ingestionServiceUrl: "http://localhost:3002",
      retrievalServiceUrl: "http://localhost:3003",
      connectorServiceUrl: "http://localhost:3004",
    },
    rateLimit: { global: { maxRequests: 1000, windowMs: 60_000 }, enabled: false },
    proxy: overrides?.proxy,
  });
}

describe("Health Routes", () => {
  let server: http.Server;

  beforeEach(async () => {
    resetHealth();
    const app = createTestApp();
    const result = await listen(app);
    server = result.server;
  });

  afterEach(() => {
    server.close();
  });

  it("GET /health returns healthy status", async () => {
    const { status, body } = await httpRequest(server, "GET", "/health");

    expect(status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.version).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
  });
});

describe("Documents Routes", () => {
  let server: http.Server;

  afterEach(() => {
    server?.close();
  });

  it("POST /v1/documents validates request body", async () => {
    const stubProxy = createStubProxy({
      ingestion: { status: 201, data: { id: "doc_1" } },
    });
    const app = createTestApp({ proxy: stubProxy });
    const result = await listen(app);
    server = result.server;

    const { status, body } = await httpRequest(server, "POST", "/v1/documents", {
      headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
      body: { title: "" },
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("POST /v1/documents forwards valid payload", async () => {
    const stubProxy = createStubProxy({
      ingestion: {
        status: 201,
        data: { id: "doc_1", title: "Hello World" },
      },
    });
    const app = createTestApp({ proxy: stubProxy });
    const result = await listen(app);
    server = result.server;

    const { status, body } = await httpRequest(server, "POST", "/v1/documents", {
      headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
      body: { title: "Hello World", source: { type: "api" } },
    });

    expect(status).toBe(201);
    expect(body.id).toBe("doc_1");
  });

  it("GET /v1/documents/:id returns document", async () => {
    const stubProxy = createStubProxy({
      ingestion: {
        status: 200,
        data: { id: "doc_1", title: "Existing Doc" },
      },
    });
    const app = createTestApp({ proxy: stubProxy });
    const result = await listen(app);
    server = result.server;

    const { status, body } = await httpRequest(server, "GET", "/v1/documents/doc_1", {
      headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
    });

    expect(status).toBe(200);
    expect(body.id).toBe("doc_1");
  });
});

describe("Search Routes", () => {
  let server: http.Server;

  afterEach(() => {
    server?.close();
  });

  it("POST /v1/search forwards valid query", async () => {
    const stubProxy = createStubProxy({
      retrieval: {
        status: 200,
        data: { query_id: "q1", results: [], total_hits: 0, latency_ms: 5 },
      },
    });
    const app = createTestApp({ proxy: stubProxy });
    const result = await listen(app);
    server = result.server;

    const { status, body } = await httpRequest(server, "POST", "/v1/search", {
      headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
      body: {
        id: "q1",
        query: "find this",
        top_k: 10,
        similarity_threshold: 0.5,
        filters: {},
        hybrid: true,
        created_at: new Date().toISOString(),
      },
    });

    expect(status).toBe(200);
    expect(body.query_id).toBe("q1");
  });

  it("POST /v1/context requires query_id", async () => {
    const stubProxy = createStubProxy({ retrieval: { status: 200, data: {} } });
    const app = createTestApp({ proxy: stubProxy });
    const result = await listen(app);
    server = result.server;

    const { status, body } = await httpRequest(server, "POST", "/v1/context", {
      headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
      body: {},
    });

    expect(status).toBe(400);
    expect(body.code).toBe("MISSING_REQUIRED_FIELD");
  });
});

describe("Connectors Routes", () => {
  it("POST /v1/connectors/:type/sync triggers sync", async () => {
    const stubProxy = createStubProxy({
      connector: {
        status: 202,
        data: { id: "sync_1", status: "pending" },
      },
    });
    const app = createTestApp({ proxy: stubProxy });
    const result = await listen(app);
    const server = result.server;

    const { status, body } = await httpRequest(
      server,
      "POST",
      "/v1/connectors/notion/sync",
      {
        headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
        body: { sync_mode: "full" },
      },
    );

    server.close();
    expect(status).toBe(202);
    expect(body.id).toBe("sync_1");
  });
});

describe("Usage Routes", () => {
  it("GET /v1/usage returns usage stats", async () => {
    const app = createTestApp();
    const result = await listen(app);
    const server = result.server;

    const { status, body } = await httpRequest(server, "GET", "/v1/usage", {
      headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
    });

    server.close();
    expect(status).toBe(200);
    expect(body.workspace_id).toBeDefined();
    expect(body.document_count).toBe(0);
    expect(body.storage_bytes).toBe(0);
  });
});

describe("404 Handler", () => {
  it("returns 404 for unknown routes", async () => {
    const app = createTestApp();
    const result = await listen(app);
    const server = result.server;

    const { status, body } = await httpRequest(server, "GET", "/v1/nonexistent", {
      headers: { "x-api-key": "ak_testworkspace_randomstring1234567890" },
    });

    server.close();
    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });
});

describe("Auth on Routes", () => {
  it("returns 401 without auth header", async () => {
    const app = createTestApp();
    const result = await listen(app);
    const server = result.server;

    const { status, body } = await httpRequest(server, "POST", "/v1/documents", {
      body: { title: "test", source: { type: "api" } },
    });

    server.close();
    expect(status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
  });
});
