/**
 * Search & Context Routes
 *
 * POST /v1/search  — hybrid search query (forwarded to retrieval-service).
 * POST /v1/context — assemble context window for RAG (forwarded to retrieval-service).
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SearchResponse, ContextWindow } from "@memory-platform/shared-schemas";
import type { InternalProxy, ProxyRequestHeaders } from "../proxy.js";
import { AppError } from "../middleware/error-handler.js";
import { generateId } from "@memory-platform/shared-utils";

export function createSearchRouter(proxy: InternalProxy): Router {
  const router = Router();

  function requestHeaders(req: Request): ProxyRequestHeaders {
    return {
      authorization: req.headers.authorization,
      "x-api-key": req.headers["x-api-key"] as string | undefined,
      "x-request-id": req.requestId,
      "x-correlation-id": req.correlationId,
      "content-type": "application/json",
    };
  }

  router.post(
    "/v1/search",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { query, top_k, similarity_threshold, filters, hybrid } = req.body || {};

        if (!query || typeof query !== "string" || query.trim().length === 0) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid search query", {
            fields: [{ field: "query", message: "Query is required and must be a non-empty string" }],
          });
        }

        const enriched = {
          id: `q_${generateId()}`,
          workspace_id: req.workspaceId,
          query: query.trim(),
          top_k: typeof top_k === "number" && top_k > 0 ? top_k : 10,
          similarity_threshold: typeof similarity_threshold === "number" ? similarity_threshold : 0.3,
          filters: typeof filters === "object" && filters !== null ? filters : {},
          hybrid: typeof hybrid === "boolean" ? hybrid : true,
          created_at: new Date().toISOString(),
        };

        const result = await proxy.forwardToRetrieval<SearchResponse>(
          "/internal/search",
          "POST",
          requestHeaders(req),
          enriched,
        );

        res.status(result.status).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/v1/context",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.body.query_id) {
          throw new AppError(400, "MISSING_REQUIRED_FIELD", "Field 'query_id' is required");
        }

        const result = await proxy.forwardToRetrieval<ContextWindow>(
          "/context",
          "POST",
          requestHeaders(req),
          { ...req.body, workspace_id: req.workspaceId },
        );

        res.status(result.status).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
