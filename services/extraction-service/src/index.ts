import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import type { QueueConfig } from "@memory-platform/queue";
import { Queue } from "@memory-platform/queue";
import { createPostgresClient, type PostgresPool } from "@memory-platform/db";
import {
  createLogger,
  initObservability,
  type Logger,
} from "@memory-platform/observability";
import { ExtractionRepository } from "./repository.js";
import { EventPublisher } from "./events.js";
import { ExtractionWorker } from "./worker.js";

export interface ExtractionServiceConfig {
  postgresUrl: string;
  redisUrl: string;
  queuePrefix?: string;
  maxConcurrency?: number;
}

interface DocumentReceivedPayload {
  document_id: string;
  workspace_id: string;
  title: string;
  content?: string;
  source_type: string;
  mime_type?: string;
  size_bytes?: number;
  created_by: string;
}

export class ExtractionService {
  #pool: PostgresPool;
  #redis: Redis;
  #queue: Queue;
  #repo: ExtractionRepository;
  #events: EventPublisher;
  #worker: ExtractionWorker;
  #log: Logger;
  #emitter: EventEmitter;
  #unsubscribe: (() => void) | null = null;

  constructor(config: ExtractionServiceConfig) {
    this.#log = createLogger("extraction-service");

    this.#pool = createPostgresClient(config.postgresUrl);
    this.#redis = new Redis(config.redisUrl);

    const queueConfig: QueueConfig = {
      redisUrl: config.redisUrl,
      keyPrefix: config.queuePrefix ?? "extraction",
      defaultChannel: "extraction",
    };

    this.#emitter = new EventEmitter();
    this.#queue = new Queue(this.#redis, queueConfig, this.#emitter);

    this.#repo = new ExtractionRepository(this.#pool);
    this.#events = new EventPublisher(this.#redis, queueConfig);

    this.#worker = new ExtractionWorker(this.#repo, this.#events, {
      maxConcurrency: config.maxConcurrency ?? 3,
    });
  }

  async start(): Promise<void> {
    this.#log.info("Starting extraction service");

    await this.#repo.ensureTables();

    this.#unsubscribe = this.#queue.process<DocumentReceivedPayload>(
      "document.received",
      async (message) => {
        await this.#worker.processDocument(message);
      },
      { concurrency: 3, useDLQ: true },
    );

    this.#log.info("Extraction service started — listening for document.received events");
  }

  async stop(): Promise<void> {
    this.#log.info("Stopping extraction service");

    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }

    await this.#queue.close();
    await this.#pool.close();
    this.#log.info("Extraction service stopped");
  }
}

const postgresUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "postgres://localhost:5432/memory-platform";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const queuePrefix = process.env.QUEUE_PREFIX ?? "extraction";
const maxConcurrency = parseInt(process.env.EXTRACTION_CONCURRENCY ?? "3", 10);

const service = new ExtractionService({
  postgresUrl,
  redisUrl,
  queuePrefix,
  maxConcurrency,
});

async function main(): Promise<void> {
  initObservability("extraction-service");

  const shutdown = async () => {
    await service.stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await service.start();
}

main().catch((err) => {
  console.error("Extraction service failed to start", err);
  process.exit(1);
});

export { ExtractionWorker, ExtractionRepository, EventPublisher };
export { getExtractor } from "./extractors/index.js";
export type { Extractor, ExtractionResult, ExtractionOptions } from "./types.js";
export { ExtractionError } from "./types.js";
