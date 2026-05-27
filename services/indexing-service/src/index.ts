import Redis from "ioredis";
import { EventEmitter } from "node:events";
import { Queue } from "@memory-platform/queue";
import { initDatabases } from "@memory-platform/db";
import { OpenAIEmbeddingProvider } from "@memory-platform/llm";
import { initObservability, createLogger, registerCheck } from "@memory-platform/observability";
import type { ConnectionConfig } from "@memory-platform/db";
import type { EmbeddingProvider } from "@memory-platform/llm";
import { createChunker, type ChunkStrategy } from "./chunker.js";
import { createEmbeddingWorker, type EmbeddingWorker } from "./embedder.js";
import { createIndexWriter, type IndexWriter } from "./indexer.js";
import { createIndexRepository, type IndexRepository } from "./repository.js";
import {
  IndexingEventPublisher,
  setupConsumer,
  type IndexingEventHandlers,
} from "./events.js";
import { createIndexingWorker, type IndexingWorker } from "./worker.js";
import type {
  ChunkerOptions,
  EmbedderOptions,
  IndexerOptions,
} from "./types.js";

interface IndexingServiceConfig {
  redisUrl: string;
  queuePrefix: string;
  db: ConnectionConfig;
  chunker: Partial<ChunkerOptions>;
  embedder: Partial<EmbedderOptions>;
  indexer: Partial<IndexerOptions>;
  embeddingProvider?: EmbeddingProvider;
  consumeChannel: string;
  publishChannel: string;
}

const DEFAULT_CONFIG: IndexingServiceConfig = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  queuePrefix: process.env.QUEUE_PREFIX ?? "memory",
  db: {
    postgresUrl: process.env.DATABASE_URL,
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
    qdrantApiKey: process.env.QDRANT_API_KEY,
  },
  chunker: {},
  embedder: {},
  indexer: {},
  consumeChannel: "document.extracted",
  publishChannel: "indexing.events",
};

export async function startIndexingService(
  config: Partial<IndexingServiceConfig> = {},
): Promise<{ close: () => Promise<void> }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const logger = createLogger("indexing-service");

  logger.info("Starting Indexing Service");

  initObservability("indexing-service");

  const dbClients = await initDatabases(cfg.db);

  const embeddingProvider =
    cfg.embeddingProvider ?? new OpenAIEmbeddingProvider();

  const redis = new Redis(cfg.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  await redis.connect();

  const events = new EventEmitter();
  const queue = new Queue(redis, {
    redisUrl: cfg.redisUrl,
    keyPrefix: cfg.queuePrefix,
    defaultChannel: cfg.publishChannel,
    enableDLQ: true,
  }, events);

  const chunker = createChunker();
  const embedder = createEmbeddingWorker(cfg.embedder, embeddingProvider);
  const indexWriter = createIndexWriter(
    dbClients.vector ?? null,
    dbClients.postgres ?? null,
    cfg.indexer,
  );
  const repository = createIndexRepository(dbClients.postgres ?? null);
  const publisher = new IndexingEventPublisher(queue, cfg.publishChannel);

  const indexingWorker = createIndexingWorker({
    chunker,
    embedder,
    indexer: indexWriter,
    repository,
    publisher,
    chunkerOptions: cfg.chunker,
  });

  const handlers: IndexingEventHandlers = {
    onDocumentExtracted: async (document, extracted, correlationId) => {
      try {
        await indexingWorker.indexDocument(document, extracted, correlationId);
      } catch (error) {
        logger.error("Document indexing failed in handler", {
          documentId: extracted.document_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };

  const unsubscribe = setupConsumer(queue, handlers, cfg.consumeChannel);

  registerCheck("queue", async () => {
    try {
      const depth = await queue.depth(cfg.consumeChannel);
      return {
        status: "healthy",
        latencyMs: 0,
        message: `Queue depth: ${depth}`,
        checkedAt: new Date(),
      };
    } catch {
      return {
        status: "unhealthy",
        latencyMs: 0,
        message: "Queue health check failed",
        checkedAt: new Date(),
      };
    }
  });

  registerCheck("databases", async () => {
    const health = await dbClients.health();
    const allHealthy = Object.values(health).every(
      (h: { status: string }) => h.status === "healthy",
    );
    return {
      status: allHealthy ? "healthy" : "degraded",
      latencyMs: 0,
      message: JSON.stringify(health),
      checkedAt: new Date(),
    };
  });

  logger.info("Indexing Service started", {
    consumeChannel: cfg.consumeChannel,
    publishChannel: cfg.publishChannel,
    vectorCollection: cfg.indexer.vectorCollection ?? "memory_chunks",
  });

  return {
    close: async () => {
      logger.info("Shutting down Indexing Service");
      unsubscribe();
      await queue.close();
      await indexWriter.close();
      await dbClients.close();
      logger.info("Indexing Service shut down");
    },
  };
}

export type {
  IndexingServiceConfig,
  ChunkStrategy,
  EmbeddingWorker,
  IndexWriter,
  IndexRepository,
  IndexingWorker,
};

export {
  createChunker,
  createEmbeddingWorker,
  createIndexWriter,
  createIndexRepository,
  createIndexingWorker,
  IndexingEventPublisher,
  setupConsumer,
};
