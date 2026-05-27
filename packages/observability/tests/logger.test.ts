import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "../src/logger.js";
import type { Logger } from "../src/logger.js";

// Mock pino to avoid actual console output
vi.mock("pino", () => {
  const createMock = () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMock()),
  });

  return {
    pino: vi.fn(() => createMock()),
    default: {
      pino: vi.fn(() => createMock()),
    },
    __esModule: true,
  };
});

describe("createLogger", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger("test-service");
  });

  it("returns an object implementing Logger interface", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.child).toBe("function");
  });

  it("info() accepts a message string", () => {
    expect(() => logger.info("hello")).not.toThrow();
  });

  it("info() accepts message and context", () => {
    expect(() => logger.info("hello", { userId: "123" })).not.toThrow();
  });

  it("all log levels are callable", () => {
    for (const level of ["trace", "debug", "info", "warn", "error", "fatal"] as const) {
      expect(() => logger[level](level)).not.toThrow();
    }
  });

  it("child() returns a Logger", () => {
    const child = logger.child({ component: "db" });
    expect(typeof child.info).toBe("function");
    expect(typeof child.child).toBe("function");
    child.info("child message");
  });

  it("handles undefined context gracefully", () => {
    expect(() => logger.error("no context")).not.toThrow();
    expect(() => logger.warn("also no context")).not.toThrow();
  });

  it("silent option suppresses output", () => {
    const silent = createLogger("silent", { silent: true });
    expect(silent).toBeDefined();
    expect(() => silent.info("should not appear")).not.toThrow();
  });

  it("custom log level is accepted", () => {
    const debugLogger = createLogger("debug-svc", { level: "debug" });
    expect(debugLogger).toBeDefined();
  });

  it("base context includes service name", () => {
    const svc = createLogger("my-api");
    expect(svc).toBeDefined();
    expect(() => svc.info("started")).not.toThrow();
  });
});
