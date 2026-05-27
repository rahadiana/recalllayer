import { describe, it, expect, vi } from "vitest";

// Mocks for all downstream modules
vi.mock("../src/logger.js", () => ({
  createLogger: vi.fn((name: string) => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  })),
}));

vi.mock("../src/tracer.js", () => ({
  initTracing: vi.fn((name: string) => ({
    getTracer: vi.fn(),
    register: vi.fn(),
    shutdown: vi.fn(() => Promise.resolve()),
  })),
  shutdownTracing: vi.fn(() => Promise.resolve()),
}));

vi.mock("../src/metrics.js", () => ({
  initMetrics: vi.fn(() => ({
    createCounter: vi.fn(),
    createHistogram: vi.fn(),
  })),
}));

vi.mock("../src/health.js", () => ({
  healthEndpoint: vi.fn((name: string) => async () => ({
    status: "healthy",
    service: name,
    uptime: 0,
    timestamp: new Date().toISOString(),
    checks: [],
  })),
}));

import { initObservability } from "../src/init.js";
import { createLogger } from "../src/logger.js";
import { initTracing, shutdownTracing } from "../src/tracer.js";
import { initMetrics } from "../src/metrics.js";
import { healthEndpoint } from "../src/health.js";

describe("initObservability", () => {
  it("returns ObservabilityContext with all expected properties", () => {
    const ctx = initObservability("test-service");
    expect(ctx).toBeDefined();
    expect(ctx.logger).toBeDefined();
    expect(ctx.tracerProvider).toBeDefined();
    expect(ctx.meter).toBeDefined();
    expect(typeof ctx.healthReport).toBe("function");
    expect(typeof ctx.shutdown).toBe("function");
  });

  it("calls createLogger with service name", () => {
    initObservability("api-gateway");
    expect(createLogger).toHaveBeenCalledWith("api-gateway", undefined);
  });

  it("calls initTracing with service name", () => {
    initObservability("api-gateway");
    expect(initTracing).toHaveBeenCalledWith("api-gateway", undefined);
  });

  it("calls initMetrics with service name", () => {
    initObservability("api-gateway");
    expect(initMetrics).toHaveBeenCalledWith("api-gateway", undefined);
  });

  it("calls healthEndpoint with service name", () => {
    initObservability("api-gateway");
    expect(healthEndpoint).toHaveBeenCalledWith("api-gateway");
  });

  it("passes through logger options", () => {
    initObservability("svc", { logger: { level: "debug" } });
    expect(createLogger).toHaveBeenCalledWith("svc", { level: "debug" });
  });

  it("passes through tracing options", () => {
    initObservability("svc", { tracing: { noop: true } });
    expect(initTracing).toHaveBeenCalledWith("svc", { noop: true });
  });

  it("passes through metrics options", () => {
    initObservability("svc", { metrics: { noop: true } });
    expect(initMetrics).toHaveBeenCalledWith("svc", { noop: true });
  });

  it("healthReport is callable and returns a report", async () => {
    const ctx = initObservability("svc");
    const report = await ctx.healthReport();
    expect(report.status).toBe("healthy");
    expect(report.service).toBe("svc");
  });

  it("shutdown calls shutdownTracing", async () => {
    const ctx = initObservability("svc");
    await ctx.shutdown();
    expect(shutdownTracing).toHaveBeenCalled();
  });

  it("works with no options", () => {
    const ctx = initObservability("bare");
    expect(ctx.logger).toBeDefined();
  });
});
