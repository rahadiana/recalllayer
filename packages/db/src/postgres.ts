import { performance } from "node:perf_hooks";
import postgres from "postgres";
import type { Sql } from "postgres";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { ClientHealth, PostgresOptions, PostgresPool } from "./types.js";

let logger: Logger | undefined;

function getLogger(): Logger {
  if (!logger) {
    logger = createLogger("db:postgres");
  }
  return logger;
}

function measureHealth(
  startMs: number,
  status: ClientHealth["status"],
  message?: string,
): ClientHealth {
  return {
    status,
    latencyMs: Math.round(performance.now() - startMs),
    message,
    checkedAt: new Date(),
  };
}

export function createPostgresClient(
  url: string,
  opts?: PostgresOptions,
): PostgresPool {
  const log = getLogger();
  const sql: Sql = postgres(url, {
    max: opts?.max ?? 20,
    idle_timeout: opts?.idleTimeout ?? 30,
    max_lifetime: opts?.maxLifetime ?? 60 * 30,
    database: opts?.database,
    onnotice: opts?.onnotice,
    transform: postgres.camel,
  });

  log.info("Postgres pool created", { max: opts?.max ?? 20 });

  const pool: PostgresPool = {
    sql,

    async health(): Promise<ClientHealth> {
      const start = performance.now();
      try {
        const [result] = await sql`SELECT 1 AS check_result`;
        const latencyMs = Math.round(performance.now() - start);
        if (result && (result as Record<string, unknown>).check_result === 1) {
          return measureHealth(start, "healthy");
        }
        return measureHealth(start, "degraded", "unexpected query result");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("Postgres health check failed", { error: message });
        return measureHealth(start, "unhealthy", message);
      }
    },

    async close(): Promise<void> {
      log.info("Closing Postgres pool");
      await sql.end({ timeout: 5 });
      log.info("Postgres pool closed");
    },
  };

  return pool;
}
