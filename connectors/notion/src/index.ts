/**
 * Notion Connector Plugin.
 *
 * Implements the ConnectorPlugin interface from the connector-service.
 * Provides OAuth authorization, token management, and sync capabilities
 * for Notion workspaces.
 *
 * This connector fetches raw page/database metadata only. It does NOT
 * perform content extraction, parsing, embedding, indexing, or search.
 */

import type { ConnectorConfig, WorkspaceId, Timestamp } from "@memory-platform/shared-schemas";
import type { ConnectorPlugin, OAuthTokenResult, SyncResult } from "./types.js";
import type { NotionOAuthConfig } from "./auth.js";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  validateCredentials,
  refreshAccessToken,
  revokeTokens,
} from "./auth.js";
import { syncNotion } from "./sync.js";

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type {
  NotionOAuthConfig,
} from "./auth.js";

export type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionBlockType,
  NotionRichText,
  NotionPaginatedResponse,
  NotionSearchResponse,
  NotionBlockChildrenResponse,
} from "./types.js";

export { NotionClient } from "./client.js";
export {
  mapPageToExternalItem,
  mapDatabaseToExternalItem,
  mapBlockToExternalItem,
  mapPageToDocumentSource,
  mapDatabaseToDocumentSource,
  richTextToPlain,
  extractPageTitle,
  computeChecksum,
  buildSyncResult,
} from "./mapper.js";
export { syncNotion } from "./sync.js";
export type { NotionSyncParams } from "./sync.js";

// ─── Connector Plugin Implementation ─────────────────────────────────────────

export class NotionConnector implements ConnectorPlugin {
  readonly type = "notion";
  readonly displayName = "Notion";

  private readonly oauthConfig: NotionOAuthConfig;

  constructor(oauthConfig: NotionOAuthConfig) {
    this.oauthConfig = oauthConfig;
  }

  // ─── OAuth ───────────────────────────────────────────────────────────═

  getAuthorizationUrl(params: {
    workspaceId: WorkspaceId;
    state: string;
    redirectUri: string;
    scopes?: string[];
  }): string {
    return buildAuthorizationUrl({
      clientId: this.oauthConfig.clientId,
      state: params.state,
      redirectUri: params.redirectUri || this.oauthConfig.redirectUri,
      scopes: params.scopes,
    });
  }

  async exchangeCodeForTokens(params: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenResult> {
    return exchangeCodeForTokens(params.code, {
      ...this.oauthConfig,
      redirectUri: params.redirectUri || this.oauthConfig.redirectUri,
    });
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<OAuthTokenResult> {
    return refreshAccessToken(refreshToken);
  }

  async validateCredentials(accessToken: string): Promise<boolean> {
    return validateCredentials(accessToken);
  }

  // ─── Sync ─────────────────────────────────────────────────────────═──

  async sync(params: {
    accessToken: string;
    config: ConnectorConfig;
    cursor?: string;
    since?: Timestamp;
  }): Promise<SyncResult> {
    return syncNotion({
      accessToken: params.accessToken,
      config: params.config,
      cursor: params.cursor,
      since: params.since,
    });
  }

  // ─── Webhooks ─────────────────────────────────────────────────════════

  async handleWebhook?(params: {
    payload: unknown;
    headers: Record<string, string>;
    accessToken: string;
    config: ConnectorConfig;
  }): Promise<import("./types.js").ExternalItem[]> {
    // Notion webhooks notify about page/database updates.
    // For now, return an empty array as a placeholder.
    // Production implementation would validate the webhook signature
    // and fetch the changed resource.
    void params.payload;
    void params.headers;
    void params.accessToken;
    void params.config;
    return [];
  }

  // ─── Revocation ─────────────────────────────────────────────═──────

  async revokeTokens?(accessToken: string): Promise<void> {
    return revokeTokens(accessToken);
  }
}
