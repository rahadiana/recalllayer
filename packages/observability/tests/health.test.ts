import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCheck,
  healthEndpoint,
  healthCheck,
  resetHealth,
} from "../src/health.js";
import type { HealthReport } from "../src/health.js";

describe("health endpoint", () => {
  beforeEach(() => {
    resetHealth();
  });

  it("returns healthy with empty checks", async () => {
    const report = await healthCheck("test-svc");
    expect(report.status).toBe("healthy");
    expect(report.service).toBe("test-svc");
    expect(report.checks).toEqual([]);
    expect(report.uptime).toBeGreaterThanOrEqual(0);
    expect(report.timestamp).toBeTruthy();
  });

  it("reports healthy when all checks pass", async () => {
    registerCheck("db", async () => ({ status: "healthy", message: "ok" }));
    registerCheck("redis", async () => ({ status: "healthy" }));

    const report = await healthCheck("api");
    expect(report.status).toBe("healthy");
    expect(report.checks).toHaveLength(2);
    expect(report.checks[0].name).toBe("db");
    expect(report.checks[0].status).toBe("healthy");
    expect(report.checks[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports degraded when any check is degraded", async () => {
    registerCheck("db", async () => ({ status: "healthy" }));
    registerCheck("redis", async () => ({
      status: "degraded",
      message: "slow response",
    }));

    const report = await healthCheck("api");
    expect(report.status).toBe("degraded");
  });

  it("reports unhealthy when any check fails", async () => {
    registerCheck("db", async () => ({ status: "healthy" }));
    registerCheck("redis", async () => ({
      status: "unhealthy",
      message: "connection refused",
    }));

    const report = await healthCheck("api");
    expect(report.status).toBe("unhealthy");
  });

  it("catches thrown errors and marks check as unhealthy", async () => {
    registerCheck("failing", async () => {
      throw new Error("boom");
    });

    const report = await healthCheck("api");
    expect(report.status).toBe("unhealthy");
    expect(report.checks[0].status).toBe("unhealthy");
    expect(report.checks[0].error).toBe("boom");
  });

  it("healthEndpoint returns a reusable function", async () => {
    registerCheck("ping", async () => ({ status: "healthy" }));

    const handler = healthEndpoint("my-service");
    expect(typeof handler).toBe("function");

    const r1 = await handler();
    const r2 = await handler();

    expect(r1.status).toBe("healthy");
    expect(r2.status).toBe("healthy");
    expect(r2.uptime).toBeGreaterThanOrEqual(r1.uptime);
  });

  it("uptime increases between calls", async () => {
    const handler = healthEndpoint("svc");
    const r1 = await handler();

    // small delay to ensure uptime ticks
    await new Promise((r) => setTimeout(r, 50));

    const r2 = await handler();
    expect(r2.uptime).toBeGreaterThanOrEqual(r1.uptime);
  });

  it("resetHealth clears state", async () => {
    registerCheck("x", async () => ({ status: "unhealthy" }));
    await healthCheck("svc");

    resetHealth();
    const report = await healthCheck("svc");
    expect(report.checks).toHaveLength(0);
    expect(report.status).toBe("healthy");
  });
});

describe("HealthReport shape", () => {
  it("conforms to expected interface", async () => {
    const report: HealthReport = await healthCheck("test");
    expect(report).toHaveProperty("status");
    expect(report).toHaveProperty("service");
    expect(report).toHaveProperty("uptime");
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("checks");
    expect(Array.isArray(report.checks)).toBe(true);
  });
});
