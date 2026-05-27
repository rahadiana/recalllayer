import type { Session as Neo4jSession } from "neo4j-driver";
import type { GraphClient } from "@memory-platform/db";
import { createLogger, recordMetric } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type {
  ConflictRecord,
  ConflictType,
  Entity,
  Relation,
  WorkspaceId,
  EntityId,
  Timestamp,
} from "./types.js";

export interface ConflictDetector {
  detectEntityConflicts(entity: Entity, workspaceId: WorkspaceId): Promise<ConflictRecord[]>;
  detectRelationConflicts(relations: Relation[], workspaceId: WorkspaceId): Promise<ConflictRecord[]>;
  detectDuplicateEntities(entities: Entity[], workspaceId: WorkspaceId): Promise<ConflictRecord[]>;
  resolveConflict(conflictId: string, resolvedBy: string): ConflictRecord;
}

export function createConflictDetector(graphClient: GraphClient): ConflictDetector {
  const log = createLogger("memory-graph:conflict-detector");

  function session(): Neo4jSession {
    return graphClient.driver.session({ database: "neo4j" });
  }

  async function detectEntityConflicts(
    entity: Entity,
    workspaceId: WorkspaceId,
  ): Promise<ConflictRecord[]> {
    const conflicts: ConflictRecord[] = [];
    const s = session();

    try {
      const result = await s.run(
        `
        MATCH (e1:Entity {id: $entityId, workspace_id: $workspaceId})
        MATCH (e2:Entity)
        WHERE e2.workspace_id = $workspaceId
          AND e2.id <> e1.id
          AND (
            e2.name = e1.name
            OR any(alias IN e1.aliases WHERE alias IN e2.aliases)
            OR any(alias IN e1.aliases WHERE alias = e2.name)
          )
        RETURN e2 { .id, .name, .entity_type, .aliases, .properties }
          AS duplicate
        `,
        { entityId: entity.id, workspaceId },
      );

      for (const record of result.records) {
        const duplicate = record.get("duplicate") as Record<string, unknown>;
        if (!duplicate) continue;

        conflicts.push({
          id: `conflict_${generateId()}`,
          conflict_type: "duplicate_entity",
          workspace_id: workspaceId,
          entity_ids: [entity.id, duplicate.id as EntityId],
          description: `Possible duplicate entity: "${entity.name}" and "${duplicate.name}"`,
          conflicting_facts: {
            entity_a: { id: entity.id, name: entity.name, type: entity.entity_type },
            entity_b: { id: duplicate.id, name: duplicate.name, type: duplicate.entity_type },
          },
          needs_review: true,
          status: "open",
          detected_at: new Date().toISOString() as Timestamp,
        });
      }

      const propResult = await s.run(
        `
        MATCH (e:Entity {id: $entityId, workspace_id: $workspaceId})
        OPTIONAL MATCH (e)<-[r_in]-(other:Entity)
        OPTIONAL MATCH (e)-[r_out]->(other2:Entity)
        WHERE r_in.relation_type = r_out.relation_type
          AND other <> other2
        RETURN DISTINCT r_in.relation_type AS relType,
               collect(DISTINCT other.id) AS inTargets,
               collect(DISTINCT other2.id) AS outTargets
        `,
        { entityId: entity.id, workspaceId },
      );

      for (const record of propResult.records) {
        const relType = record.get("relType") as string;
        const inTargets = (record.get("inTargets") as string[]) ?? [];
        const outTargets = (record.get("outTargets") as string[]) ?? [];

        if (relType && inTargets.length > 0 && outTargets.length > 0) {
          const mutualTargets = inTargets.filter((id) => outTargets.includes(id));
          if (mutualTargets.length > 0) {
            conflicts.push({
              id: `conflict_${generateId()}`,
              conflict_type: "mutually_exclusive_relation",
              workspace_id: workspaceId,
              entity_ids: [entity.id, ...mutualTargets.map((id) => id as EntityId)],
              description: `Entity has bi-directional ${relType} relations with same entities, possibly contradictory`,
              conflicting_facts: {
                entity_id: entity.id,
                relation_type: relType,
                mutual_targets: mutualTargets,
              },
              needs_review: true,
              status: "open",
              detected_at: new Date().toISOString() as Timestamp,
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("Conflict detection failed for entity", { entityId: entity.id, error: message });
    } finally {
      await s.close();
    }

    if (conflicts.length > 0) {
      log.info("Conflicts detected for entity", { entityId: entity.id, conflictCount: conflicts.length });
      recordMetric("graph.conflicts.detected", conflicts.length, { type: "entity" });
    }

    return conflicts;
  }

  async function detectRelationConflicts(
    relations: Relation[],
    workspaceId: WorkspaceId,
  ): Promise<ConflictRecord[]> {
    const conflicts: ConflictRecord[] = [];

    for (const relation of relations) {
      const s = session();
      try {
        const result = await s.run(
          `
          MATCH (source:Entity {id: $sourceId, workspace_id: $workspaceId})
          MATCH (target:Entity {id: $targetId, workspace_id: $workspaceId})
          MATCH (source)-[r:${relation.relation_type.toUpperCase()}]->(target)
          WHERE r.id <> $relationId
          RETURN r.confidence AS existing_confidence
          ORDER BY r.confidence DESC
          LIMIT 1
          `,
          {
            sourceId: relation.source_entity_id,
            targetId: relation.target_entity_id,
            relationId: relation.id,
            workspaceId,
          },
        );

        const existingConf = result.records[0]?.get("existing_confidence") as number | undefined;

        if (existingConf !== undefined && Math.abs(existingConf - relation.confidence) > 0.4) {
          conflicts.push({
            id: `conflict_${generateId()}`,
            conflict_type: "contradictory_property",
            workspace_id: workspaceId,
            entity_ids: [relation.source_entity_id, relation.target_entity_id],
            relation_ids: [relation.id],
            description: `Relation ${relation.relation_type} has significantly different confidence scores (${relation.confidence.toFixed(2)} vs ${existingConf.toFixed(2)})`,
            conflicting_facts: {
              relation_id: relation.id,
              new_confidence: relation.confidence,
              existing_confidence: existingConf,
            },
            needs_review: true,
            status: "open",
            detected_at: new Date().toISOString() as Timestamp,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("Relation conflict detection failed", { relationId: relation.id, error: message });
      } finally {
        await s.close();
      }
    }

    if (conflicts.length > 0) {
      recordMetric("graph.conflicts.detected", conflicts.length, { type: "relation" });
    }

    return conflicts;
  }

  async function detectDuplicateEntities(
    entities: Entity[],
    workspaceId: WorkspaceId,
  ): Promise<ConflictRecord[]> {
    const conflicts: ConflictRecord[] = [];
    const seen = new Map<string, Entity>();

    for (const entity of entities) {
      const key = entity.name.toLowerCase();
      const existing = seen.get(key);
      if (existing) {
        conflicts.push({
          id: `conflict_${generateId()}`,
          conflict_type: "duplicate_entity",
          workspace_id: workspaceId,
          entity_ids: [existing.id, entity.id],
          description: `Duplicate entity name found: "${entity.name}"`,
          conflicting_facts: {
            entity_a: { id: existing.id, name: existing.name, type: existing.entity_type },
            entity_b: { id: entity.id, name: entity.name, type: entity.entity_type },
          },
          needs_review: true,
          status: "open",
          detected_at: new Date().toISOString() as Timestamp,
        });
      } else {
        seen.set(key, entity);
      }
    }

    return conflicts;
  }

  function resolveConflict(conflictId: string, resolvedBy: string): ConflictRecord {
    log.info("Conflict resolved", { conflictId, resolvedBy });
    return {
      id: conflictId,
      conflict_type: "duplicate_entity",
      workspace_id: "" as WorkspaceId,
      entity_ids: [],
      description: "Resolved",
      conflicting_facts: {},
      needs_review: false,
      status: "resolved",
      resolved_by: resolvedBy,
      detected_at: "" as Timestamp,
      resolved_at: new Date().toISOString() as Timestamp,
    };
  }

  return {
    detectEntityConflicts,
    detectRelationConflicts,
    detectDuplicateEntities,
    resolveConflict,
  };
}
