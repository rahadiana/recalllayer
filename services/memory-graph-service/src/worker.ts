import { performance } from "node:perf_hooks";
import type { Message } from "@memory-platform/queue";
import { createLogger, type Logger, recordMetric } from "@memory-platform/observability";
import { retry, type RetryConfig } from "@memory-platform/shared-utils";
import type {
  WorkspaceId,
  DocumentId,
  Entity,
  Relation,
  ConflictRecord,
} from "./types.js";
import type { EntityExtractor } from "./entity-extractor.js";
import type { RelationDetector } from "./relation-detector.js";
import type { GraphWriter } from "./graph-writer.js";
import type { ConflictDetector } from "./conflict-detector.js";
import type { EventPublisher } from "./events.js";
import { GraphServiceError } from "./types.js";

export interface DocumentIndexedPayload {
  document_id: string;
  chunk_count: number;
  chunks?: Array<{ id: string; text: string; document_id: string }>;
  workspace_id?: string;
}

export interface GraphWorkerConfig {
  maxConcurrency: number;
}

const DEFAULT_CONFIG: GraphWorkerConfig = {
  maxConcurrency: 3,
};

const WORKER_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 60_000,
  jitterFactor: 0.1,
  strategy: "exponential",
};

export class GraphWorker {
  #extractor: EntityExtractor;
  #detector: RelationDetector;
  #writer: GraphWriter;
  #conflictDetector: ConflictDetector;
  #events: EventPublisher;
  #log: Logger;
  #config: GraphWorkerConfig;
  #activeJobs = 0;

  constructor(deps: {
    extractor: EntityExtractor;
    detector: RelationDetector;
    writer: GraphWriter;
    conflictDetector: ConflictDetector;
    events: EventPublisher;
    config?: Partial<GraphWorkerConfig>;
  }) {
    this.#extractor = deps.extractor;
    this.#detector = deps.detector;
    this.#writer = deps.writer;
    this.#conflictDetector = deps.conflictDetector;
    this.#events = deps.events;
    this.#log = createLogger("memory-graph:worker");
    this.#config = { ...DEFAULT_CONFIG, ...deps.config };
  }

  async processDocumentIndexed(
    message: Message<DocumentIndexedPayload>,
  ): Promise<void> {
    if (this.#activeJobs >= this.#config.maxConcurrency) {
      this.#log.warn("Graph worker at capacity, requeueing", {
        documentId: message.event.payload.document_id,
        activeJobs: this.#activeJobs,
      });
      throw new Error("Worker at capacity — retry later");
    }

    this.#activeJobs++;
    const correlationId = message.event.correlationId ?? undefined;

    try {
      const payload = message.event.payload;
      const documentId = payload.document_id as DocumentId;
      const workspaceId = (payload.workspace_id ?? "default") as WorkspaceId;
      const chunks = payload.chunks ?? [];
      
      const chunkInput = chunks.map((c) => ({
        id: c.id,
        text: c.text,
        document_id: c.document_id ?? documentId,
      }));

      const start = performance.now();

      this.#log.info("Starting graph extraction pipeline", {
        documentId,
        workspaceId,
        chunkCount: chunkInput.length,
        correlationId,
      });

      await retry(
        async (attempt: number) => {
          this.#log.info("Graph extraction attempt", {
            documentId,
            attempt: attempt + 1,
          });

          const entities = this.#extractor.extractFromChunks(
            chunkInput,
            documentId,
            workspaceId,
          );

          recordMetric("graph.extraction.entities", entities.length, {
            documentId: String(documentId),
          });

          const mergedEntities = await this.#writer.mergeEntities(entities, workspaceId);

          const entityList = Array.from(mergedEntities.values());
          
          for (const entity of entityList) {
            await this.#events.publishEntityCreated(
              workspaceId,
              entity,
              documentId,
              correlationId,
            );
          }

          const relations = this.#detector.detectRelations(
            entities,
            chunkInput,
          );

          recordMetric("graph.extraction.relations", relations.length, {
            documentId: String(documentId),
          });

          const entityNameToId = new Map<string, string>();
          for (const [name, entity] of mergedEntities) {
            entityNameToId.set(name, entity.id);
          }

          const mergedRelations = await this.#writer.mergeRelations(
            relations,
            workspaceId,
            entityNameToId,
          );

          for (const relation of mergedRelations) {
            await this.#events.publishRelationCreated(
              workspaceId,
              relation,
              correlationId,
            );
          }

          const allConflicts: ConflictRecord[] = [];
          for (const entity of entityList) {
            const conflicts = await this.#conflictDetector.detectEntityConflicts(
              entity,
              workspaceId,
            );
            allConflicts.push(...conflicts);
          }

          const relationConflicts = await this.#conflictDetector.detectRelationConflicts(
            mergedRelations,
            workspaceId,
          );
          allConflicts.push(...relationConflicts);

          for (const conflict of allConflicts) {
            await this.#events.publishConflictDetected(
              workspaceId,
              conflict,
              correlationId,
            );
          }

          await this.#events.publishGraphUpdated(
            workspaceId,
            entityList.length,
            mergedRelations.length,
            documentId,
            correlationId,
          );

          const durationMs = Math.round(performance.now() - start);

          recordMetric("graph.extraction.duration_ms", durationMs, {
            documentId: String(documentId),
          });

          this.#log.info("Graph extraction pipeline completed", {
            documentId,
            entities: entityList.length,
            relations: mergedRelations.length,
            conflicts: allConflicts.length,
            durationMs,
          });
        },
        {
          ...WORKER_RETRY_CONFIG,
          onRetry: (error: unknown, attempt: number, delayMs: number) => {
            this.#log.warn("Retrying graph extraction pipeline", {
              documentId,
              attempt,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const documentId = "unknown";
      this.#log.error("Graph extraction pipeline failed", {
        documentId,
        error: message,
      });

      recordMetric("graph.extraction.failed", 1, {
        documentId,
      });

      throw err;
    } finally {
      this.#activeJobs--;
    }
  }
}

export function createGraphWorker(deps: {
  extractor: EntityExtractor;
  detector: RelationDetector;
  writer: GraphWriter;
  conflictDetector: ConflictDetector;
  events: EventPublisher;
  config?: Partial<GraphWorkerConfig>;
}): GraphWorker {
  return new GraphWorker(deps);
}
