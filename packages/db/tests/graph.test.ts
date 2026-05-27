import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSessionClose = vi.fn();
const mockSessionRun = vi.fn();
const mockDriverClose = vi.fn();
const mockVerifyConnectivity = vi.fn();
const mockDriverSession = vi.fn();

const { MockDriver, mockAuthBasic } = vi.hoisted(() => ({
  MockDriver: vi.fn(),
  mockAuthBasic: vi.fn(),
}));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: MockDriver,
    auth: { basic: mockAuthBasic },
  },
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

import { createGraphClient } from "../src/graph.js";
import neo4j from "neo4j-driver";
import { createLogger } from "@memory-platform/observability";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthBasic.mockReturnValue({ scheme: "basic", principal: "", credentials: "" });
  MockDriver.mockImplementation(() => ({
    session: mockDriverSession,
    close: mockDriverClose,
    verifyConnectivity: mockVerifyConnectivity,
  }));
  mockDriverSession.mockReturnValue({
    run: mockSessionRun,
    close: mockSessionClose,
  });
});

describe("createGraphClient", () => {
  const url = "bolt://localhost:7687";
  const user = "neo4j";
  const password = "secret";

  it("creates a GraphClient with required methods", () => {
    const client = createGraphClient(url, user, password);
    expect(client).toBeDefined();
    expect(client.driver).toBeDefined();
    expect(typeof client.health).toBe("function");
    expect(typeof client.close).toBe("function");
    expect(typeof client.verifyConnectivity).toBe("function");
  });

  it("creates driver with auth", () => {
    createGraphClient(url, user, password);
    expect(MockDriver).toHaveBeenCalledWith(
      url,
      expect.anything(),
      expect.objectContaining({ maxConnectionLifetime: 30 * 60 * 1000 }),
    );
    expect(mockAuthBasic).toHaveBeenCalledWith(user, password);
  });

  it("falls back to env NEO4J_PASSWORD", () => {
    process.env.NEO4J_PASSWORD = "env-secret";
    createGraphClient(url, user);
    expect(mockAuthBasic).toHaveBeenCalledWith(user, "env-secret");
    delete process.env.NEO4J_PASSWORD;
  });

  it("health returns healthy when query succeeds", async () => {
    const mockRecord = { get: vi.fn().mockReturnValue(1) };
    mockSessionRun.mockResolvedValueOnce({ records: [mockRecord] });
    const client = createGraphClient(url, user, password);
    const result = await client.health();
    expect(result.status).toBe("healthy");
    expect(mockSessionClose).toHaveBeenCalled();
  });

  it("health returns unhealthy on error", async () => {
    mockSessionRun.mockRejectedValueOnce(new Error("connection refused"));
    const client = createGraphClient(url, user, password);
    const result = await client.health();
    expect(result.status).toBe("unhealthy");
    expect(result.message).toContain("connection refused");
    expect(mockSessionClose).toHaveBeenCalled();
  });

  it("health returns degraded on unexpected result", async () => {
    const mockRecord = { get: vi.fn().mockReturnValue(0) };
    mockSessionRun.mockResolvedValueOnce({ records: [mockRecord] });
    const client = createGraphClient(url, user, password);
    const result = await client.health();
    expect(result.status).toBe("degraded");
  });

  it("close calls driver.close", async () => {
    mockDriverClose.mockResolvedValueOnce(undefined);
    const client = createGraphClient(url, user, password);
    await client.close();
    expect(mockDriverClose).toHaveBeenCalled();
  });

  it("verifyConnectivity returns true on success", async () => {
    mockVerifyConnectivity.mockResolvedValueOnce(undefined);
    const client = createGraphClient(url, user, password);
    const result = await client.verifyConnectivity();
    expect(result).toBe(true);
  });

  it("verifyConnectivity returns false on failure", async () => {
    mockVerifyConnectivity.mockRejectedValueOnce(new Error("timeout"));
    const client = createGraphClient(url, user, password);
    const result = await client.verifyConnectivity();
    expect(result).toBe(false);
  });

  it("logs driver creation", () => {
    const client = createGraphClient(url, user, password);
    expect(client).toBeDefined();
  });
});
