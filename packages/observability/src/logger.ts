import { pino, type Logger as PinoInstance, type LoggerOptions } from "pino";
import { getCorrelationId } from "./correlation.js";

/**
 * Structured log levels supported by the platform logger.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Log context — arbitrary key-value metadata attached to a log entry.
 */
export type LogContext = Record<string, unknown>;

/**
 * Public Logger interface exposed to services.
 */
export interface Logger {
  trace(msg: string, context?: LogContext): void;
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
  fatal(msg: string, context?: LogContext): void;

  /**
   * Create a child logger with additional default context fields.
   */
  child(bindings: LogContext): Logger;
}

/**
 * Options for createLogger.
 */
export interface LoggerOptions_ {
  level?: LogLevel;
  /** Disable stdout — useful during testing. */
  silent?: boolean;
  /** Default context merged into every log line. */
  base?: LogContext;
}

/**
 * Pino-backed Logger implementation.
 */
class PinoLogger implements Logger {
  constructor(private readonly pino: PinoInstance) {}

  private enrich(context?: LogContext): LogContext {
    const correlationId = getCorrelationId();
    if (correlationId) {
      return { correlationId, ...context };
    }
    return context ?? {};
  }

  trace(msg: string, context?: LogContext): void {
    this.pino.trace(this.enrich(context), msg);
  }

  debug(msg: string, context?: LogContext): void {
    this.pino.debug(this.enrich(context), msg);
  }

  info(msg: string, context?: LogContext): void {
    this.pino.info(this.enrich(context), msg);
  }

  warn(msg: string, context?: LogContext): void {
    this.pino.warn(this.enrich(context), msg);
  }

  error(msg: string, context?: LogContext): void {
    this.pino.error(this.enrich(context), msg);
  }

  fatal(msg: string, context?: LogContext): void {
    this.pino.fatal(this.enrich(context), msg);
  }

  child(bindings: LogContext): Logger {
    return new PinoLogger(this.pino.child(bindings));
  }
}

/**
 * Create a structured logger for the given service.
 *
 * @param serviceName - name of the owning service (e.g. "api-gateway")
 * @param opts        - level, silent mode, base context
 */
export function createLogger(
  serviceName: string,
  opts: LoggerOptions_ = {},
): Logger {
  const { level = "info", silent = false, base = {} } = opts;

  const pinoOpts: LoggerOptions = {
    name: serviceName,
    level,
    base: { service: serviceName, ...base },
    // pino-pretty in dev for human-readable logs; JSON in production
    ...(process.env.NODE_ENV !== "production" && {
      transport: { target: "pino-pretty", options: { colorize: true } },
    }),
  };

  const instance = silent ? pino({ ...pinoOpts, enabled: false }) : pino(pinoOpts);

  return new PinoLogger(instance);
}
