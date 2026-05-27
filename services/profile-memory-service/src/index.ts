import express from "express";
import type { Express, Request, Response } from "express";
import { createPostgresClient, createRedisClient, type PostgresPool } from "@memory-platform/db";
import type { RedisPool } from "@memory-platform/db";
import { createLogger } from "@memory-platform/observability";
import { healthEndpoint, registerCheck } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { QueueConfig } from "@memory-platform/queue";
import { EventPublisher } from "./events.js";
import { ProfileRepository } from "./profile-repository.js";
import { ProfileMemoryWorker } from "./worker.js";
import { createProfileRoutes } from "./routes/profile.js";
import type { ProfileMemoryServiceConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export interface ProfileMemoryServiceApp {
  app: Express;
  pool: PostgresPool;
  redisPool: RedisPool;
  worker: ProfileMemoryWorker;
  events: EventPublisher;
  repo: ProfileRepository;
  close(): Promise<void>;
}

export async function createApp(
  config: ProfileMemoryServiceConfig,
): Promise<ProfileMemoryServiceApp> {
  const log = createLogger("profile-memory-service");

  const pool = createPostgresClient(config.postgresUrl, { max: 10 });
  const redisPool = createRedisClient(config.redisUrl);
  const redis = redisPool.client;

  log.info("Database connections initialized");

  const repo = new ProfileRepository(pool);

  const queueConfig: QueueConfig = {
    redisUrl: config.redisUrl,
    keyPrefix: config.queuePrefix ?? "profile",
    defaultChannel: "profile",
  };

  const events = new EventPublisher(redis, queueConfig);

  const worker = new ProfileMemoryWorker({
    redis,
    queueConfig,
    repo,
    events,
    config,
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const health = healthEndpoint("profile-memory-service");
  registerCheck("postgres", async () => {
    const result = await pool.health();
    return { status: result.status, message: result.message };
  });
  registerCheck("redis", async () => {
    const result = await redisPool.health();
    return { status: result.status, message: result.message };
  });

  app.get("/health", async (_req: Request, res: Response) => {
    const report = await health();
    const statusCode =
      report.status === "healthy" ? 200
        : report.status === "degraded" ? 200
        : 503;
    res.status(statusCode).json(report);
  });

  const profileRoutes = createProfileRoutes(repo, events, config);
  app.use(profileRoutes);

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.path}`,
      error_id: generateId(),
      timestamp: new Date().toISOString(),
    });
  });

  worker.start();

  return {
    app,
    pool,
    redisPool,
    worker,
    events,
    repo,
    async close() {
      log.info("Shutting down profile memory service");
      worker.stop();
      await pool.close();
      await redisPool.close();
      log.info("Profile memory service shut down complete");
    },
  };
}

export async function startServer(config: ProfileMemoryServiceConfig): Promise<void> {
  const log = createLogger("profile-memory-service");
  const { app, close } = await createApp(config);
  const port = config.port ?? DEFAULT_CONFIG.port ?? 3007;

  const server = app.listen(port, () => {
    log.info("Profile memory service started", { port });
  });

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down`);
    server.close(() => {
      close().then(() => process.exit(0));
    });
    setTimeout(() => {
      log.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
