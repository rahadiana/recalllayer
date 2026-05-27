import {
  createPostgresClient,
  createVectorClient,
  type PostgresPool,
  type VectorClient,
} from "@memory-platform/db";
import { initRetrievalService } from "./index.js";

const port = parseInt(process.env.PORT ?? "3005", 10);

const vectorClient: VectorClient = createVectorClient(
  process.env.QDRANT_URL ?? "http://localhost:6333",
  process.env.QDRANT_API_KEY || undefined,
);

const postgresPool: PostgresPool = createPostgresClient(
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/memory_platform",
);

const service = initRetrievalService({
  vectorClient,
  postgresPool,
});

service.start(port).catch((err) => {
  console.error("Failed to start retrieval service", err);
  process.exit(1);
});
