import type { Session as Neo4jSession } from "neo4j-driver";
import type { GraphClient } from "@memory-platform/db";
import { createLogger, recordMetric } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type {
  ExtractedEntityCandidate,
  ExtractedRelationCandidate,
  Entity,
  Relation,
  WorkspaceId,
  EntityId,
  Timestamp,
} from "./types.js";
import { GraphServiceError } from "./types.js";

export interface GraphWriter {
  mergeEntity(candidate: ExtractedEntityCandidate, workspaceId: WorkspaceId): Promise<Entity>;
  mergeEntities(candidates: ExtractedEntityCandidate[], workspaceId: WorkspaceId): Promise<Map<string, Entity>>;
  mergeRelation(candidate: ExtractedRelationCandidate, workspaceId: WorkspaceId, entityNameToId: Map<string, string>): Promise<Relation | null>;
  mergeRelations(candidates: ExtractedRelationCandidate[], workspaceId: WorkspaceId, entityNameToId: Map<string, string>): Promise<Relation[]>;
  ensureConstraints(): Promise<void>;
  deleteEntity(entityId: EntityId, workspaceId: WorkspaceId): Promise<void>;
}

export function createGraphWriter(graphClient: GraphClient): GraphWriter {
  const log = createLogger("memory-graph:writer");

  function session(): Neo4jSession {
    return graphClient.driver.session({ database: "neo4j" });
  }

  async function ensureConstraints(): Promise<void> {
    const s = session();
    try {
      await s.run(`
        CREATE CONSTRAINT entity_id_unique IF NOT EXISTS
        FOR (e:Entity) REQUIRE e.id IS UNIQUE
      `);
      log.info("Neo4j constraints ensured");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("Could not ensure constraints (may already exist)", { error: message });
      // Non-fatal — constraints may already exist
    } finally {
      await s.close();
    }
  }

  async function mergeEntity(
    candidate: ExtractedEntityCandidate,
    workspaceId: WorkspaceId,
  ): Promise<Entity> {
    const s = session();
    const id = `ent_${generateId()}`;
    const now = new Date().toISOString() as Timestamp;
    const propsJson = JSON.stringify(candidate.properties);

    try {
      const result = await s.run(
        `
        MERGE (e:Entity {workspace_id: $workspaceId, name: $name})
        ON CREATE SET
          e.id = $id,
          e.entity_type = $entityType,
          e.aliases = $aliases,
          e.properties = $properties,
          e.source_document_ids = $sourceDocIds,
          e.confidence = $confidence,
          e.created_at = $now,
          e.updated_at = $now,
          e.chunk_ids = $chunkIds,
          e.evidence_spans = $evidenceSpans
        ON MATCH SET
          e.updated_at = $now,
          e.confidence = CASE WHEN $confidence > e.confidence THEN $confidence ELSE e.confidence END,
          e.source_document_ids = CASE
            WHEN $sourceDocIds[0] IN e.source_document_ids THEN e.source_document_ids
            ELSE e.source_document_ids + $sourceDocIds
          END
        RETURN e { .id, .workspace_id, .entity_type, .name, .aliases, .properties,
                     .source_document_ids, .confidence, .created_at, .updated_at,
                     .chunk_ids, .evidence_spans }
          AS entity
        `,
        {
          id,
          workspaceId,
          name: candidate.name,
          entityType: candidate.entity_type,
          aliases: candidate.aliases,
          properties: propsJson,
          sourceDocIds: [candidate.source_document_id],
          confidence: candidate.confidence,
          now,
          chunkIds: candidate.source_chunk_ids,
          evidenceSpans: candidate.evidence_spans,
        },
      );

      const record = result.records[0];
      const entityData = record?.get("entity");
      if (!entityData) {
        throw new GraphServiceError("Failed to merge entity — no result", {
          code: "NEO4J_WRITE_ERROR",
          retryable: true,
        });
      }

      const entity: Entity = {
        id: entityData.id as EntityId,
        workspace_id: entityData.workspace_id as WorkspaceId,
        entity_type: entityData.entity_type as string,
        name: entityData.name as string,
        aliases: entityData.aliases ?? [],
        properties: typeof entityData.properties === "string"
          ? JSON.parse(entityData.properties)
          : (entityData.properties as Record<string, unknown>) ?? {},
        source_document_ids: entityData.source_document_ids ?? [],
        confidence: entityData.confidence as number,
        created_at: entityData.created_at as Timestamp,
        updated_at: entityData.updated_at as Timestamp,
      };

      recordMetric("graph.entities.merged", 1, {
        entity_type: entity.entity_type,
        is_new: entityData.created_at === entityData.updated_at ? "true" : "false",
      });

      return entity;
    } catch (err) {
      if (err instanceof GraphServiceError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new GraphServiceError("Failed to merge entity", {
        code: "NEO4J_WRITE_ERROR",
        retryable: true,
        context: { entityName: candidate.name, error: message },
      });
    } finally {
      await s.close();
    }
  }

  async function mergeEntities(
    candidates: ExtractedEntityCandidate[],
    workspaceId: WorkspaceId,
  ): Promise<Map<string, Entity>> {
    const result = new Map<string, Entity>();
    for (const candidate of candidates) {
      try {
        const entity = await mergeEntity(candidate, workspaceId);
        result.set(candidate.name, entity);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("Skipping entity merge due to error", { entityName: candidate.name, error: message });
      }
    }
    return result;
  }

  async function mergeRelation(
    candidate: ExtractedRelationCandidate,
    workspaceId: WorkspaceId,
    entityNameToId: Map<string, string>,
  ): Promise<Relation | null> {
    const sourceId = entityNameToId.get(candidate.source_entity_name);
    const targetId = entityNameToId.get(candidate.target_entity_name);
    if (!sourceId || !targetId) return null;

    const s = session();
    const id = `rel_${generateId()}`;
    const now = new Date().toISOString() as Timestamp;
    const relType = candidate.relation_type.toUpperCase().replace(/[^A-Z_]/g, "_");
    const propsJson = JSON.stringify(candidate.properties);

    try {
      const query = `
        MATCH (source:Entity {id: $sourceId, workspace_id: $workspaceId})
        MATCH (target:Entity {id: $targetId, workspace_id: $workspaceId})
        MERGE (source)-[r:${relType}]->(target)
        ON CREATE SET
          r.id = $id,
          r.workspace_id = $workspaceId,
          r.source_entity_id = $sourceId,
          r.target_entity_id = $targetId,
          r.relation_type = $relationType,
          r.properties = $properties,
          r.confidence = $confidence,
          r.created_at = $now,
          r.updated_at = $now,
          r.evidence_spans = $evidenceSpans
        ON MATCH SET
          r.updated_at = $now,
          r.confidence = CASE WHEN $confidence > r.confidence THEN $confidence ELSE r.confidence END
        RETURN r { .id, .workspace_id, .source_entity_id, .target_entity_id, .relation_type,
                    .properties, .confidence, .created_at, .updated_at }
          AS relation
      `;

      const result = await s.run(query, {
        id, workspaceId, sourceId, targetId,
        relationType: candidate.relation_type,
        properties: propsJson,
        confidence: candidate.confidence,
        now,
        evidenceSpans: candidate.evidence_spans,
      });

      const relData = result.records[0]?.get("relation");
      if (!relData) return null;

      recordMetric("graph.relations.merged", 1, { relation_type: candidate.relation_type });

      return {
        id: relData.id as string,
        workspace_id: relData.workspace_id as WorkspaceId,
        source_entity_id: relData.source_entity_id as EntityId,
        target_entity_id: relData.target_entity_id as EntityId,
        relation_type: relData.relation_type as string,
        properties: typeof relData.properties === "string"
          ? JSON.parse(relData.properties)
          : (relData.properties as Record<string, unknown>) ?? {},
        source_document_ids: [],
        confidence: relData.confidence as number,
        created_at: relData.created_at as Timestamp,
        updated_at: relData.updated_at as Timestamp,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("Failed to merge relation", { sourceId, targetId, error: message });
      return null;
    } finally {
      await s.close();
    }
  }

  async function mergeRelations(
    candidates: ExtractedRelationCandidate[],
    workspaceId: WorkspaceId,
    entityNameToId: Map<string, string>,
  ): Promise<Relation[]> {
    const results: Relation[] = [];
    for (const candidate of candidates) {
      const relation = await mergeRelation(candidate, workspaceId, entityNameToId);
      if (relation) results.push(relation);
    }
    log.info("Relations merged", { candidateCount: candidates.length, mergedCount: results.length });
    return results;
  }

  async function deleteEntity(entityId: EntityId, workspaceId: WorkspaceId): Promise<void> {
    const s = session();
    try {
      await s.run(
        `MATCH (e:Entity {id: $entityId, workspace_id: $workspaceId}) DETACH DELETE e`,
        { entityId, workspaceId },
      );
      recordMetric("graph.entities.deleted", 1, {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new GraphServiceError("Failed to delete entity", {
        code: "NEO4J_DELETE_ERROR",
        retryable: true,
        context: { entityId, error: message },
      });
    } finally {
      await s.close();
    }
  }

  return { mergeEntity, mergeEntities, mergeRelation, mergeRelations, ensureConstraints, deleteEntity };
}
