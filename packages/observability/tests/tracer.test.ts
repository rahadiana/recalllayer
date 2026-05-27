import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetTracer, mockStartActiveSpan, mockSetStatus, mockRecordException, mockEnd, mockSetAttribute, mockTracer } = vi.hoisted(() => {
  const ma = vi.fn();
  const ms = vi.fn();
  const mr = vi.fn();
  const me = vi.fn();
  const msa = vi.fn();
  const mt = { startActiveSpan: ma };
  return {
    mockStartActiveSpan: ma,
    mockSetStatus: ms,
    mockRecordException: mr,
    mockEnd: me,
    mockSetAttribute: msa,
    mockTracer: mt,
    mockGetTracer: vi.fn(() => mt),
  };
});

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: mockGetTracer,
    getActiveSpan: vi.fn(() => undefined),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  context: {},
  propagation: {},
  metrics: {
    getMeter: vi.fn(() => ({
      createCounter: vi.fn(() => ({ add: vi.fn() })),
      createHistogram: vi.fn(() => ({ record: vi.fn() })),
    })),
  },
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
  BasicTracerProvider: vi.fn(function (this: Record<string, unknown>) {
    this.getTracer = vi.fn(() => mockTracer);
    this.register = vi.fn();
    this.shutdown = vi.fn(() => Promise.resolve());
  }),
  SimpleSpanProcessor: vi.fn(),
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/resources", () => ({
  Resource: vi.fn(),
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  SEMRESATTRS_SERVICE_NAME: "service.name",
}));

import {
  initTracing,
  getTracer,
  traceAsync,
  shutdownTracing,
} from "../src/tracer.js";

describe("initTracing", () => {
  it("initialises without throwing", () => {
    expect(() => initTracing("test-svc", { noop: true })).not.toThrow();
  });

  it("is idempotent — second call returns same provider", () => {
    const a = initTracing("test-svc", { noop: true });
    const b = initTracing("test-svc", { noop: true });
    expect(a).toBe(b);
  });
});

describe("getTracer", () => {
  beforeEach(() => {
    // reset tracerProvider by shutting down, then re-init
  });

  it("returns a tracer when initialised", async () => {
    await shutdownTracing();
    initTracing("test-svc", { noop: true });
    const t = getTracer("my-scope");
    expect(t).toBeDefined();
  });
});

describe("traceAsync", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await shutdownTracing();
    initTracing("test-svc", { noop: true });
  });

  it("wraps a function in a span and returns its result", async () => {
    mockStartActiveSpan.mockImplementation((_name: any, _opts: any, fn: any) => {
      const span = {
        setStatus: mockSetStatus,
        recordException: mockRecordException,
        end: mockEnd,
        setAttribute: mockSetAttribute,
      };
      return fn(span);
    });

    const result = await traceAsync("my-op", { key: "val" }, async () => {
      return 42;
    });

    expect(result).toBe(42);
    expect(mockStartActiveSpan).toHaveBeenCalledWith(
      "my-op",
      { attributes: { key: "val" } },
      expect.any(Function),
    );
  });

  it("records exception and re-throws on error", async () => {
    mockStartActiveSpan.mockImplementation((_name: any, _opts: any, fn: any) => {
      const span = {
        setStatus: mockSetStatus,
        recordException: mockRecordException,
        end: mockEnd,
        setAttribute: mockSetAttribute,
      };
      return fn(span);
    });

    await expect(
      traceAsync("fail-op", undefined, async () => {
        throw new Error("test error");
      }),
    ).rejects.toThrow("test error");

    expect(mockSetStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: 2 }),
    );
    expect(mockRecordException).toHaveBeenCalled();
  });
});

describe("shutdownTracing", () => {
  it("resolves without error", async () => {
    await expect(shutdownTracing()).resolves.toBeUndefined();
  });
});
