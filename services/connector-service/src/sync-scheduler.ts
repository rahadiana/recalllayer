import { ConnectorRepository } from "./repository.js";
import { ConnectorRegistry } from "./connector-registry.js";
import { createLogger, type Logger } from "@memory-platform/observability";
import { formatISO } from "@memory-platform/shared-utils";
import type { WorkspaceId, SyncState } from "@memory-platform/shared-schemas";
import type { ConnectorAccountRecord, SyncJobRecord } from "./types.js";

export interface SchedulerOptions {
  pollIntervalMs: number;
  maxConcurrentJobs: number;
}

const DEFAULT_OPTIONS: SchedulerOptions = {
  pollIntervalMs: 30_000,
  maxConcurrentJobs: 5,
};

export class SyncScheduler {
  private readonly log: Logger;
  private interval?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly activeJobIds = new Set<string>();

  constructor(
    private readonly repo: ConnectorRepository,
    private readonly registry: ConnectorRegistry,
    private readonly onSyncRequested: (
      account: ConnectorAccountRecord,
      syncMode: "full" | "incremental",
    ) => Promise<SyncJobRecord>,
    private readonly options: SchedulerOptions = DEFAULT_OPTIONS,
  ) {
    this.log = createLogger("sync-scheduler");
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.log.info("Scheduler started", { intervalMs: this.options.pollIntervalMs });

    this.interval = setInterval(() => {
      this.poll().catch((err) => {
        this.log.error("Scheduler poll failed", {
          error: err instanceof Error ? err.message : "Unknown",
        });
      });
    }, this.options.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.log.info("Scheduler stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  private async poll(): Promise<void> {
    const activeJobs = await this.repo.getActiveSyncJobs();
    const activeCount = activeJobs.length;

    if (activeCount >= this.options.maxConcurrentJobs) {
      this.log.debug("Max concurrent jobs reached", {
        activeCount,
        max: this.options.maxConcurrentJobs,
      });
      return;
    }

    const activeAccountIds = new Set(activeJobs.map((j) => j.account_id));

    for (const pluginType of this.registry.getRegisteredTypes()) {
      const pendingAccounts = await this.findAccountsNeedingDeltaSync(
        pluginType,
        activeAccountIds,
      );

      for (const account of pendingAccounts) {
        if (this.activeJobIds.size >= this.options.maxConcurrentJobs) {
          return;
        }

        try {
          const job = await this.onSyncRequested(account, "incremental");
          this.log.info("Delta sync triggered by scheduler", {
            accountId: account.id,
            connectorType: account.connector_type,
            jobId: job.id,
          });
        } catch (error) {
          this.log.error("Failed to trigger delta sync", {
            accountId: account.id,
            error: error instanceof Error ? error.message : "Unknown",
          });
        }
      }
    }
  }

  private async findAccountsNeedingDeltaSync(
    connectorType: string,
    excludeAccountIds: Set<string>,
  ): Promise<ConnectorAccountRecord[]> {
    const accounts: ConnectorAccountRecord[] = [];

    const syncJobs = await this.repo.getActiveSyncJobs();
    const busyAccountIds = new Set([
      ...excludeAccountIds,
      ...syncJobs.map((j) => j.account_id),
    ]);

    const allAccounts = await this.repo.listAccountsByWorkspace(
      "" as WorkspaceId,
    );

    // Since listAccountsByWorkspace is workspace-scoped, we need to look at
    // the sync states for accounts of the given connector type
    for (const account of allAccounts) {
      if (account.connector_type !== connectorType) continue;
      if (busyAccountIds.has(account.id)) continue;
      if (!account.is_active) continue;

      const syncState = await this.repo.getSyncState(account.id);
      if (
        syncState &&
        syncState.last_synced_at &&
        Date.now() - new Date(syncState.last_synced_at).getTime() < 5 * 60_000
      ) {
        continue;
      }

      accounts.push(account);
      if (accounts.length >= 3) break;
    }

    return accounts;
  }

  addActiveJob(jobId: string): void {
    this.activeJobIds.add(jobId);
  }

  removeActiveJob(jobId: string): void {
    this.activeJobIds.delete(jobId);
  }

  get activeJobCount(): number {
    return this.activeJobIds.size;
  }
}
