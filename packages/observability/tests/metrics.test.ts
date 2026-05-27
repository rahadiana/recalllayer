import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAdd = vi.fn();
const mockRecord = vi.fn();

const mockMeter = {
  createCounter: vi.fn(() => ({ add: mockAdd })),
  createHistogram: vi.fn(() => ({ record: mockRecord })),
};

vi.mock("@opentelemetry/api", () => ({
  metrics: {
    getMeter: vi.fn(() => mockMeter),
  },
  Counter: {},
  Histogram: {},
}));

import {
  initMetrics,
  getMeter,
  createCounter,
  createHistogram,
  recordMetric,
  resetMetrics,
} from "../src/metrics.js";

describe("initMetrics / getMeter", () => {
  beforeEach(() => {
    resetMetrics();
    vi.clearAllMocks();
  });

  it("initMetrics returns a meter", () => {
    const meter = initMetrics("test-svc");
    expect(meter).toBeDefined();
  });

  it("getMeter returns the same meter after init", () => {
    initMetrics("test-svc");
    expect(() => getMeter()).not.toThrow();
  });

  it("getMeter throws if not initialised", () => {
    expect(() => getMeter()).toThrow("Metrics not initialised");
  });

  it("initMetrics is idempotent", () => {
    const a = initMetrics("test-svc");
    const b = initMetrics("test-svc");
    expect(a).toBe(b);
  });

  it("noop option still returns a meter", () => {
    resetMetrics();
    const meter = initMetrics("test-svc", { noop: true });
    expect(meter).toBeDefined();
  });
});

describe("createCounter / createHistogram", () => {
  beforeEach(() => {
    resetMetrics();
    vi.clearAllMocks();
    initMetrics("test-svc");
  });

  it("creates a Counter", () => {
    const counter = createCounter({ name: "requests_total", description: "Total requests" });
    expect(counter).toBeDefined();
    expect(mockMeter.createCounter).toHaveBeenCalledWith("requests_total", {
      description: "Total requests",
    });
  });

  it("creates a Histogram", () => {
    const hist = createHistogram({ name: "latency_ms", unit: "ms" });
    expect(hist).toBeDefined();
    expect(mockMeter.createHistogram).toHaveBeenCalledWith("latency_ms", {
      unit: "ms",
    });
  });
});

describe("recordMetric", () => {
  beforeEach(() => {
    resetMetrics();
    vi.clearAllMocks();
    initMetrics("test-svc");
  });

  it("records a counter metric", () => {
    recordMetric("events_total", 1, { type: "ingestion" });
    expect(mockAdd).toHaveBeenCalledWith(1, { type: "ingestion" });
  });

  it("records a histogram metric", () => {
    recordMetric("request_latency", 42, { method: "POST" }, "histogram");
    expect(mockRecord).toHaveBeenCalledWith(42, { method: "POST" });
  });

  it("defaults to counter kind", () => {
    recordMetric("default_counter", 5);
    expect(mockAdd).toHaveBeenCalledWith(5, undefined);
  });
});

describe("resetMetrics", () => {
  it("clears the meter so getMeter throws again", () => {
    initMetrics("test-svc");
    resetMetrics();
    expect(() => getMeter()).toThrow("Metrics not initialised");
  });
});
