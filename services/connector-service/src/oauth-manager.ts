import crypto from "node:crypto";
import { ConnectorRepository } from "./repository.js";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { WorkspaceId, Timestamp } from "@memory-platform/shared-schemas";
import type { ConnectorPlugin, OAuthTokenResult, OAuthCallbackParams } from "./types.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class OAuthManager {
  private readonly log: Logger;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly repo: ConnectorRepository,
    encryptionKey: string,
  ) {
    this.log = createLogger("oauth-manager");
    this.encryptionKey = crypto.scryptSync(encryptionKey, "connector-salt", 32);
  }

  encrypt(raw: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(raw, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    return { encrypted, iv: iv.toString("hex"), tag };
  }

  decrypt(
    encrypted: string,
    iv: string,
    tag: string,
  ): string {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  encryptToken(raw: string): string {
    const { encrypted, iv, tag } = this.encrypt(raw);
    return JSON.stringify({ encrypted, iv, tag });
  }

  decryptToken(packed: string): string {
    const { encrypted, iv, tag } = JSON.parse(packed) as {
      encrypted: string;
      iv: string;
      tag: string;
    };
    return this.decrypt(encrypted, iv, tag);
  }

  async initiateOAuth(params: {
    connectorType: string;
    workspaceId: WorkspaceId;
    plugin: ConnectorPlugin;
    redirectUri: string;
    scopes?: string[];
  }): Promise<{ authUrl: string; state: string }> {
    const state = generateId("oauth");
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000,
    ).toISOString() as Timestamp;

    await this.repo.storeOAuthState({
      state,
      connectorType: params.connectorType,
      workspaceId: params.workspaceId,
      redirectUri: params.redirectUri,
      expiresAt,
    });

    const authUrl = params.plugin.getAuthorizationUrl({
      workspaceId: params.workspaceId,
      state,
      redirectUri: params.redirectUri,
      scopes: params.scopes,
    });

    this.log.info("OAuth flow initiated", {
      connectorType: params.connectorType,
      workspaceId: params.workspaceId,
      state,
    });

    return { authUrl, state };
  }

  async handleCallback(
    plugin: ConnectorPlugin,
    params: OAuthCallbackParams,
    redirectUri: string,
  ): Promise<{
    workspaceId: WorkspaceId;
    connectorType: string;
    tokenResult: OAuthTokenResult;
  }> {
    if (params.error) {
      this.log.error("OAuth callback received error", {
        error: params.error,
        description: params.error_description,
      });
      throw new Error(
        `OAuth error: ${params.error} - ${params.error_description ?? "No description"}`,
      );
    }

    const oauthState = await this.repo.getOAuthState(params.state);
    if (!oauthState) {
      throw new Error(`Invalid OAuth state: ${params.state}`);
    }

    const expiresAt = new Date(oauthState.expires_at).getTime();
    if (Date.now() > expiresAt) {
      await this.repo.deleteOAuthState(params.state);
      throw new Error(`OAuth state expired: ${params.state}`);
    }

    const tokenResult = await plugin.exchangeCodeForTokens({
      code: params.code,
      redirectUri,
    });

    await this.repo.deleteOAuthState(params.state);

    this.log.info("OAuth callback processed successfully", {
      connectorType: oauthState.connector_type,
      workspaceId: oauthState.workspace_id,
    });

    return {
      workspaceId: oauthState.workspace_id,
      connectorType: oauthState.connector_type,
      tokenResult,
    };
  }

  async storeTokens(
    accountId: string,
    tokenResult: OAuthTokenResult,
  ): Promise<void> {
    const encryptedAccess = this.encryptToken(tokenResult.access_token);
    const expiresAt = tokenResult.expires_in
      ? new Date(
          Date.now() + tokenResult.expires_in * 1000,
        ).toISOString() as Timestamp
      : undefined;

    await this.repo.storeToken({
      accountId,
      tokenType: "access",
      tokenEncrypted: encryptedAccess,
      metadata: {
        token_type: tokenResult.token_type,
        scope: tokenResult.scope,
        raw: tokenResult.raw,
      },
      expiresAt,
    });

    if (tokenResult.refresh_token) {
      const encryptedRefresh = this.encryptToken(tokenResult.refresh_token);
      await this.repo.storeToken({
        accountId,
        tokenType: "refresh",
        tokenEncrypted: encryptedRefresh,
        metadata: {},
      });
    }

    this.log.info("Tokens stored", { accountId });
  }

  async getAccessToken(accountId: string): Promise<string> {
    const token = await this.repo.getLatestToken(accountId, "access");
    if (!token) {
      throw new Error(`No access token found for account: ${accountId}`);
    }
    return this.decryptToken(token.token_encrypted);
  }

  async getRefreshToken(accountId: string): Promise<string> {
    const token = await this.repo.getLatestToken(accountId, "refresh");
    if (!token) {
      throw new Error(`No refresh token found for account: ${accountId}`);
    }
    return this.decryptToken(token.token_encrypted);
  }

  async refreshAccessToken(
    accountId: string,
    plugin: ConnectorPlugin,
  ): Promise<string> {
    const refreshToken = await this.getRefreshToken(accountId);

    try {
      const result = await plugin.refreshAccessToken(refreshToken);
      await this.storeTokens(accountId, result);

      this.log.info("Access token refreshed", { accountId });
      return result.access_token;
    } catch (error) {
      this.log.error("Failed to refresh access token", {
        accountId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  async getValidAccessToken(
    accountId: string,
    plugin: ConnectorPlugin,
  ): Promise<string> {
    const token = await this.repo.getLatestToken(accountId, "access");
    if (!token) {
      throw new Error(`No access token found for account: ${accountId}`);
    }

    const isExpired =
      token.expires_at &&
      Date.now() > new Date(token.expires_at).getTime() - 5 * 60 * 1000;

    if (!isExpired) {
      const accessToken = this.decryptToken(token.token_encrypted);
      const isValid = await plugin.validateCredentials(accessToken);
      if (isValid) {
        return accessToken;
      }
    }

    return this.refreshAccessToken(accountId, plugin);
  }

  async revokeTokens(
    accountId: string,
    plugin?: ConnectorPlugin,
  ): Promise<void> {
    if (plugin?.revokeTokens) {
      try {
        const accessToken = await this.getAccessToken(accountId);
        await plugin.revokeTokens(accessToken);
      } catch (error) {
        this.log.warn("Failed to revoke tokens with provider", {
          accountId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    await this.repo.deleteTokensForAccount(accountId);
    this.log.info("Tokens revoked", { accountId });
  }
}
