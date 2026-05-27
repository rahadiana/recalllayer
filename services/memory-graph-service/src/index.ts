import express from "express";
import { EventEmitter } from "node:events";
import Redis from "ioredis";
import type { GraphClient } from "@memory-platform/db";
import { createGraphClient, createPostgresClient, type PostgresPool } from "@memory-platform/db";
import { Queue, type QueueConfig } from "@memory-platform/queue";
import {
  createLogger,
  initObservability,
  registerCheck,
  type Logger,
} from "@memory-platform/observability";
import { createEntityExtractor } from "./entity-extractor.js";
import { createRelationDetector } from "./relation-detector.js";
import { createGraphWriter } from "./graph-writer.js";
import { createGraphReader } from "./graph-reader.js";
import { createConflictDetector } from "./conflict-detector.js";
import { EventPublisher } from "./events.js";
import { createGraphWorker, type DocumentIndexedPayload } from "./worker.js";
import { createGraphRouter } from "./routes/graph.js";

export interface MemoryGraphServiceConfig {
  neo4jUrl: string;
  neo4jUser: string;
  neo4jPassword?: string;
  redisUrl: string;
  postgresUrl: string;
  queuePrefix?: string;
  maxConcurrency?: number;
  port?: number;
}

export class MemoryGraphService {
  #graphClient: GraphClient;
  #postgres: PostgresPool;
  #redis: Redis;
  #queue: Queue;
  #events: EventPublisher;
  #worker: ReturnType<typeof createGraphWorker>;
  #reader: ReturnType<typeof createGraphReader>;
  #writer: ReturnType<typeof createGraphWriter>;
  #app: express.Application;
  #log: Logger;
  #port: number;
  #unsubscribe: (() => void) | null = null;
  #server: ReturnType<express.Application["listen"]> | null = null;

  constructor(config: MemoryGraphServiceConfig) {
    this.#log = createLogger("memory-graph-service");
    this.#port = config.port ?? 4004;

    this.#graphClient = createGraphClient(
      config.neo4jUrl,
      config.neo4jUser,
      config.neo4jPassword,
    );

    this.#postgres = createPostgresClient(config.postgresUrl);
    this.#redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    const queueConfig: QueueConfig = {
      redisUrl: config.redisUrl,
      keyPrefix: config.queuePrefix ?? "memory-graph",
      defaultChannel: "graph.events",
    };

    const emitter = new EventEmitter();
    this.#queue = new Queue(this.#redis, queueConfig, emitter);

    this.#events = new EventPublisher(this.#redis, queueConfig);
    this.#writer = createGraphWriter(this.#graphClient);
    this.#reader = createGraphReader(this.#graphClient);

    const extractor = createEntityExtractor();
    const detector = createRelationDetector();
    const conflictDetector = createConflictDetector(this.#graphClient);

    this.#worker = createGraphWorker({
      extractor,
      detector,
      writer: this.#writer,
      conflictDetector,
      events: this.#events,
      config: { maxConcurrency: config.maxConcurrency ?? 3 },
    });

    this.#app = express();
    this.#app.use(express.json({ limit: "1mb" }));

    const graphRouter = createGraphRouter(this.#reader);
    this.#app.use(graphRouter);

    this.#app.get("/health", (_req, res) => {
      res.json({
        status: "healthy",
        service: "memory-graph-service",
        timestamp: new Date().toISOString(),
      });
    });
  }

  async start(): Promise<void> {
    this.#log.info("Starting memory-graph-service");

    await this.#redis.connect();
    await this.#writer.ensureConstraints();

    registerCheck("neo4j", async () => {
      try {
        const health = await this.#graphClient.health();
        return {
          status: health.status,
          latencyMs: health.latencyMs,
          message: health.message,
          checkedAt: new Date(),
        };
      } catch {
        return {
          status: "unhealthy",
          latencyMs: 0,
          message: "Neo4j health check failed",
          checkedAt: new Date(),
        };
      }
    });

    registerCheck("redis", async () => {
      try {
        await this.#redis.ping();
        return {
          status: "healthy",
          latencyMs: 0,
          message: "Redis connected",
          checkedAt: new Date(),
        };
      } catch {
        return {
          status: "unhealthy",
          latencyMs: 0,
          message: "Redis health check failed",
          checkedAt: new Date(),
        };
      }
    });

    this.#unsubscribe = this.#queue.process<DocumentIndexedPayload>(
      "document.indexed",
      async (message) => {
        await this.#worker.processDocumentIndexed(message);
      },
      { concurrency: 3, useDLQ: true },
    );

    await new Promise<void>((resolve, reject) => {
      this.#server = this.#app.listen(this.#port, () => {
        this.#log.info(`Memory Graph Service listening on port ${this.#port}`);
        resolve();
      });
      this.#server.on("error", (err) => {
        reject(err);
      });
    });

    this.#log.info("Memory Graph Service started — listening for document.indexed events");
  }

  async stop(): Promise<void> {
    this.#log.info("Stopping memory-graph-service");

    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }

    if (this.#server) {
      await new Promise<void>((resolve) => {
        this.#server?.close(() => resolve());
      });
      this.#server = null;
    }

    await this.#queue.close();
    await this.#graphClient.close();
    await this.#postgres.close();
    this.#log.info("Memory Graph Service stopped");
  }
}

const neo4jUrl = process.env.NEO4J_URL ?? "bolt://localhost:7687";
const neo4jUser = process.env.NEO4J_USER ?? "neo4j";
const neo4jPassword = process.env.NEO4J_PASSWORD;
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const postgresUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "postgres://localhost:5432/memory-platform";
const queuePrefix = process.env.QUEUE_PREFIX ?? "memory-graph";
const maxConcurrency = parseInt(process.env.GRAPH_CONCURRENCY ?? "3", 10);
const port = parseInt(process.env.PORT ?? "4004", 10);

const service = new MemoryGraphService({
  neo4jUrl,
  neo4jUser,
  neo4jPassword,
  redisUrl,
  postgresUrl,
  queuePrefix,
  maxConcurrency,
  port,
});

async function main(): Promise<void> {
  initObservability("memory-graph-service");

  const shutdown = async () => {
    await service.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await service.start();
}

main().catch((err) => {
  console.error("Memory Graph Service failed to start", err);
  process.exit(1);
});

export {
  createEntityExtractor,
  createRelationDetector,
  createGraphWriter,
  createGraphReader,
  createConflictDetector,
  EventPublisher,
  createGraphWorker,
  createGraphRouter,
};

export type {
  DocumentIndexedPayload,
};

export type {
  EntityExtractor,
} from "./entity-extractor.js";

export type {
  RelationDetector,
} from "./relation-detector.js";

export type {
  GraphWriter,
} from "./graph-writer.js";

export type {
  GraphReader,
} from "./graph-reader.js";

export type {
  ConflictDetector,
} from "./conflict-detector.js";

export type {
  ExtractedEntityCandidate,
  ExtractedRelationCandidate,
  EntityRecord,
  RelationRecord,
  TraversalResult,
  TraversalNode,
  TraversalEdge,
  TraversalPath,
  ConflictRecord,
  GraphQueryRequest,
  EntityExtractionConfig,
  RelationDetectionConfig,
  GraphServiceError,
} from "./types.js";
