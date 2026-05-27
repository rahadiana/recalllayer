import express from "express";
import { EventEmitter } from "node:events";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { PostgresPool, RedisPool } from "@memory-platform/db";
import { Queue, Publisher } from "@memory-platform/queue";
import { createEvalRepository, type EvalRepository } from "./repository.js";
import { createEvalEvents, type EvalEventPublisher } from "./events.js";
import { createMetricsCalculator, type MetricsCalculator } from "./metrics-calculator.js";
import { createRagAnalyzer, type RagAnalyzer } from "./rag-analyzer.js";
import { createFeedbackCollector, type FeedbackCollector } from "./feedback-collector.js";
import { createEvalRunner, type EvalRunner, type RetrievalClient } from "./eval-runner.js";
import { createEvalRouter } from "./routes/eval.js";
import { registerWorker } from "./worker.js";
import type { EvaluationServiceConfig } from "./types.js";

export interface EvaluationServiceDeps {
  postgresPool: PostgresPool;
  redisPool: RedisPool;
  retrievalClient: RetrievalClient;
  config?: Partial<EvaluationServiceConfig>;
}

export interface EvaluationService {
  app: express.Application;
  repository: EvalRepository;
  events: EvalEventPublisher;
  close(): Promise<void>;
  start(port: number): Promise<void>;
}

export function initEvaluationService(deps: EvaluationServiceDeps): EvaluationService {
  const logger: Logger = createLogger("evaluation:service");
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  const repository: EvalRepository = createEvalRepository(deps.postgresPool);

  const eventsEmitter = new EventEmitter();
  const queue = new Queue(deps.redisPool.client, {
    redisUrl: "",
    keyPrefix: "memory-platform:eval",
    defaultChannel: "evaluation",
  }, eventsEmitter as import("node:events").EventEmitter & {
    emit(event: string, ...args: unknown[]): boolean;
    on(event: string, listener: (...args: unknown[]) => void): EventEmitter;
    removeListener(event: string, listener: (...args: unknown[]) => void): EventEmitter;
  });

  const events: EvalEventPublisher = createEvalEvents(queue.publisher, logger);

  const metricsCalculator: MetricsCalculator = createMetricsCalculator();
  const ragAnalyzer: RagAnalyzer = createRagAnalyzer();

  const evalRunner: EvalRunner = createEvalRunner(
    repository,
    metricsCalculator,
    ragAnalyzer,
    events,
    deps.retrievalClient,
    deps.config,
  );

  const feedbackCollector: FeedbackCollector = createFeedbackCollector(
    repository,
    events,
  );

  const evalRouter = createEvalRouter(repository, evalRunner, events);
  app.use(evalRouter);

  const unregisterWorker = registerWorker(
    queue,
    repository,
    evalRunner,
    feedbackCollector,
  );

  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      service: "evaluation-service",
      timestamp: new Date().toISOString(),
    });
  });

  logger.info("Evaluation Service initialized");

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    app,
    repository,
    events,

    async start(port: number): Promise<void> {
      return new Promise((resolve, reject) => {
        server = app.listen(port, () => {
          logger.info(`Evaluation Service listening on port ${port}`);
          resolve();
        });

        server.on("error", (err) => {
          logger.error("Server startup failed", { error: String(err) });
          reject(err);
        });
      });
    },

    async close(): Promise<void> {
      logger.info("Shutting down Evaluation Service");
      unregisterWorker();
      await queue.close();
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      logger.info("Evaluation Service closed");
    },
  };
}

export {
  createEvalRepository,
  createEvalEvents,
  createMetricsCalculator,
  createRagAnalyzer,
  createFeedbackCollector,
  createEvalRunner,
  createEvalRouter,
  registerWorker,
};

export type {
  EvalRepository,
  EvalEventPublisher,
  MetricsCalculator,
  RagAnalyzer,
  FeedbackCollector,
  EvalRunner,
  RetrievalClient,
  EvaluationServiceConfig,
};
