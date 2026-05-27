import { metrics, Meter, Counter, Histogram, MetricOptions } from "@opentelemetry/api";

let meter: Meter | null = null;

/**
 * Options for configuring metrics.
 */
export interface MetricsOptions {
  /** If true, use a no-op meter — useful for testing */
  noop?: boolean;
}

/**
 * Initialise the OpenTelemetry Meter for a service.
 *
 * Call once at startup. Idempotent — subsequent calls return the same meter.
 */
export function initMetrics(
  serviceName: string,
  opts?: MetricsOptions,
): Meter {
  if (meter) return meter;

  if (opts?.noop) {
    meter = metrics.getMeter(serviceName);
    return meter;
  }

  meter = metrics.getMeter(serviceName);
  return meter;
}

/**
 * Retrieve the configured OpenTelemetry Meter.
 */
export function getMeter(): Meter {
  if (!meter) {
    throw new Error(
      "Metrics not initialised. Call initMetrics(serviceName) first.",
    );
  }
  return meter;
}

/**
 * Options for custom metrics.
 */
export interface MetricRecordOptions extends MetricOptions {
  name: string;
  description?: string;
  unit?: string;
}

/**
 * Create a Counter metric.
 */
export function createCounter(
  opts: MetricRecordOptions,
): Counter {
  const { name, description, unit, ...metricOpts } = opts;
  return getMeter().createCounter(name, { description, unit, ...metricOpts });
}

/**
 * Create a Histogram metric.
 */
export function createHistogram(
  opts: MetricRecordOptions,
): Histogram {
  const { name, description, unit, ...metricOpts } = opts;
  return getMeter().createHistogram(name, { description, unit, ...metricOpts });
}

/**
 * Labels (attributes) attached to a metric data point.
 */
export type MetricLabels = Record<string, string | number | boolean>;

/**
 * Record a metric value against a named instrument.
 *
 * Looks up the instrument by name. Supports Counter (add) and Histogram (record).
 * Creates ephemeral instruments on first use if not already registered.
 */
export function recordMetric(
  instrumentName: string,
  value: number,
  labels?: MetricLabels,
  kind: "counter" | "histogram" = "counter",
): void {
  const m = getMeter();
  if (kind === "counter") {
    const c: Counter = m.createCounter(instrumentName);
    c.add(value, labels);
  } else {
    const h: Histogram = m.createHistogram(instrumentName);
    h.record(value, labels);
  }
}

/**
 * Reset the meter (mainly for testing).
 */
export function resetMetrics(): void {
  meter = null;
}
