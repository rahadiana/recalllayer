/**
 * Connector Service internal types.
 *
 * Extends shared-schemas types with service-internal concerns:
 * OAuth token storage, connector plugin interface, sync job execution context.
 */

import type {
  ConnectorAccount,
  ConnectorConfig,
  SyncJob,
  SyncState,
  SyncJobStatus,
  SyncedDocument,
  WorkspaceId,
  Timestamp,
  Metadata,
} from "@memory-platform/shared-schemas";

export type {
  ConnectorAccount,
  ConnectorConfig,
  SyncJob,
  SyncState,
  SyncJobStatus,
  SyncedDocument,
  WorkspaceId,
  Timestamp,
  Metadata,
};

// ─── Service Configuration ─────────────────────────────────────────────────

export interface ConnectorServiceConfig {
  postgresUrl: string;
  redisUrl: string;
  port?: number;
  encryptionKey?: string;
  baseUrl?: string;
  oauthRedirectBaseUrl?: string;
}

export const DEFAULT_CONFIG: Partial<ConnectorServiceConfig> = {
  port: 3003,
};

// ─── OAuth / Token ─────────────────────────────────────────────────────────

/** Stored token record (encrypted at rest). */
export interface ConnectorToken {
  id: string;
  account_id: string;
  token_type: "access" | "refresh" | "api_key";
  token_encrypted: string;
  metadata: Metadata;
  expires_at?: Timestamp;
  created_at: Timestamp;
}

/** OAuth state parameter (used for CSRF protection during OAuth flow). */
export interface OAuthState {
  state: string;
  connector_type: string;
  workspace_id: WorkspaceId;
  redirect_uri?: string;
  expires_at: Timestamp;
  created_at: Timestamp;
}

/** Result of an OAuth token exchange. */
export interface OAuthTokenResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  raw?: Metadata;
}

/** OAuth callback parameters. */
export interface OAuthCallbackParams {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

// ─── Sync Job Record (internal DB shape) ───────────────────────────────────

/** Extended sync job record as stored in the database. */
export interface SyncJobRecord {
  id: string;
  account_id: string;
  workspace_id: WorkspaceId;
  connector_type: string;
  status: SyncJobStatus;
  sync_mode: "full" | "incremental";
  cursor_before?: string;
  cursor_after?: string;
  discovered_count: number;
  processed_count: number;
  skipped_count: number;
  error_count: number;
  error_message?: string;
  progress: Metadata;
  started_at?: Timestamp;
  completed_at?: Timestamp;
  created_at: Timestamp;
}

/** Sync state record as stored in the database. */
export interface SyncStateRecord {
  id: string;
  account_id: string;
  connector_type: string;
  cursor?: string;
  last_synced_at?: Timestamp;
  resource_checksums: Record<string, string>;
  sync_count: number;
  delta_detected: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─── Connector Account Record (internal DB shape) ──────────────────────────

/** Extended connector account record as stored in the database. */
export interface ConnectorAccountRecord {
  id: string;
  workspace_id: WorkspaceId;
  connector_type: string;
  label: string;
  credential_ref: string;
  config: ConnectorConfig;
  is_active: boolean;
  last_synced_at?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ─── Connector Plugin Interface ────────────────────────────────────────────

/**
 * Result of a sync operation from a connector plugin.
 */
export interface SyncResult {
  /** External items discovered during sync. */
  items: ExternalItem[];
  /** New cursor for incremental sync (provider-specific). */
  cursor?: string;
  /** Whether more items are available (pagination). */
  hasMore: boolean;
  /** Raw metadata about the sync operation. */
  metadata: Metadata;
}

/**
 * An external item discovered by a connector during sync.
 */
export interface ExternalItem {
  /** Unique identifier from the external system. */
  externalId: string;
  /** Human-readable name / title. */
  name: string;
  /** MIME type, if known. */
  mimeType?: string;
  /** Size in bytes. */
  sizeBytes?: number;
  /** External last-modified timestamp. */
  updatedAt?: Timestamp;
  /** External creation timestamp. */
  createdAt?: Timestamp;
  /** External parent / path reference. */
  parentRef?: string;
  /** Checksum / hash for change detection. */
  checksum?: string;
  /** External URL or path. */
  externalUrl?: string;
  /** Whether this is a deletion event. */
  isDeleted: boolean;
  /** Raw item metadata from the external system. */
  raw: Metadata;
}

/**
 * Interface that every connector plugin must implement.
 *
 * Connector plugins live in the `connectors/` directory and are loaded
 * by the connector-service at runtime.
 */
export interface ConnectorPlugin {
  /** Unique connector type slug (e.g. "google-drive", "slack"). */
  readonly type: string;

  /** Human-readable display name. */
  readonly displayName: string;

  /**
   * Build the OAuth authorization URL for this connector.
   * Returns the URL the user should be redirected to.
   */
  getAuthorizationUrl(params: {
    workspaceId: WorkspaceId;
    state: string;
    redirectUri: string;
    scopes?: string[];
  }): string;

  /**
   * Exchange an OAuth authorization code for tokens.
   */
  exchangeCodeForTokens(params: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenResult>;

  /**
   * Refresh an expired access token using a refresh token.
   */
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult>;

  /**
   * Validate that stored credentials are still valid.
   */
  validateCredentials(accessToken: string): Promise<boolean>;

  /**
   * Perform a sync operation against the external source.
   *
   * @param accessToken - Valid access token for the external API.
   * @param config - Connector-specific configuration.
   * @param cursor - Opaque cursor from the previous sync (for incremental).
   * @param since - Timestamp for delta sync.
   */
  sync(params: {
    accessToken: string;
    config: ConnectorConfig;
    cursor?: string;
    since?: Timestamp;
  }): Promise<SyncResult>;

  /**
   * Handle an incoming webhook event from the external service.
   * Returns external items that were created, updated, or deleted.
   */
  handleWebhook?(params: {
    payload: unknown;
    headers: Record<string, string>;
    accessToken: string;
    config: ConnectorConfig;
  }): Promise<ExternalItem[]>;

  /**
   * Revoke OAuth tokens for this connector (disconnect).
   */
  revokeTokens?(accessToken: string): Promise<void>;
}

// ─── Webhook ───────────────────────────────────────────────────────────────

/** Validated webhook event ready for processing. */
export interface WebhookEvent {
  id: string;
  connector_type: string;
  account_id: string;
  event_type: string;
  payload: unknown;
  headers: Record<string, string>;
  received_at: Timestamp;
  validated: boolean;
  signature_valid?: boolean;
  raw_body?: string;
}

// ─── Service State ─────────────────────────────────────────────────────────

/** Runtime state for an active connector service instance. */
export interface ConnectorServiceState {
  activeJobs: Map<string, SyncJobRecord>;
  schedulerInterval?: ReturnType<typeof setInterval>;
}

// ─── DTOs ──────────────────────────────────────────────────────────────────

/** Request body for triggering a sync. */
export interface SyncRequestDto {
  sync_mode?: "full" | "incremental";
  account_id?: string;
}

/** Sync status response. */
export interface SyncStatusResponse {
  connector_type: string;
  account_id: string;
  account_label: string;
  is_active: boolean;
  last_sync?: {
    job_id: string;
    status: SyncJobStatus;
    started_at?: Timestamp;
    completed_at?: Timestamp;
    discovered_count: number;
    processed_count: number;
  };
  sync_state: SyncState;
  active_jobs: number;
}
