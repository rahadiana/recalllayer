import { startIndexingService } from "./index.js";

const config = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  queuePrefix: process.env.QUEUE_PREFIX ?? "memory",
  db: {
    postgresUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/memory_platform",
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
    qdrantApiKey: process.env.QDRANT_API_KEY || undefined,
  },
  consumeChannel: process.env.CONSUME_CHANNEL ?? "document.extracted",
  publishChannel: process.env.PUBLISH_CHANNEL ?? "indexing.events",
};

startIndexingService(config).catch((err) => {
  console.error("Failed to start indexing service", err);
  process.exit(1);
});
