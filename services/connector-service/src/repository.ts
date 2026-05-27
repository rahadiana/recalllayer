import type { PostgresPool } from "@memory-platform/db";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId, formatISO } from "@memory-platform/shared-utils";
import type {
  WorkspaceId,
  ConnectorConfig,
  SyncJobStatus,
  SyncState,
  Timestamp,
} from "@memory-platform/shared-schemas";
import type {
  ConnectorAccountRecord,
  ConnectorToken,
  OAuthState,
  SyncJobRecord,
  SyncStateRecord,
} from "./types.js";

export class ConnectorRepository {
  private readonly log: Logger;

  constructor(private readonly pool: PostgresPool) {
    this.log = createLogger("connector-repository");
  }

  // ─── Accounts ───────────────────────────────────────────────────────────

  async createAccount(params: {
    workspaceId: WorkspaceId;
    connectorType: string;
    label: string;
    credentialRef: string;
    config: ConnectorConfig;
  }): Promise<ConnectorAccountRecord> {
    const id = generateId("cacct");
    const now = formatISO();

    const [row] = await this.pool.sql<ConnectorAccountRecord[]>`
      INSERT INTO connector_accounts
        (id, workspace_id, connector_type, label, credential_ref, config, is_active, created_at, updated_at)
      VALUES
        (${id}, ${params.workspaceId}, ${params.connectorType}, ${params.label},
         ${params.credentialRef}, ${this.pool.sql.json(params.config as never)}, true, ${now}, ${now})
      RETURNING *
    `;

    this.log.info("Connector account created", {
      accountId: id,
      connectorType: params.connectorType,
      workspaceId: params.workspaceId,
    });

    return row as ConnectorAccountRecord;
  }

  async getAccount(accountId: string): Promise<ConnectorAccountRecord | null> {
    const [row] = await this.pool.sql<ConnectorAccountRecord[]>`
      SELECT * FROM connector_accounts WHERE id = ${accountId}
    `;
    return (row as ConnectorAccountRecord) ?? null;
  }

  async getAccountByTypeAndWorkspace(
    connectorType: string,
    workspaceId: WorkspaceId,
  ): Promise<ConnectorAccountRecord | null> {
    const [row] = await this.pool.sql<ConnectorAccountRecord[]>`
      SELECT * FROM connector_accounts
      WHERE connector_type = ${connectorType}
        AND workspace_id = ${workspaceId}
        AND is_active = true
      LIMIT 1
    `;
    return (row as ConnectorAccountRecord) ?? null;
  }

  async listAccountsByWorkspace(
    workspaceId: WorkspaceId,
  ): Promise<ConnectorAccountRecord[]> {
    const rows = await this.pool.sql<ConnectorAccountRecord[]>`
      SELECT * FROM connector_accounts
      WHERE workspace_id = ${workspaceId} AND is_active = true
      ORDER BY created_at DESC
    `;
    return rows as ConnectorAccountRecord[];
  }

  async updateAccountLastSync(
    accountId: string,
    syncedAt: Timestamp,
  ): Promise<void> {
    await this.pool.sql`
      UPDATE connector_accounts
      SET last_synced_at = ${syncedAt}, updated_at = ${syncedAt}
      WHERE id = ${accountId}
    `;
  }

  async deactivateAccount(accountId: string): Promise<void> {
    const now = formatISO();
    await this.pool.sql`
      UPDATE connector_accounts
      SET is_active = false, updated_at = ${now}
      WHERE id = ${accountId}
    `;
  }

  // ─── Tokens ─────────────────────────────────────────────────────────────

  async storeToken(params: {
    accountId: string;
    tokenType: "access" | "refresh" | "api_key";
    tokenEncrypted: string;
    metadata?: Record<string, unknown>;
    expiresAt?: Timestamp;
  }): Promise<ConnectorToken> {
    const id = generateId("ctok");
    const now = formatISO();

    const [row] = await this.pool.sql<ConnectorToken[]>`
      INSERT INTO connector_tokens
        (id, account_id, token_type, token_encrypted, metadata, expires_at, created_at)
      VALUES
        (${id}, ${params.accountId}, ${params.tokenType}, ${params.tokenEncrypted},
         ${this.pool.sql.json((params.metadata ?? {}) as never)}, ${params.expiresAt ?? null}, ${now})
      RETURNING *
    `;

    return row as ConnectorToken;
  }

