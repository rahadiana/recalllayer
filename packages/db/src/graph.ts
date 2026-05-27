import { performance } from "node:perf_hooks";
import neo4j, { type Driver } from "neo4j-driver";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { ClientHealth, GraphClient, Neo4jOptions } from "./types.js";

let logger: Logger | undefined;

function getLogger(): Logger {
  if (!logger) {
    logger = createLogger("db:graph");
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

export function createGraphClient(
  url: string,
  user: string,
  password?: string,
  opts?: Neo4jOptions,
): GraphClient {
  const log = getLogger();
  const resolvedPassword = password ?? process.env.NEO4J_PASSWORD ?? "";
  const driver: Driver = neo4j.driver(
    url,
    neo4j.auth.basic(user, resolvedPassword),
    { maxConnectionLifetime: 30 * 60 * 1000 },
  );

  log.info("Neo4j driver created", { url, user });

  const gc: GraphClient = {
    driver,

    async health(): Promise<ClientHealth> {
      const start = performance.now();
      const session = driver.session({
        database: opts?.database ?? "neo4j",
      });
      try {
        const result = await session.run("RETURN 1 AS check_result");
        const record = result.records[0];
        const checkResult =
          record?.get("check_result") as number | null;
        if (checkResult === 1) {
          return measureHealth(start, "healthy");
        }
        return measureHealth(start, "degraded", "unexpected query result");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("Neo4j health check failed", { error: message });
        return measureHealth(start, "unhealthy", message);
      } finally {
        await session.close();
      }
    },

    async close(): Promise<void> {
      log.info("Closing Neo4j driver");
      await driver.close();
      log.info("Neo4j driver closed");
    },

    async verifyConnectivity(): Promise<boolean> {
      try {
        await driver.verifyConnectivity();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("Neo4j connectivity verification failed", { error: message });
        return false;
      }
    },
  };

  return gc;
}
