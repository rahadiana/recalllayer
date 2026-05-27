import { performance } from "node:perf_hooks";
import { QdrantClient } from "@qdrant/js-client-rest";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { ClientHealth, QdrantOptions, VectorClient } from "./types.js";

let logger: Logger | undefined;

function getLogger(): Logger {
  if (!logger) {
    logger = createLogger("db:vector");
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

export function createVectorClient(
  url: string,
  apiKey?: string,
  opts?: QdrantOptions,
): VectorClient {
  const log = getLogger();
  const client = new QdrantClient({
    url,
    apiKey,
    timeout: opts?.timeout ?? 30000,
    port: opts?.port,
  });

  log.info("Qdrant client created", { url });

  const vc: VectorClient = {
    client,

    async health(): Promise<ClientHealth> {
      const start = performance.now();
      try {
        const collections = await client.getCollections();
        const latencyMs = Math.round(performance.now() - start);
        if (collections && Array.isArray(collections.collections)) {
          log.debug("Qdrant health check passed", {
            collectionCount: collections.collections.length,
          });
          return measureHealth(start, "healthy");
        }
        return measureHealth(start, "degraded", "unexpected response format");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("Qdrant health check failed", { error: message });
        return measureHealth(start, "unhealthy", message);
      }
    },

    async close(): Promise<void> {
      log.info("Closing Qdrant client (no persistent connection to close)");
    },

    async listCollections(): Promise<string[]> {
      const result = await client.getCollections();
      return (result.collections ?? []).map(
        (c: { name: string }) => c.name,
      );
    },
  };

  return vc;
}
