import type { Session as Neo4jSession } from "neo4j-driver";
import type { GraphClient } from "@memory-platform/db";
import { createLogger, traceAsync } from "@memory-platform/observability";
import type {
  WorkspaceId,
  EntityId,
  Entity,
  TraversalResult,
  TraversalNode,
  TraversalEdge,
  TraversalPath,
  GraphQueryRequest,
} from "./types.js";
import { GraphServiceError } from "./types.js";

export interface GraphReader {
  getEntity(entityId: EntityId, workspaceId: WorkspaceId): Promise<Entity | null>;
  queryGraph(query: GraphQueryRequest): Promise<TraversalResult>;
  getNeighbors(entityId: EntityId, workspaceId: WorkspaceId, relationTypes?: string[], entityTypes?: string[], maxResults?: number): Promise<TraversalResult>;
  findPaths(sourceId: EntityId, targetId: EntityId, workspaceId: WorkspaceId, maxDepth?: number, maxPaths?: number): Promise<TraversalResult>;
}

export function createGraphReader(graphClient: GraphClient): GraphReader {
  const log = createLogger("memory-graph:reader");

  function session(): Neo4jSession {
    return graphClient.driver.session({ database: "neo4j" });
  }

  async function getEntity(entityId: EntityId, workspaceId: WorkspaceId): Promise<Entity | null> {
    return traceAsync("graph.reader.getEntity", { entityId }, async () => {
      const s = session();
      try {
        const result = await s.run(
          `MATCH (e:Entity {id: $entityId, workspace_id: $workspaceId})
           RETURN e { .id, .workspace_id, .entity_type, .name, .aliases, .properties,
                       .source_document_ids, .confidence, .created_at, .updated_at }
             AS entity`,
          { entityId, workspaceId },
        );

        const entityData = result.records[0]?.get("entity");
        if (!entityData) return null;

        return {
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
          created_at: entityData.created_at as string,
          updated_at: entityData.updated_at as string,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new GraphServiceError("Failed to get entity", {
          code: "NEO4J_READ_ERROR",
          retryable: true,
          context: { entityId, error: message },
        });
      } finally {
        await s.close();
      }
    });
  }

  async function queryGraph(query: GraphQueryRequest): Promise<TraversalResult> {
    return traceAsync("graph.reader.queryGraph", {
      workspaceId: query.workspace_id,
      seedCount: query.seed_entity_ids.length,
    }, async () => {
      const maxDepth = query.max_depth ?? 2;
      const maxNodes = query.max_nodes ?? 100;
      const minConf = query.min_confidence ?? 0;
      const returnPaths = query.return_paths ?? false;
      const relationTypes = query.relation_types ?? [];
      const entityTypes = query.entity_types ?? [];

      const relTypeFilter = relationTypes.length > 0
        ? `WHERE type(r) IN [${relationTypes.map((t) => `'${t.toUpperCase().replace(/[^A-Z_]/g, "_")}'`).join(", ")}]`
        : "";

      const entityTypeFilter = entityTypes.length > 0
        ? `WHERE e.entity_type IN [${entityTypes.map((t) => `'${t}'`).join(", ")}]`
        : "";

      const seedIds = query.seed_entity_ids.map((id) => `'${id}'`).join(", ");

      const s = session();
      try {
        const cypher = `
          MATCH (start:Entity)
          WHERE start.id IN [${seedIds}] AND start.workspace_id = $workspaceId
          MATCH path = (start)-[r*1..${maxDepth}]-(e:Entity)
          WHERE e.workspace_id = $workspaceId
          ${relTypeFilter.replace("type(r)", "all(rel in relationships(path) WHERE type(rel)")}${relTypeFilter ? ")" : ""}
          ${entityTypeFilter}
          WITH path, nodes(path) AS pathNodes, relationships(path) AS pathRels
          UNWIND pathRels AS rel
          WHERE rel.confidence >= $minConf
          WITH path, pathNodes, collect(DISTINCT rel) AS filteredRels
          WITH path, pathNodes, filteredRels,
               reduce(ids = [], n IN pathNodes | ids + n.id) AS allNodeIds
          UNWIND pathNodes AS node
          WITH DISTINCT node, allNodeIds, filteredRels, path
          LIMIT ${maxNodes}
          RETURN collect(DISTINCT node { .id, labels: labels(node),
                          .name, .entity_type, .properties, .confidence })
                   AS nodes,
                 collect(DISTINCT filteredRels) AS edges,
                 collect(path) AS paths
        `;

        const result = await s.run(cypher, { workspaceId: query.workspace_id, minConf });

        if (result.records.length === 0) {
          return { nodes: [], edges: [], total_nodes: 0, total_edges: 0, max_depth_reached: 0 };
        }

        const record = result.records[0];
        const rawNodes = (record.get("nodes") as Record<string, unknown>[]) ?? [];
        const rawEdges = (record.get("edges") as Record<string, unknown>[][]) ?? [];
        const rawPaths = returnPaths ? ((record.get("paths") as Record<string, unknown>[]) ?? []) : [];

        const nodes: TraversalNode[] = rawNodes.map((n: Record<string, unknown>) => ({
          id: n.id as EntityId,
          labels: (n.labels as string[]) ?? [(n.entity_type as string) ?? "Entity"],
          properties: typeof n.properties === "string"
            ? JSON.parse(n.properties as string)
            : (n.properties as Record<string, unknown>) ?? {},
        }));

        const edges: TraversalEdge[] = [];
        for (const relGroup of rawEdges) {
          for (const rel of relGroup) {
            edges.push({
              id: rel.id as string,
              type: (rel.type as string) ?? (rel.relation_type as string) ?? "RELATED",
              source_id: (rel.source_entity_id ?? (rel.startNodeElementId ?? "")) as EntityId,
              target_id: (rel.target_entity_id ?? (rel.endNodeElementId ?? "")) as EntityId,
              properties: typeof rel.properties === "string"
                ? JSON.parse(rel.properties as string)
                : (rel.properties as Record<string, unknown>) ?? {},
            });
          }
        }

        const paths: TraversalPath[] = [];
        if (returnPaths && rawPaths.length > 0) {
          for (const path of rawPaths) {
            const pathNodesData = (path as Record<string, unknown>).nodes ?? path;
            paths.push({ nodes: [], edges: [], length: 0 });
          }
        }

        const uniqueNodeIds = new Set(nodes.map((n) => n.id));
        const uniqueEdgeIds = new Set(edges.map((e) => e.id));

        return {
          nodes: nodes.filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i),
          edges: edges.filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i),
          paths: returnPaths ? paths : undefined,
          total_nodes: uniqueNodeIds.size,
          total_edges: uniqueEdgeIds.size,
          max_depth_reached: maxDepth,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new GraphServiceError("Failed to query graph", {
          code: "NEO4J_READ_ERROR",
          retryable: true,
          context: { error: message },
        });
      } finally {
        await s.close();
      }
    });
  }

  async function getNeighbors(
    entityId: EntityId,
    workspaceId: WorkspaceId,
    relationTypes?: string[],
    entityTypes?: string[],
    maxResults = 50,
  ): Promise<TraversalResult> {
    return queryGraph({
      workspace_id: workspaceId,
      seed_entity_ids: [entityId],
      max_depth: 1,
      max_nodes: maxResults,
      relation_types: relationTypes,
      entity_types: entityTypes,
    });
  }

  async function findPaths(
    sourceId: EntityId,
    targetId: EntityId,
    workspaceId: WorkspaceId,
    maxDepth = 4,
    maxPaths = 10,
  ): Promise<TraversalResult> {
    const s = session();
    try {
      const result = await s.run(
        `
        MATCH (source:Entity {id: $sourceId, workspace_id: $workspaceId}),
              (target:Entity {id: $targetId, workspace_id: $workspaceId})
        MATCH path = shortestPath((source)-[*..${maxDepth}]-(target))
        WHERE all(rel in relationships(path) WHERE rel.confidence >= 0)
        RETURN path
        LIMIT ${maxPaths}
        `,
        { sourceId, targetId, workspaceId },
      );

      const nodes: TraversalNode[] = [];
      const edges: TraversalEdge[] = [];
      const paths: TraversalPath[] = [];
      const seenNodeIds = new Set<string>();

      for (const record of result.records) {
        const path = record.get("path") as {
          segments: Array<{
            start: { identity: { toString(): string }; properties: Record<string, unknown>; labels: string[] };
            end: { identity: { toString(): string }; properties: Record<string, unknown>; labels: string[] };
            relationship: { identity: { toString(): string }; type: string; properties: Record<string, unknown> };
          }>;
        };

        if (!path?.segments) continue;

        const pathNodes: TraversalNode[] = [];
        const pathEdges: TraversalEdge[] = [];

        for (const seg of path.segments) {
          const startData = seg.start;
          const endData = seg.end;
          const relData = seg.relationship;

          if (!seenNodeIds.has(startData.identity.toString())) {
            seenNodeIds.add(startData.identity.toString());
            const node: TraversalNode = {
              id: (startData.properties.id as string) ?? startData.identity.toString(),
              labels: startData.labels ?? [],
              properties: startData.properties ?? {},
            };
            nodes.push(node);
            pathNodes.push(node);
          } else {
            pathNodes.push(nodes.find((n) => n.id === startData.properties.id) ?? pathNodes[0]);
          }

          if (!seenNodeIds.has(endData.identity.toString())) {
            seenNodeIds.add(endData.identity.toString());
            const node: TraversalNode = {
              id: (endData.properties.id as string) ?? endData.identity.toString(),
              labels: endData.labels ?? [],
              properties: endData.properties ?? {},
            };
            nodes.push(node);
            pathNodes.push(node);
          } else {
            pathNodes.push(nodes.find((n) => n.id === endData.properties.id) ?? pathNodes[0]);
          }

          const edge: TraversalEdge = {
            id: relData.identity.toString(),
            type: relData.type,
            source_id: (startData.properties.id as string) ?? startData.identity.toString(),
            target_id: (endData.properties.id as string) ?? endData.identity.toString(),
            properties: relData.properties ?? {},
          };
          edges.push(edge);
          pathEdges.push(edge);
        }

        paths.push({
          nodes: pathNodes,
          edges: pathEdges,
          length: pathEdges.length,
        });
      }

      return {
        nodes,
        edges,
        paths,
        total_nodes: nodes.length,
        total_edges: edges.length,
        max_depth_reached: maxDepth,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new GraphServiceError("Failed to find paths", {
        code: "NEO4J_READ_ERROR",
        retryable: true,
        context: { sourceId, targetId, error: message },
      });
    } finally {
      await s.close();
    }
  }

  return { getEntity, queryGraph, getNeighbors, findPaths };
}
