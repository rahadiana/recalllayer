import { performance } from "node:perf_hooks";
import Redis from "ioredis";
import type { Redis as RedisClient } from "ioredis";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { ClientHealth, RedisOptions, RedisPool } from "./types.js";

let logger: Logger | undefined;

function getLogger(): Logger {
  if (!logger) {
    logger = createLogger("db:redis");
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

export function createRedisClient(
  url: string,
  opts?: RedisOptions,
): RedisPool {
  const log = getLogger();
  const client: RedisClient = new Redis(url, {
    maxRetriesPerRequest: opts?.maxRetriesPerRequest ?? 3,
    enableOfflineQueue: opts?.enableOfflineQueue ?? false,
    lazyConnect: opts?.lazyConnect ?? false,
    connectionName: opts?.connectionName ?? "memory-platform",
  });

  client.on("connect", () => log.info("Redis connected"));
  client.on("error", (err: Error) => log.error("Redis error", { error: err.message }));

  log.info("Redis client created");

  const pool: RedisPool = {
    client,

    async health(): Promise<ClientHealth> {
      const start = performance.now();
      try {
        const result = await client.ping();
        if (result === "PONG") {
          return measureHealth(start, "healthy");
        }
        return measureHealth(start, "degraded", `unexpected ping response: ${result}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("Redis health check failed", { error: message });
        return measureHealth(start, "unhealthy", message);
      }
    },

    async close(): Promise<void> {
      log.info("Closing Redis client");
      await client.quit();
      log.info("Redis client closed");
    },

    async withConnection<T>(
      fn: (conn: RedisClient) => Promise<T>,
    ): Promise<T> {
      return fn(client);
    },
  };

  return pool;
}
