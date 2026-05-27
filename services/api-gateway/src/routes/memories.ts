/**
 * Memories Routes
 *
 * GET /v1/memories/:id — retrieve a memory graph entity.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { InternalProxy, ProxyRequestHeaders } from "../proxy.js";

export function createMemoriesRouter(proxy: InternalProxy): Router {
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

  router.get(
    "/v1/memories/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await proxy.forwardToRetrieval<Record<string, unknown>>(
          `/memories/${req.params.id}`,
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
