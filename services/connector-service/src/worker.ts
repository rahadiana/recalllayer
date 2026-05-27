import { ConnectorRepository } from "./repository.js";
import { ConnectorRegistry } from "./connector-registry.js";
import { OAuthManager } from "./oauth-manager.js";
import { EventPublisher } from "./events.js";
import { createLogger, type Logger } from "@memory-platform/observability";
import { formatISO } from "@memory-platform/shared-utils";
import type { WorkspaceId } from "@memory-platform/shared-schemas";
import type {
  ConnectorAccountRecord,
  SyncJobRecord,
  ExternalItem,
} from "./types.js";

export class SyncWorker {
  private readonly log: Logger;

  constructor(
    private readonly repo: ConnectorRepository,
    private readonly registry: ConnectorRegistry,
    private readonly oauth: OAuthManager,
    private readonly events: EventPublisher,
  ) {
    this.log = createLogger("sync-worker");
  }

  async executeSyncJob(jobId: string): Promise<SyncJobRecord> {
    const job = await this.repo.getSyncJob(jobId);
    if (!job) {
      throw new Error(`Sync job not found: ${jobId}`);
    }

    if (job.status === "completed" || job.status === "cancelled") {
      this.log.info("Job already finalized, skipping", {
        jobId,
        status: job.status,
      });
      return job;
    }

    const account = await this.repo.getAccount(job.account_id);
    if (!account) {
      throw new Error(`Account not found: ${job.account_id}`);
    }

    const plugin = this.registry.get(job.connector_type);
    const workspaceId = job.workspace_id;

    await this.repo.updateSyncJobStatus(jobId, "scanning");
    await this.events.publishSyncStarted(workspaceId, job.connector_type, job.account_id);

    try {
      const accessToken = await this.oauth.getValidAccessToken(
        job.account_id,
        plugin,
      );

      const result = await plugin.sync({
        accessToken,
        config: account.config,
        cursor: job.sync_mode === "incremental" ? job.cursor_before : undefined,
        since: job.sync_mode === "incremental"
          ? account.last_synced_at
          : undefined,
      });

      await this.repo.updateSyncJobStatus(jobId, "processing", {
        discovered_count: result.items.length,
      });

      const counts = await this.processSyncResults(
        result.items,
        job,
        account,
        workspaceId,
      );

      const cursorAfter = result.cursor ?? undefined;

      await this.repo.updateSyncJobStatus(jobId, "completed", {
        cursor_after: cursorAfter,
        discovered_count: result.items.length,
        processed_count: counts.processed,
        skipped_count: counts.skipped,
        error_count: counts.errors,
      });

      await this.repo.upsertSyncState({
        accountId: account.id,
        connectorType: account.connector_type,
        cursor: cursorAfter,
        resourceChecksums: this.buildChecksumMap(result.items),
        deltaDetected: result.items.length > 0,
      });

      const syncedAt = formatISO() as WorkspaceId extends string ? string : never;
      await this.repo.updateAccountLastSync(account.id, syncedAt);

      await this.events.publishSyncCompleted(
        workspaceId,
        job.connector_type,
        job.account_id,
        counts.processed,
      );

      this.log.info("Sync job completed", {
        jobId,
        accountId: account.id,
        connectorType: job.connector_type,
        discovered: result.items.length,
        processed: counts.processed,
        skipped: counts.skipped,
        errors: counts.errors,
      });

      return (await this.repo.getSyncJob(jobId))!;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await this.repo.updateSyncJobStatus(jobId, "failed", {
        error_message: errorMessage,
      });

      await this.events.publishSyncFailed(
        workspaceId,
        job.connector_type,
        job.account_id,
        errorMessage,
      );

      this.log.error("Sync job failed", {
        jobId,
        accountId: account.id,
        connectorType: job.connector_type,
        error: errorMessage,
      });

      throw error;
    }
  }

  private async processSyncResults(
    items: ExternalItem[],
    job: SyncJobRecord,
    account: ConnectorAccountRecord,
    workspaceId: WorkspaceId,
  ): Promise<{ processed: number; skipped: number; errors: number }> {
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of items) {
      try {
        if (item.isDeleted) {
          await this.events.publishDocumentDeleted(workspaceId, {
            connector_type: account.connector_type,
            account_id: account.id,
            external_id: item.externalId,
          });
          processed++;
          continue;
        }

        const existingChecksums = await this.getExistingChecksums(account.id);
        if (
          item.checksum &&
          existingChecksums[item.externalId] === item.checksum
        ) {
          skipped++;
          continue;
        }

        await this.events.publishDocumentDiscovered(workspaceId, {
          connector_type: account.connector_type,
          account_id: account.id,
          external_id: item.externalId,
          name: item.name,
          mime_type: item.mimeType,
          size_bytes: item.sizeBytes,
          checksum: item.checksum,
          external_updated_at: item.updatedAt,
        });

        await this.events.publishDocumentUpdated(workspaceId, {
          connector_type: account.connector_type,
          account_id: account.id,
          external_id: item.externalId,
          name: item.name,
          mime_type: item.mimeType,
          size_bytes: item.sizeBytes,
          checksum: item.checksum,
          external_updated_at: item.updatedAt,
        });

        processed++;
      } catch (error) {
        this.log.error("Failed to process sync item", {
          jobId: job.id,
          externalId: item.externalId,
          error: error instanceof Error ? error.message : "Unknown",
        });
        errors++;
      }
    }

    return { processed, skipped, errors };
  }

  private buildChecksumMap(
    items: ExternalItem[],
  ): Record<string, string> {
    const map: Record<string, string> = {};
    for (const item of items) {
      if (item.checksum) {
        map[item.externalId] = item.checksum;
      }
    }
    return map;
  }

  private async getExistingChecksums(
    accountId: string,
  ): Promise<Record<string, string>> {
    const state = await this.repo.getSyncState(accountId);
    return state?.resource_checksums ?? {};
  }
}
