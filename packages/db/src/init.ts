import { createLogger, type Logger } from "@memory-platform/observability";
import type { ConnectionConfig, ClientHealth, DbClients } from "./types.js";
import { createPostgresClient } from "./postgres.js";
import { createRedisClient } from "./redis.js";
import { createVectorClient } from "./vector.js";
import { createGraphClient } from "./graph.js";
import { createStorageClient } from "./storage.js";

let logger: Logger | undefined;

function getLogger(): Logger {
  if (!logger) {
    logger = createLogger("db:init");
  }
  return logger;
}

export function createDbClients(config: ConnectionConfig): DbClients {
  const log = getLogger();

  const postgres = config.postgresUrl
    ? createPostgresClient(config.postgresUrl)
    : undefined;

  const redis = config.redisUrl
    ? createRedisClient(config.redisUrl)
    : undefined;

  const vector = config.qdrantUrl
    ? createVectorClient(config.qdrantUrl, config.qdrantApiKey)
    : undefined;

  const graph =
    config.neo4jUrl && config.neo4jUser
      ? createGraphClient(config.neo4jUrl, config.neo4jUser, config.neo4jPassword)
      : undefined;

  const storage = config.s3Endpoint
    ? createStorageClient(
        config.s3Endpoint,
        config.s3Region ?? "us-east-1",
        config.s3AccessKeyId && config.s3SecretAccessKey
          ? {
              accessKeyId: config.s3AccessKeyId,
              secretAccessKey: config.s3SecretAccessKey,
            }
          : undefined,
        {
          forcePathStyle: config.s3ForcePathStyle,
          bucket: config.s3Bucket,
        },
      )
    : undefined;

  log.info("DbClients aggregate created", {
    postgres: !!postgres,
    redis: !!redis,
    vector: !!vector,
    graph: !!graph,
    storage: !!storage,
  });

  const clients: DbClients = {
    postgres,
    redis,
    vector,
    graph,
    storage,

    async health(): Promise<Record<string, ClientHealth>> {
      const results: Record<string, ClientHealth> = {};
      const checks: Promise<void>[] = [];

      if (clients.postgres) {
        checks.push(
          clients.postgres.health().then((h) => {
            results.postgres = h;
          }),
        );
      }
      if (clients.redis) {
        checks.push(
          clients.redis.health().then((h) => {
            results.redis = h;
          }),
        );
      }
      if (clients.vector) {
        checks.push(
          clients.vector.health().then((h) => {
            results.vector = h;
          }),
        );
      }
      if (clients.graph) {
        checks.push(
          clients.graph.health().then((h) => {
            results.graph = h;
          }),
        );
      }
      if (clients.storage) {
        checks.push(
          clients.storage.health().then((h) => {
            results.storage = h;
          }),
        );
      }

      await Promise.allSettled(checks);
      return results;
    },

    async close(): Promise<void> {
      const closers: Promise<void>[] = [];
      if (clients.postgres) closers.push(clients.postgres.close());
      if (clients.redis) closers.push(clients.redis.close());
      if (clients.vector) closers.push(clients.vector.close());
      if (clients.graph) closers.push(clients.graph.close());
      if (clients.storage) closers.push(clients.storage.close());
      await Promise.allSettled(closers);
      log.info("All DbClients closed");
    },
  };

  return clients;
}

export async function initDatabases(
  config: ConnectionConfig,
): Promise<DbClients> {
  const log = getLogger();
  log.info("Initializing databases", {
    postgres: !!config.postgresUrl,
    redis: !!config.redisUrl,
    qdrant: !!config.qdrantUrl,
    neo4j: !!config.neo4jUrl,
    s3: !!config.s3Endpoint,
  });

  const clients = createDbClients(config);

  const healthResults = await clients.health();
  for (const [name, health] of Object.entries(healthResults)) {
    if (health.status === "healthy") {
      log.info(`Database ${name} is healthy`, { latencyMs: health.latencyMs });
    } else {
      log.warn(`Database ${name} is ${health.status}`, {
        message: health.message,
      });
    }
  }

  return clients;
}
