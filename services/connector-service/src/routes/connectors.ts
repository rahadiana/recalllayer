import { Router, type Request, type Response } from "express";
import { ConnectorRepository } from "../repository.js";
import { ConnectorRegistry } from "../connector-registry.js";
import { OAuthManager } from "../oauth-manager.js";
import { EventPublisher } from "../events.js";
import { SyncWorker } from "../worker.js";
import { SyncScheduler } from "../sync-scheduler.js";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { SyncRequestDto } from "../types.js";

export function createConnectorRoutes(
  repo: ConnectorRepository,
  registry: ConnectorRegistry,
  oauth: OAuthManager,
  events: EventPublisher,
  worker: SyncWorker,
  scheduler: SyncScheduler,
  baseUrl: string,
): Router {
  const router = Router();
  const log = createLogger("connector-routes");

  router.post(
    "/internal/connectors/oauth/callback",
    async (req: Request, res: Response): Promise<void> => {
      try {
        const code = req.query.code as string | undefined;
        const state = req.query.state as string | undefined;
        const error = req.query.error as string | undefined;
        const error_description = req.query.error_description as string | undefined;

        if (!code || !state) {
          res.status(400).json({
            code: "INVALID_REQUEST",
            message: "Missing required query parameters: code, state",
            error_id: generateId(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const plugin = registry.get(
          await repo.getOAuthState(state).then((s) => s?.connector_type ?? ""),
        );

        if (!plugin) {
          res.status(400).json({
            code: "INVALID_STATE",
            message: "Unknown connector type from OAuth state",
            error_id: generateId(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const result = await oauth.handleCallback(
          plugin,
          {
            code,
            state,
            error,
            error_description,
          },
          `${baseUrl}/internal/connectors/oauth/callback`,
        );

        const account = await repo.getAccountByTypeAndWorkspace(
          result.connectorType,
          result.workspaceId,
        );

        let accountId: string;
        if (account) {
          accountId = account.id;
        } else {
          const newAccount = await repo.createAccount({
            workspaceId: result.workspaceId,
            connectorType: result.connectorType,
            label: `${plugin.displayName} Account`,
            credentialRef: `oauth-${generateId("cred")}`,
            config: { settings: {} },
          });
          accountId = newAccount.id;
        }

        await oauth.storeTokens(accountId, result.tokenResult);

        log.info("OAuth callback handled", {
          connectorType: result.connectorType,
          workspaceId: result.workspaceId,
          accountId,
        });

        res.status(200).json({
          status: "ok",
          account_id: accountId,
          connector_type: result.connectorType,
          workspace_id: result.workspaceId,
        });
      } catch (error) {
        log.error("OAuth callback failed", {
          error: error instanceof Error ? error.message : "Unknown",
        });

        res.status(500).json({
          code: "OAUTH_CALLBACK_FAILED",
          message:
            error instanceof Error ? error.message : "OAuth callback failed",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  router.post(
    "/internal/connectors/:type/sync",
    async (req: Request, res: Response): Promise<void> => {
      try {
        const type = req.params.type as string;
        const body = req.body as SyncRequestDto;
        const syncMode = body.sync_mode ?? "incremental";

        if (!registry.has(type)) {
          res.status(404).json({
            code: "UNKNOWN_CONNECTOR",
            message: `No connector registered for type: ${type}`,
            error_id: generateId(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        let accountId = body.account_id;
        let workspaceId: string;
        let account;

        if (accountId) {
          account = await repo.getAccount(accountId);
          if (!account) {
            res.status(404).json({
              code: "ACCOUNT_NOT_FOUND",
              message: `Account not found: ${accountId}`,
              error_id: generateId(),
              timestamp: new Date().toISOString(),
            });
            return;
          }
          workspaceId = account.workspace_id;
        } else {
          res.status(400).json({
            code: "ACCOUNT_REQUIRED",
            message: "account_id is required",
            error_id: generateId(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const syncState = await repo.getSyncState(accountId);
        const cursorBefore = syncState?.cursor;

        const job = await repo.createSyncJob({
          accountId: accountId!,
          workspaceId: workspaceId! as never,
          connectorType: type,
          syncMode,
          cursorBefore,
        });

        await events.publishSyncRequested(workspaceId! as never, {
          connector_type: type,
          account_id: accountId!,
          sync_mode: syncMode,
        });

        scheduler.addActiveJob(job.id);

        worker.executeSyncJob(job.id)
          .then(() => scheduler.removeActiveJob(job.id))
          .catch((err) => {
            log.error("Background sync failed", {
              jobId: job.id,
              error: err instanceof Error ? err.message : "Unknown",
            });
            scheduler.removeActiveJob(job.id);
          });

        log.info("Sync triggered", {
          connectorType: type,
          accountId,
          jobId: job.id,
          mode: syncMode,
        });

        res.status(202).json({
          job_id: job.id,
          account_id: accountId,
          connector_type: type,
          sync_mode: syncMode,
          status: "pending",
        });
      } catch (error) {
        log.error("Sync trigger failed", {
          type: req.params.type,
          error: error instanceof Error ? error.message : "Unknown",
        });

        res.status(500).json({
          code: "SYNC_TRIGGER_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to trigger sync",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  router.get(
    "/internal/connectors/:type/status",
    async (req: Request, res: Response): Promise<void> => {
      try {
        const type = req.params.type as string;
        const accountId = req.query.account_id as string | undefined;

        if (!registry.has(type)) {
          res.status(404).json({
            code: "UNKNOWN_CONNECTOR",
            message: `No connector registered for type: ${type}`,
            error_id: generateId(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (!accountId) {
          res.status(400).json({
            code: "ACCOUNT_REQUIRED",
            message: "Query parameter account_id is required",
            error_id: generateId(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const account = await repo.getAccount(accountId);
        if (!account) {
          res.status(404).json({
            code: "ACCOUNT_NOT_FOUND",
            message: `Account not found: ${accountId}`,
            error_id: generateId(),
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const syncState = await repo.getSyncState(accountId);
        const lastJob = await repo.getLatestSyncJob(accountId);
        const activeJobs = await repo.getActiveSyncJobs();
        const accountActiveJobs = activeJobs.filter(
          (j) => j.account_id === accountId,
        );

        res.status(200).json({
          connector_type: type,
          account_id: accountId,
          account_label: account.label,
          is_active: account.is_active,
          last_sync: lastJob
            ? {
                job_id: lastJob.id,
                status: lastJob.status,
                started_at: lastJob.started_at,
                completed_at: lastJob.completed_at,
                discovered_count: lastJob.discovered_count,
                processed_count: lastJob.processed_count,
              }
            : undefined,
          sync_state: syncState
            ? {
                cursor: syncState.cursor,
                last_synced_at: syncState.last_synced_at,
                resource_checksums: syncState.resource_checksums,
                sync_count: syncState.sync_count,
              }
            : {
                cursor: undefined,
                resource_checksums: {},
                sync_count: 0,
              },
          active_jobs: accountActiveJobs.length,
        });
      } catch (error) {
        log.error("Status check failed", {
          type: req.params.type,
          error: error instanceof Error ? error.message : "Unknown",
        });

        res.status(500).json({
          code: "STATUS_CHECK_FAILED",
          message:
            error instanceof Error ? error.message : "Failed to check status",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  return router;
}
