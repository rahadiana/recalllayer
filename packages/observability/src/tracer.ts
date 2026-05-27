import { trace, Span, SpanStatusCode, Tracer, context, propagation } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let tracerProvider: BasicTracerProvider | null = null;
let defaultTracer: Tracer | null = null;

/**
 * Options for configuring tracing.
 */
export interface TracingOptions {
  /** OTLP HTTP endpoint for traces (default: env OTEL_EXPORTER_OTLP_ENDPOINT or http://localhost:4318/v1/traces) */
  endpoint?: string;
  /** Batch export interval in ms */
  exportIntervalMs?: number;
  /** If true, skip initialisation — useful for testing */
  noop?: boolean;
}

const DEFAULT_TRACES_ENDPOINT = "http://localhost:4318/v1/traces";

function resolveTracesEndpoint(opts?: TracingOptions): string {
  return (
    opts?.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    DEFAULT_TRACES_ENDPOINT
  );
}

/**
 * Initialise OpenTelemetry tracing for a service.
 *
 * Call once at startup. Subsequent calls are no-ops (idempotent).
 */
export function initTracing(
  serviceName: string,
  opts?: TracingOptions,
): BasicTracerProvider {
  if (tracerProvider) return tracerProvider;

  if (opts?.noop) {
    tracerProvider = new BasicTracerProvider();
    defaultTracer = tracerProvider.getTracer(serviceName);
    return tracerProvider;
  }

  const exporter = new OTLPTraceExporter({
    url: resolveTracesEndpoint(opts),
  });

  tracerProvider = new BasicTracerProvider({
    resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  tracerProvider.register();
  defaultTracer = tracerProvider.getTracer(serviceName);

  tracerProvider.register({
    propagator: propagation,
  });

  return tracerProvider;
}

/**
 * Retrieve the OpenTelemetry Tracer for the given instrumentation scope.
 * Falls back to the default tracer if none exists.
 */
export function getTracer(name?: string): Tracer {
  if (tracerProvider) {
    return tracerProvider.getTracer(name ?? "default");
  }
  return trace.getTracer(name ?? "default");
}

/**
 * Wrap an async function in a span.
 *
 * Automatically records exceptions and sets span status on failure.
 *
 * @example
 * ```ts
 * const result = await traceAsync("db.query", { "db.table": "documents" }, async (span) => {
 *   span.setAttribute("rows", 42);
 *   return db.query(...);
 * });
 * ```
 */
export async function traceAsync<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean> | undefined,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const t = getTracer();
  return t.startActiveSpan(spanName, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Retrieve the currently active span from context.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Shutdown tracing — flushes any pending spans.
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
    defaultTracer = null;
  }
}
