/**
 * Health Check Route
 *
 * GET /health — returns service status, version, and uptime.
 */

import { Router, type Request, type Response } from "express";
import { healthEndpoint, registerCheck } from "@memory-platform/observability";

const router: Router = Router();

const SERVICE_VERSION = process.env.SERVICE_VERSION ?? "0.1.0";

const getHealthReport = healthEndpoint("api-gateway");

router.get("/health", async (_req: Request, res: Response) => {
  const report = await getHealthReport();

  res.json({
    status: report.status,
    version: SERVICE_VERSION,
    uptime: report.uptime,
    timestamp: report.timestamp,
    checks: report.checks,
  });
});

export { registerCheck, router as healthRouter };
