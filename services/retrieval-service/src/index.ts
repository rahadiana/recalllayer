import express from "express";
import { createLogger } from "@memory-platform/observability";
import type { VectorClient, PostgresPool } from "@memory-platform/db";
import type { RerankerProvider } from "@memory-platform/llm";
import { createSearchRouter } from "./routes/search.js";
import { createContextRouter } from "./routes/context.js";
import { createSearchTracker, type SearchTracker } from "./tracker.js";
import type { RetrievalServiceConfig } from "./types.js";

export interface RetrievalServiceDeps {
  vectorClient: VectorClient;
  postgresPool: PostgresPool;
  rerankerProvider?: RerankerProvider;
  config?: RetrievalServiceConfig;
  searchTracker?: SearchTracker;
}

export interface RetrievalService {
  app: express.Application;
  tracker: SearchTracker;
  start(port: number): Promise<void>;
}

export function initRetrievalService(deps: RetrievalServiceDeps): RetrievalService {
  const logger = createLogger("retrieval:service");
  const app = express();
  const tracker = deps.searchTracker ?? createSearchTracker();

  app.use(express.json({ limit: "1mb" }));

  const searchRouter = createSearchRouter(
    deps.vectorClient,
    deps.postgresPool,
    deps.rerankerProvider,
    tracker,
  );

  const contextRouter = createContextRouter();

  app.use(searchRouter);
  app.use(contextRouter);

  app.get("/health", (_req, res) => {
    res.json({
      status: "healthy",
      service: "retrieval-service",
      timestamp: new Date().toISOString(),
    });
  });

  logger.info("Retrieval Service initialized");

  return {
    app,
    tracker,

    async start(port: number): Promise<void> {
      return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
          logger.info(`Retrieval Service listening on port ${port}`);
          resolve();
        });

        server.on("error", (err) => {
          logger.error("Server startup failed", { error: String(err) });
          reject(err);
        });
      });
    },
  };
}

export {
  createSearchTracker,
  type SearchTracker,
};

export type {
  RetrievalServiceConfig,
  SearchRequest,
  ContextRequest,
  ContextPassageRequest,
} from "./types.js";
