// ── Bootstrap ────────────────────────────────────────────────
export { initObservability } from "./init.js";
export type { ObservabilityOptions, ObservabilityContext } from "./init.js";

// ── Logger ──────────────────────────────────────────────────
export { createLogger } from "./logger.js";
export type { Logger, LogLevel, LogContext, LoggerOptions_ } from "./logger.js";

// ── Tracer ──────────────────────────────────────────────────
export {
  initTracing,
  getTracer,
  traceAsync,
  getActiveSpan,
  shutdownTracing,
} from "./tracer.js";
export type { TracingOptions } from "./tracer.js";

// ── Metrics ─────────────────────────────────────────────────
export {
  initMetrics,
  getMeter,
  createCounter,
  createHistogram,
  recordMetric,
  resetMetrics,
} from "./metrics.js";
export type {
  MetricsOptions,
  MetricRecordOptions,
  MetricLabels,
} from "./metrics.js";

// ── Health ──────────────────────────────────────────────────
export {
  registerCheck,
  healthEndpoint,
  healthCheck,
  resetHealth,
} from "./health.js";
export type {
  HealthStatus,
  HealthCheckResult,
  HealthChecker,
  HealthReport,
} from "./health.js";

// ── Correlation ─────────────────────────────────────────────
export {
  generateCorrelationId,
  withCorrelationId,
  withCorrelationIdAsync,
  getCorrelationId,
  requireCorrelationId,
  parseCorrelationId,
  ContextKey,
} from "./correlation.js";
export type { CorrelationId } from "./correlation.js";
