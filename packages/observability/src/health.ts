/**
 * Possible health statuses.
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Result of a single health check.
 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs: number;
  error?: string;
}

/**
 * Function signature for a health check.
 */
export type HealthChecker = () => Promise<{
  status: HealthStatus;
  message?: string;
}>;

/**
 * Aggregated health endpoint response.
 */
export interface HealthReport {
  status: HealthStatus;
  service: string;
  uptime: number;
  timestamp: string;
  checks: HealthCheckResult[];
}

type RegisteredCheck = { name: string; fn: HealthChecker };

const checks = new Map<string, HealthChecker>();
let startTime: number | null = null;

/**
 * Register a named health check function.
 *
 * Checks registered before the first call to healthEndpoint()
 * will be included. Registrations after startup are ignored
 * (the set is frozen at first use).
 */
export function registerCheck(name: string, fn: HealthChecker): void {
  checks.set(name, fn);
}

function aggregateStatus(results: HealthCheckResult[]): HealthStatus {
  if (results.length === 0) return "healthy";
  if (results.some((r) => r.status === "unhealthy")) return "unhealthy";
  if (results.some((r) => r.status === "degraded")) return "degraded";
  return "healthy";
}

function computeUptime(): number {
  if (!startTime) return 0;
  return Math.floor((Date.now() - startTime) / 1000);
}

/**
 * Create an Express/HTTP-compatible health endpoint handler.
 *
 * Returns a function that executes all registered checks and produces
 * a JSON {@link HealthReport}.
 *
 * @param serviceName - the name of this service
 */
export function healthEndpoint(serviceName: string): () => Promise<HealthReport> {
  if (!startTime) {
    startTime = Date.now();
  }

  return async () => {
    const results: HealthCheckResult[] = [];

    for (const [name, fn] of checks) {
      const checkStart = Date.now();
      try {
        const { status, message } = await fn();
        results.push({
          name,
          status,
          message,
          latencyMs: Date.now() - checkStart,
        });
      } catch (err) {
        results.push({
          name,
          status: "unhealthy",
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - checkStart,
        });
      }
    }

    return {
      status: aggregateStatus(results),
      service: serviceName,
      uptime: computeUptime(),
      timestamp: new Date().toISOString(),
      checks: results,
    };
  };
}

/**
 * Quick one-shot health check — runs all registered checks and returns a report.
 * Useful outside HTTP contexts (e.g. CLI health probe).
 */
export async function healthCheck(serviceName: string): Promise<HealthReport> {
  return healthEndpoint(serviceName)();
}

/**
 * Reset internal state (mainly for testing).
 */
export function resetHealth(): void {
  checks.clear();
  startTime = null;
}
