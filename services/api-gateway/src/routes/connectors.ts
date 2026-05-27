/**
 * Connectors Routes
 *
 * POST /v1/connectors/:type/sync — trigger a sync job for a connector.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SyncJob } from "@memory-platform/shared-schemas";
import type { InternalProxy, ProxyRequestHeaders } from "../proxy.js";
import { AppError } from "../middleware/error-handler.js";

export function createConnectorsRouter(proxy: InternalProxy): Router {
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
    "/v1/connectors/:type/sync",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const connectorType = req.params.type;

        if (!connectorType || connectorType.length === 0) {
          throw new AppError(400, "MISSING_REQUIRED_FIELD", "Connector type is required");
        }

        const result = await proxy.forwardToConnector<SyncJob>(
          `/connectors/${connectorType}/sync`,
          "POST",
          requestHeaders(req),
          {
            ...req.body,
            workspace_id: req.workspaceId,
            connector_type: connectorType,
          },
        );

        res.status(result.status).json(result.data);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
