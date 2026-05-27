import express from "express";
import type { Express, Request, Response } from "express";
import { createPostgresClient, type PostgresPool } from "@memory-platform/db";
import { createLogger } from "@memory-platform/observability";
import { healthEndpoint, registerCheck } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import { Publisher } from "@memory-platform/queue";
import Redis from "ioredis";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { EventPublisher } from "./events.js";
import { createEventPublisher } from "./events.js";
import { ConnectorRepository } from "./repository.js";
import { ConnectorRegistry } from "./connector-registry.js";
import { OAuthManager } from "./oauth-manager.js";
import { SyncWorker } from "./worker.js";
import { SyncScheduler } from "./sync-scheduler.js";
import { WebhookReceiver } from "./webhook-receiver.js";
import { createConnectorRoutes } from "./routes/connectors.js";
import type { ConnectorServiceConfig, ConnectorPlugin } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import crypto from "node:crypto";

export interface ConnectorServiceApp {
  app: Express;
  pool: PostgresPool;
  registry: ConnectorRegistry;
  events: EventPublisher;
  scheduler: SyncScheduler;
  close(): Promise<void>;
}

export async function createApp(
  config: ConnectorServiceConfig,
): Promise<ConnectorServiceApp> {
  const log = createLogger("connector-service");

  const pool = createPostgresClient(config.postgresUrl, { max: 10 });
  log.info("Postgres pool initialized");

  const repo = new ConnectorRepository(pool);
  await repo.runMigrations();
  log.info("Database migrations applied");

  const registry = new ConnectorRegistry();

  const encryptionKey =
    config.encryptionKey ??
    process.env.ENCRYPTION_KEY ??
    crypto.randomBytes(32).toString("hex");

  const oauth = new OAuthManager(repo, encryptionKey);

  const publisher = new Publisher(
    new Redis(config.redisUrl),
    {
      redisUrl: config.redisUrl,
      keyPrefix: "connector:",
      enableDLQ: true,
    },
    new EventEmitter(),
    randomUUID(),
  );

  const events = createEventPublisher(publisher);

  const worker = new SyncWorker(repo, registry, oauth, events);

  const scheduler = new SyncScheduler(
    repo,
    registry,
    async (account, syncMode) => {
      const syncState = await repo.getSyncState(account.id);
      const cursorBefore = syncState?.cursor;
      const job = await repo.createSyncJob({
        accountId: account.id,
        workspaceId: account.workspace_id,
        connectorType: account.connector_type,
        syncMode,
        cursorBefore,
      });

      events
        .publishSyncRequested(account.workspace_id, {
          connector_type: account.connector_type,
          account_id: account.id,
          sync_mode: syncMode,
        })
        .catch((err) =>
          log.error("Failed to publish sync requested event", {
            error: err instanceof Error ? err.message : "Unknown",
          }),
        );

      scheduler.addActiveJob(job.id);

      worker
        .executeSyncJob(job.id)
        .then(() => scheduler.removeActiveJob(job.id))
        .catch((err) => {
          log.error("Scheduled sync job failed", {
            jobId: job.id,
            error: err instanceof Error ? err.message : "Unknown",
          });
          scheduler.removeActiveJob(job.id);
        });

      return job;
    },
  );

  const webhookReceiver = new WebhookReceiver(registry, repo);

  const app = express();

  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        (req as Request & { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );

  app.use((_req: Request, _res: Response, next) => {
    next();
  });

  const health = healthEndpoint("connector-service");
  registerCheck("postgres", async () => {
    const result = await pool.health();
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

  const baseUrl = config.baseUrl ?? `http://localhost:${config.port ?? DEFAULT_CONFIG.port}`;
  const connectorRoutes = createConnectorRoutes(
    repo,
    registry,
    oauth,
    events,
    worker,
    scheduler,
    baseUrl,
  );
  app.use(connectorRoutes);

  app.post(
    "/internal/webhooks/:type",
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { type } = req.params;
        const result = await webhookReceiver.receiveWebhook(type as string, req);

        res.status(200).json({
          status: "received",
          event_id: result.event.id,
          items_processed: result.items.length,
        });
      } catch (error) {
        log.error("Webhook endpoint failed", {
          type: req.params.type,
          error: error instanceof Error ? error.message : "Unknown",
        });

        res.status(500).json({
          code: "WEBHOOK_FAILED",
          message:
            error instanceof Error ? error.message : "Webhook processing failed",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

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
    registry,
    events,
    scheduler,
    async close() {
      log.info("Shutting down connector service");
      scheduler.stop();
      await events.close();
      await pool.close();
      log.info("Connector service shut down complete");
    },
  };
}

export async function startServer(
  config: ConnectorServiceConfig,
): Promise<void> {
  const log = createLogger("connector-service");
  const { app, close } = await createApp(config);
  const port = config.port ?? DEFAULT_CONFIG.port ?? 3003;

  const server = app.listen(port, () => {
    log.info("Connector service started", { port });
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

export function registerPlugin(
  app: ConnectorServiceApp,
  plugin: ConnectorPlugin,
): void {
  app.registry.register(plugin);
}