  async getLatestToken(
    accountId: string,
    tokenType: "access" | "refresh" | "api_key",
  ): Promise<ConnectorToken | null> {
    const [row] = await this.pool.sql<ConnectorToken[]>`
      SELECT * FROM connector_tokens
      WHERE account_id = ${accountId} AND token_type = ${tokenType}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return (row as ConnectorToken) ?? null;
  }

  async deleteTokensForAccount(accountId: string): Promise<void> {
    await this.pool.sql`
      DELETE FROM connector_tokens WHERE account_id = ${accountId}
    `;
  }

  // ─── OAuth States ───────────────────────────────────────────────────────

  async storeOAuthState(params: {
    state: string;
    connectorType: string;
    workspaceId: WorkspaceId;
    redirectUri?: string;
    expiresAt: Timestamp;
  }): Promise<OAuthState> {
    const now = formatISO();

    await this.pool.sql`
      INSERT INTO oauth_states
        (state, connector_type, workspace_id, redirect_uri, expires_at, created_at)
      VALUES
        (${params.state}, ${params.connectorType}, ${params.workspaceId},
         ${params.redirectUri ?? null}, ${params.expiresAt}, ${now})
      ON CONFLICT (state) DO UPDATE SET
        connector_type = EXCLUDED.connector_type,
        workspace_id = EXCLUDED.workspace_id,
        redirect_uri = EXCLUDED.redirect_uri,
        expires_at = EXCLUDED.expires_at,
        created_at = EXCLUDED.created_at
    `;

    return {
      state: params.state,
      connector_type: params.connectorType,
      workspace_id: params.workspaceId,
      redirect_uri: params.redirectUri,
      expires_at: params.expiresAt,
      created_at: now,
    };
  }

  async getOAuthState(state: string): Promise<OAuthState | null> {
    const [row] = await this.pool.sql<OAuthState[]>`
      SELECT * FROM oauth_states WHERE state = ${state}
    `;
    return (row as OAuthState) ?? null;
  }

  async deleteOAuthState(state: string): Promise<void> {
    await this.pool.sql`
      DELETE FROM oauth_states WHERE state = ${state}
    `;
  }

  async purgeExpiredOAuthStates(): Promise<number> {
    const now = formatISO();
    const result = await this.pool.sql`
      DELETE FROM oauth_states WHERE expires_at < ${now}
    `;
    return result.count;
  }

  // ─── Sync Jobs ──────────────────────────────────────────────────────────

  async createSyncJob(params: {
    accountId: string;
    workspaceId: WorkspaceId;
    connectorType: string;
    syncMode: "full" | "incremental";
    cursorBefore?: string;
  }): Promise<SyncJobRecord> {
    const id = generateId("csync");
    const now = formatISO();

    const [row] = await this.pool.sql<SyncJobRecord[]>`
      INSERT INTO sync_jobs
        (id, account_id, workspace_id, connector_type, status, sync_mode,
         cursor_before, discovered_count, processed_count, skipped_count,
         error_count, progress, created_at)
      VALUES
        (${id}, ${params.accountId}, ${params.workspaceId}, ${params.connectorType},
         'pending', ${params.syncMode}, ${params.cursorBefore ?? null},
         0, 0, 0, 0, ${this.pool.sql.json({} as never)}, ${now})
      RETURNING *
    `;

    this.log.info("Sync job created", {
      jobId: id,
      accountId: params.accountId,
      mode: params.syncMode,
    });

    return row as SyncJobRecord;
  }

  async updateSyncJobStatus(
    jobId: string,
    status: SyncJobStatus,
    updates?: Partial<Pick<SyncJobRecord, "cursor_after" | "discovered_count" | "processed_count" | "skipped_count" | "error_count" | "error_message">>,
  ): Promise<void> {
    const now = formatISO();

    const fields: string[] = ["status = ${status}", "updated_at = ${now}"];
    const values: Record<string, unknown> = { status, now };

    if (updates?.cursor_after !== undefined) {
      fields.push("cursor_after = ${cursorAfter}");
      values.cursorAfter = updates.cursor_after;
    }
    if (updates?.discovered_count !== undefined) {
      fields.push("discovered_count = ${discoveredCount}");
      values.discoveredCount = updates.discovered_count;
    }
    if (updates?.processed_count !== undefined) {
      fields.push("processed_count = ${processedCount}");
      values.processedCount = updates.processed_count;
    }
    if (updates?.skipped_count !== undefined) {
      fields.push("skipped_count = ${skippedCount}");
      values.skippedCount = updates.skipped_count;
    }
    if (updates?.error_count !== undefined) {
      fields.push("error_count = ${errorCount}");
      values.errorCount = updates.error_count;
    }
    if (updates?.error_message !== undefined) {
      fields.push("error_message = ${errorMessage}");
      values.errorMessage = updates.error_message;
    }

    if (status === "completed" || status === "failed") {
      fields.push("completed_at = ${now}");
    }
    if (status === "scanning" || status === "processing") {
      fields.push("started_at = COALESCE(started_at, ${now})");
    }

    await this.pool.sql`
      UPDATE sync_jobs
      SET ${this.pool.sql.unsafe(fields.join(", "))}
      WHERE id = ${jobId}
    `;
  }

  async updateSyncJobCounts(
    jobId: string,
    counts: { discovered: number; processed: number; skipped: number; errors: number },
    progress?: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.sql`
      UPDATE sync_jobs
      SET
        discovered_count = ${counts.discovered},
        processed_count = ${counts.processed},
        skipped_count = ${counts.skipped},
        error_count = ${counts.errors},
        progress = ${this.pool.sql.json((progress ?? {}) as never)}
      WHERE id = ${jobId}
    `;
  }

  async getSyncJob(jobId: string): Promise<SyncJobRecord | null> {
    const [row] = await this.pool.sql<SyncJobRecord[]>`
      SELECT * FROM sync_jobs WHERE id = ${jobId}
    `;
    return (row as SyncJobRecord) ?? null;
  }

  async getLatestSyncJob(
    accountId: string,
  ): Promise<SyncJobRecord | null> {
    const [row] = await this.pool.sql<SyncJobRecord[]>`
      SELECT * FROM sync_jobs
      WHERE account_id = ${accountId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return (row as SyncJobRecord) ?? null;
  }

  async getActiveSyncJobs(): Promise<SyncJobRecord[]> {
    const rows = await this.pool.sql<SyncJobRecord[]>`
      SELECT * FROM sync_jobs
      WHERE status IN ('pending', 'scanning', 'processing')
      ORDER BY created_at ASC
    `;
    return rows as SyncJobRecord[];
  }

  // ─── Sync States ────────────────────────────────────────────────────────

  async getSyncState(accountId: string): Promise<SyncStateRecord | null> {
    const [row] = await this.pool.sql<SyncStateRecord[]>`
      SELECT * FROM sync_states WHERE account_id = ${accountId}
    `;
    return (row as SyncStateRecord) ?? null;
  }

  async upsertSyncState(params: {
    accountId: string;
    connectorType: string;
    cursor?: string;
    resourceChecksums: Record<string, string>;
    deltaDetected: boolean;
  }): Promise<SyncStateRecord> {
    const now = formatISO();
    const syncCount = 1;

    const [row] = await this.pool.sql<SyncStateRecord[]>`
      INSERT INTO sync_states
        (id, account_id, connector_type, cursor, resource_checksums, sync_count,
         delta_detected, last_synced_at, created_at, updated_at)
      VALUES
        (${generateId("cstate")}, ${params.accountId}, ${params.connectorType},
         ${params.cursor ?? null}, ${this.pool.sql.json(params.resourceChecksums)},
         ${syncCount}, ${params.deltaDetected}, ${now}, ${now}, ${now})
      ON CONFLICT (account_id) DO UPDATE SET
        cursor = COALESCE(EXCLUDED.cursor, sync_states.cursor),
        resource_checksums = EXCLUDED.resource_checksums,
        sync_count = sync_states.sync_count + 1,
        delta_detected = EXCLUDED.delta_detected,
        last_synced_at = ${now},
        updated_at = ${now}
      RETURNING *
    `;

    return row as SyncStateRecord;
  }

  // ─── Migrations ─────────────────────────────────────────────────────────

  async runMigrations(): Promise<void> {
    await this.pool.sql`
      CREATE TABLE IF NOT EXISTS connector_accounts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        connector_type TEXT NOT NULL,
        label TEXT NOT NULL,
        credential_ref TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    await this.pool.sql`
      CREATE TABLE IF NOT EXISTS connector_tokens (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES connector_accounts(id) ON DELETE CASCADE,
        token_type TEXT NOT NULL,
        token_encrypted TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        expires_at TEXT,
        created_at TEXT NOT NULL
      )
    `;

    await this.pool.sql`
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        connector_type TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        redirect_uri TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;

    await this.pool.sql`
      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES connector_accounts(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        connector_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        sync_mode TEXT NOT NULL DEFAULT 'incremental',
        cursor_before TEXT,
        cursor_after TEXT,
        discovered_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        progress JSONB NOT NULL DEFAULT '{}',
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `;

    await this.pool.sql`
      CREATE TABLE IF NOT EXISTS sync_states (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE REFERENCES connector_accounts(id) ON DELETE CASCADE,
        connector_type TEXT NOT NULL,
        cursor TEXT,
        resource_checksums JSONB NOT NULL DEFAULT '{}',
        sync_count INTEGER NOT NULL DEFAULT 0,
        delta_detected BOOLEAN NOT NULL DEFAULT false,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    await this.pool.sql`
      CREATE INDEX IF NOT EXISTS idx_connector_accounts_workspace
        ON connector_accounts(workspace_id)
    `;
    await this.pool.sql`
      CREATE INDEX IF NOT EXISTS idx_connector_tokens_account
        ON connector_tokens(account_id, token_type)
    `;
    await this.pool.sql`
      CREATE INDEX IF NOT EXISTS idx_oauth_states_expires
        ON oauth_states(expires_at)
    `;
    await this.pool.sql`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_account
        ON sync_jobs(account_id, status)
    `;
    await this.pool.sql`
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
        ON sync_jobs(status)
    `;

    this.log.info("Database migrations completed");
  }
}
