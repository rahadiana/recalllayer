/**
 * Usage Routes
 *
 * GET /v1/usage — returns usage statistics for the authenticated workspace.
 */

import { Router, type Request, type Response, type NextFunction } from "express";

interface UsageStats {
  workspace_id: string;
  document_count: number;
  storage_bytes: number;
  search_count: number;
  period_start: string;
  period_end: string;
}

const router: Router = Router();

router.get(
  "/v1/usage",
  (_req: Request, res: Response, _next: NextFunction) => {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date();

    const stats: UsageStats = {
      workspace_id: _req.workspaceId ?? "unknown",
      document_count: 0,
      storage_bytes: 0,
      search_count: 0,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    };

    res.json(stats);
  },
);

export { router as usageRouter };
