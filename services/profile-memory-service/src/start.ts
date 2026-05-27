import { startServer } from "./index.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { ProfileMemoryServiceConfig } from "./types.js";

const config: ProfileMemoryServiceConfig = {
  port: parseInt(process.env.PORT ?? String(DEFAULT_CONFIG.port ?? 3007), 10),
  postgresUrl:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/memory_platform",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  queuePrefix: process.env.QUEUE_PREFIX ?? "profile",
  inferenceConfidenceThreshold:
    DEFAULT_CONFIG.inferenceConfidenceThreshold ?? 0.7,
  maxBehaviorEventsPerProfile:
    DEFAULT_CONFIG.maxBehaviorEventsPerProfile ?? 10_000,
  maxFactsPerProfile: DEFAULT_CONFIG.maxFactsPerProfile ?? 500,
};

startServer(config).catch((err) => {
  console.error("Failed to start profile memory service", err);
  process.exit(1);
});
