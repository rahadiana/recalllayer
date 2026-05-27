import { createLogger, Logger, LoggerOptions_ } from "./logger.js";
import { initTracing, shutdownTracing, TracingOptions } from "./tracer.js";
import { initMetrics, MetricsOptions } from "./metrics.js";
import { healthEndpoint, HealthReport } from "./health.js";
import type { Meter } from "@opentelemetry/api";
import type { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";

/**
 * Options for the unified initObservability() entry point.
 */
export interface ObservabilityOptions {
  /** Logger configuration */
  logger?: LoggerOptions_;
  /** Tracing configuration — set `noop: true` to disable */
  tracing?: TracingOptions;
  /** Metrics configuration — set `noop: true` to disable */
  metrics?: MetricsOptions;
}

/**
 * Result returned by initObservability().
 */
export interface ObservabilityContext {
  logger: Logger;
  tracerProvider: BasicTracerProvider;
  meter: Meter;
  /** Returns a health report for this service */
  healthReport: () => Promise<HealthReport>;
  /** Gracefully shut down tracing (flush pending spans) */
  shutdown: () => Promise<void>;
}

/**
 * Bootstrap all observability concerns for a service.
 *
 * - Creates a structured pino logger
 * - Initialises OpenTelemetry tracing (OTLP HTTP exporter)
 * - Initialises OpenTelemetry metrics
 * - Wires up the health endpoint
 *
 * @param serviceName - unique service identifier (e.g. "api-gateway")
 * @param opts        - optional overrides for logger / tracing / metrics
 *
 * @example
 * ```ts
 * import { initObservability } from "@memory-platform/observability";
 *
 * const { logger, healthReport, shutdown } = initObservability("my-service");
 * logger.info("Service started");
 *
 * // On SIGTERM:
 * await shutdown();
 * ```
 */
export function initObservability(
  serviceName: string,
  opts?: ObservabilityOptions,
): ObservabilityContext {
  const logger = createLogger(serviceName, opts?.logger);
  const tracerProvider = initTracing(serviceName, opts?.tracing);
  const meter = initMetrics(serviceName, opts?.metrics);
  const healthReport = healthEndpoint(serviceName);

  return {
    logger,
    tracerProvider,
    meter,
    healthReport,
    shutdown: async () => {
      await shutdownTracing();
    },
  };
}
