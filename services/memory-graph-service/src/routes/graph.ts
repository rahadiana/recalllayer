import { Router, type Request, type Response } from "express";
import { createLogger, recordMetric } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { GraphReader } from "../graph-reader.js";
import type { GraphQueryRequest } from "../types.js";

export function createGraphRouter(graphReader: GraphReader): Router {
  const router = Router();
  const log = createLogger("memory-graph:routes:graph");

  router.post("/internal/graph/query", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = generateId("graph_query_");

    try {
      const body = req.body as GraphQueryRequest;

      if (!body.workspace_id) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "workspace_id is required",
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!body.seed_entity_ids || body.seed_entity_ids.length === 0) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "At least one seed_entity_id is required",
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      log.info("Graph query request received", {
        requestId,
        workspaceId: body.workspace_id,
        seedCount: body.seed_entity_ids.length,
        maxDepth: body.max_depth ?? 2,
        maxNodes: body.max_nodes ?? 100,
        returnPaths: body.return_paths ?? false,
      });

      const result = await graphReader.queryGraph(body);

      const latencyMs = Date.now() - startTime;

      recordMetric("graph.query.count", 1, {
        workspace_id: String(body.workspace_id),
      });
      recordMetric("graph.query.latency_ms", latencyMs, {
        workspace_id: String(body.workspace_id),
      }, "histogram");

      res.json({
        query_id: requestId,
        ...result,
        latency_ms: latencyMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Graph query failed", { requestId, error: message });
      res.status(500).json({
        code: "GRAPH_QUERY_FAILED",
        message: "Graph traversal failed",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  router.get("/internal/graph/entities/:id", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const workspaceId = (req.query.workspace_id as string) ?? "default";

    try {
      const entityId = req.params.id;

      if (!entityId) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Entity ID is required",
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const entity = await graphReader.getEntity(
        entityId as import("../types.js").EntityId,
        workspaceId as import("../types.js").WorkspaceId,
      );

      if (!entity) {
        res.status(404).json({
          code: "ENTITY_NOT_FOUND",
          message: `Entity ${entityId} not found`,
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const neighbors = await graphReader.getNeighbors(
        entity.id,
        entity.workspace_id,
        undefined,
        undefined,
        50,
      );

      const latencyMs = Date.now() - startTime;

      recordMetric("graph.entity.get", 1, {
        workspace_id: String(workspaceId),
      });
      recordMetric("graph.entity.get.latency_ms", latencyMs, {
        workspace_id: String(workspaceId),
      }, "histogram");

      res.json({
        entity,
        neighbors: neighbors.nodes.filter((n) => n.id !== entity.id),
        neighbor_edges: neighbors.edges,
        latency_ms: latencyMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Entity retrieval failed", { entityId: req.params.id, error: message });
      res.status(500).json({
        code: "ENTITY_RETRIEVAL_FAILED",
        message: "Failed to retrieve entity",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  router.post("/internal/graph/paths", async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { source_id, target_id, workspace_id, max_depth, max_paths } = req.body as {
        source_id: string;
        target_id: string;
        workspace_id: string;
        max_depth?: number;
        max_paths?: number;
      };

      if (!source_id || !target_id) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "source_id and target_id are required",
          error_id: generateId("err_"),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await graphReader.findPaths(
        source_id,
        target_id,
        (workspace_id ?? "default") as import("../types.js").WorkspaceId,
        max_depth,
        max_paths,
      );

      res.json({
        ...result,
        latency_ms: Date.now() - startTime,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Path query failed", { error: message });
      res.status(500).json({
        code: "PATH_QUERY_FAILED",
        message: "Failed to find paths",
        details: message,
        error_id: generateId("err_"),
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
