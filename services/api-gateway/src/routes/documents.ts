/**
 * Documents Routes
 *
 * POST /v1/documents — create a new document (forwarded to ingestion-service).
 * GET  /v1/documents/:id — retrieve document status (forwarded to ingestion-service).
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { CreateDocumentDto, Document } from "@memory-platform/shared-schemas";
import { createDocumentDtoSchema } from "@memory-platform/shared-schemas";
import type { InternalProxy, ProxyRequestHeaders } from "../proxy.js";
import { AppError } from "../middleware/error-handler.js";

export function createDocumentsRouter(proxy: InternalProxy): Router {
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
    "/v1/documents",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parseResult = createDocumentDtoSchema.safeParse(req.body);

        if (!parseResult.success) {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid document payload", {
            fields: parseResult.error.issues.map(
              (issue: {
                path: (string | number)[];
                message: string;
                received?: unknown;
              }) => ({
                field: issue.path.join("."),
                message: issue.message,
                received: issue.received,
              }),
            ),
          });
        }

        const dto: CreateDocumentDto = parseResult.data;

        const result = await proxy.forwardToIngestion<Document>(
          "/internal/documents",
          "POST",
          requestHeaders(req),
          { document: dto, workspace_id: req.workspaceId, created_by: req.actorId },
        );

        res.status(result.status).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/v1/documents/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
    const result = await proxy.forwardToIngestion<Document>(
      `/internal/documents/${req.params.id}`,
          "GET",
          requestHeaders(req),
        );

        res.status(result.status).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
