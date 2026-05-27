import Redis from "ioredis";
import { startServer } from "./index.js";
import { EventPublisher } from "./events.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { IngestionServiceConfig } from "./types.js";

const config: IngestionServiceConfig = {
  port: parseInt(process.env.PORT ?? String(DEFAULT_CONFIG.port ?? 3002), 10),
  postgresUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/memory_platform",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  queuePrefix: process.env.QUEUE_PREFIX ?? "ingestion",
  allowedMimeTypes: DEFAULT_CONFIG.allowedMimeTypes ?? [],
  maxFileSize: DEFAULT_CONFIG.maxFileSize ?? 50 * 1024 * 1024,
  maxTextSize: DEFAULT_CONFIG.maxTextSize ?? 10 * 1024 * 1024,
  maxUploadSessionSize: DEFAULT_CONFIG.maxUploadSessionSize ?? 500 * 1024 * 1024,
};

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
const events = new EventPublisher(redis, {
  redisUrl: config.redisUrl,
  keyPrefix: config.queuePrefix ?? "ingestion",
  defaultChannel: "ingestion",
});

startServer(config, events).catch((err) => {
  console.error("Failed to start ingestion service", err);
  process.exit(1);
});
