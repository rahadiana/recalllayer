import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import {
  Publisher,
  type QueueConfig,
  type EventEnvelope,
} from "@memory-platform/queue";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type {
  WorkspaceId,
  EntityId,
  Entity,
  Relation,
  ConflictRecord,
} from "./types.js";

export interface EntityCreatedPayload {
  entity_id: string;
  entity_type: string;
  name: string;
  document_id: string;
}

export interface RelationCreatedPayload {
  relation_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
}

export interface GraphUpdatedPayload {
  workspace_id: string;
  entity_count: number;
  relation_count: number;
  document_id: string;
}

export class EventPublisher {
  #publisher: Publisher;
  #log: Logger;
  #channel: string;

  constructor(redis: Redis, config: QueueConfig) {
    const events = new EventEmitter();
    this.#publisher = new Publisher(redis, config, events, "memory-graph-service");
    this.#log = createLogger("memory-graph:events");
    this.#channel = config.defaultChannel ?? "graph.events";

    events.on("queue:published", (envelope, channel) => {
      this.#log.debug("Event published", {
        eventType: (envelope as EventEnvelope).type,
        channel: channel as string,
      });
    });

    events.on("queue:error", (_msg, error) => {
      this.#log.error("Event publish error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async publishEntityCreated(
    workspaceId: WorkspaceId,
    entity: Entity,
    documentId: string,
    correlationId?: string,
  ): Promise<string> {
    const payload: EntityCreatedPayload = {
      entity_id: entity.id,
      entity_type: entity.entity_type,
      name: entity.name,
      document_id: documentId,
    };

    const envelope: EventEnvelope<EntityCreatedPayload> = {
      id: generateId(),
      type: "graph.entity_created",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing entity.created", {
      entityId: entity.id,
      name: entity.name,
      entityType: entity.entity_type,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }

  async publishRelationCreated(
    workspaceId: WorkspaceId,
    relation: Relation,
    correlationId?: string,
  ): Promise<string> {
    const payload: RelationCreatedPayload = {
      relation_id: relation.id,
      source_entity_id: relation.source_entity_id,
      target_entity_id: relation.target_entity_id,
      relation_type: relation.relation_type,
    };

    const envelope: EventEnvelope<RelationCreatedPayload> = {
      id: generateId(),
      type: "graph.relation_created",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing relation.created", {
      relationId: relation.id,
      type: relation.relation_type,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }

  async publishGraphUpdated(
    workspaceId: WorkspaceId,
    entityCount: number,
    relationCount: number,
    documentId: string,
    correlationId?: string,
  ): Promise<string> {
    const payload: GraphUpdatedPayload = {
      workspace_id: workspaceId,
      entity_count: entityCount,
      relation_count: relationCount,
      document_id: documentId,
    };

    const envelope: EventEnvelope<GraphUpdatedPayload> = {
      id: generateId(),
      type: "graph.updated",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing graph.updated", {
      workspaceId,
      entityCount,
      relationCount,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }

  async publishConflictDetected(
    workspaceId: WorkspaceId,
    conflict: ConflictRecord,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<ConflictRecord> = {
      id: generateId(),
      type: "graph.conflict_detected",
      timestamp: new Date().toISOString(),
      payload: conflict,
      correlationId,
    };

    this.#log.info("Publishing graph.conflict_detected", {
      conflictId: conflict.id,
      conflictType: conflict.conflict_type,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }
}
