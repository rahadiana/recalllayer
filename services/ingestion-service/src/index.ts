import express from "express";
import type { Express, Request, Response } from "express";
import { createPostgresClient, type PostgresPool } from "@memory-platform/db";
import { createLogger } from "@memory-platform/observability";
import {
  healthEndpoint,
  registerCheck,
} from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { EventPublisher } from "./events.js";
import { DocumentRepository } from "./repository.js";
import { DocumentIngestHandler } from "./handlers/ingest.js";
import { UploadSessionHandler } from "./handlers/upload-session.js";
import { createDocumentRoutes } from "./routes/documents.js";
import type { IngestionServiceConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export interface IngestionServiceApp {
  app: Express;
  pool: PostgresPool;
  events: EventPublisher;
  close(): Promise<void>;
}

export async function createApp(
  config: IngestionServiceConfig,
  events: EventPublisher,
): Promise<IngestionServiceApp> {
  const log = createLogger("ingestion-service");

  const pool = createPostgresClient(config.postgresUrl, {
    max: 10,
  });

  log.info("Postgres pool initialized");

  const repo = new DocumentRepository(pool);
  const ingestHandler = new DocumentIngestHandler(repo, events);
  const uploadHandler = new UploadSessionHandler();

  const app = express();

  app.use(express.json({ limit: "10mb" }));

  app.use((_req: Request, _res: Response, next) => {
    next();
  });

  const health = healthEndpoint("ingestion-service");
  registerCheck("postgres", async () => {
    const result = await pool.health();
    return {
      status: result.status,
      message: result.message,
    };
  });

  app.get("/health", async (_req: Request, res: Response) => {
    const report = await health();
    const statusCode =
      report.status === "healthy" ? 200
      : report.status === "degraded" ? 200
      : 503;
    res.status(statusCode).json(report);
  });

  const documentRoutes = createDocumentRoutes(repo, ingestHandler, uploadHandler);
  app.use(documentRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: `Route not found: ${_req.method} ${_req.path}`,
      error_id: generateId(),
      timestamp: new Date().toISOString(),
    });
  });

  return {
    app,
    pool,
    events,
    async close() {
      log.info("Shutting down ingestion service");
      await pool.close();
      log.info("Ingestion service shut down complete");
    },
  };
}

export async function startServer(config: IngestionServiceConfig, events: EventPublisher): Promise<void> {
  const log = createLogger("ingestion-service");
  const { app, close } = await createApp(config, events);
  const port = config.port ?? DEFAULT_CONFIG.port ?? 3001;

  const server = app.listen(port, () => {
    log.info("Ingestion service started", {
      port,
      allowedMimeTypes: config.allowedMimeTypes?.length ?? DEFAULT_CONFIG.allowedMimeTypes?.length,
      maxFileSize: config.maxFileSize ?? DEFAULT_CONFIG.maxFileSize,
    });
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
