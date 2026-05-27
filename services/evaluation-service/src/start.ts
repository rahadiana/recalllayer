import {
  createPostgresClient,
  createRedisClient,
  type PostgresPool,
  type RedisPool,
} from "@memory-platform/db";
import { initEvaluationService, type RetrievalClient } from "./index.js";

const port = parseInt(process.env.PORT ?? "3009", 10);

const postgresPool: PostgresPool = createPostgresClient(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/memory_platform",
);

const redisPool: RedisPool = createRedisClient(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);

const retrievalClient: RetrievalClient = {
  search: async (query: string) => {
    const res = await fetch(
      `${process.env.RETRIEVAL_SERVICE_URL ?? "http://localhost:3005"}/internal/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      },
    );
    return res.json();
  },
};

const service = initEvaluationService({
  postgresPool,
  redisPool,
  retrievalClient,
});

service.start(port).catch((err) => {
  console.error("Failed to start evaluation service", err);
  process.exit(1);
});
