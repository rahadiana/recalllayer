/**
 * Notion OAuth helpers.
 *
 * Handles authorization URL construction, token exchange, token refresh,
 * and credential validation for the Notion integration.
 *
 * Notion OAuth 2.0 uses the authorization code grant flow.
 * Base URLs:
 *   - Authorization: https://api.notion.com/v1/oauth/authorize
 *   - Token:         https://api.notion.com/v1/oauth/token
 *
 * Note: Notion access tokens do not expire (as of API version 2022-06-28).
 * The refreshAccessToken method returns the same token for compatibility
 * with the ConnectorPlugin interface.
 */

import type { OAuthTokenResult } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const NOTION_OAUTH_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_OAUTH_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API_VERSION = "2022-06-28";

// ─── OAuth Configuration ─────────────────────────────────────────────────────

export interface NotionOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Default scopes for Notion integration. */
export const DEFAULT_NOTION_SCOPES = [
  "read:content",
  "read:database",
  "read:user",
];

// ─── Authorization URL ───────────────────────────────────────────────────────

/**
 * Build the Notion OAuth authorization URL.
 *
 * @param clientId - Notion OAuth client ID
 * @param state - OAuth state parameter (CSRF protection)
 * @param redirectUri - Callback URL
 * @param scopes - OAuth scopes (defaults to read-only content access)
 * @returns Fully constructed authorization URL
 */
export function buildAuthorizationUrl(params: {
  clientId: string;
  state: string;
  redirectUri: string;
  scopes?: string[];
}): string {
  const { clientId, state, redirectUri, scopes = DEFAULT_NOTION_SCOPES } = params;

  const url = new URL(NOTION_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scopes.join(" "));

  return url.toString();
}

// ─── Token Exchange ──────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for access tokens.
 *
 * This is a placeholder implementation. Actual HTTP requests should use
 * the Notion API client or a dedicated HTTP client.
 *
 * @param code - Authorization code from the OAuth callback
 * @param config - OAuth configuration
 * @returns Token result with access token
 */
export async function exchangeCodeForTokens(
  code: string,
  config: NotionOAuthConfig,
): Promise<OAuthTokenResult> {
  const response = await fetch(NOTION_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      "Notion-Version": NOTION_API_VERSION,
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Notion token exchange failed: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    owner: Record<string, unknown>;
    workspace_id?: string;
    workspace_name?: string;
    workspace_icon?: string;
    bot_id?: string;
    duplicated_template_id?: string;
  };

  return {
    access_token: data.access_token,
    token_type: data.token_type ?? "bearer",
    raw: {
      owner: data.owner,
      workspaceId: data.workspace_id,
      workspaceName: data.workspace_name,
      botId: data.bot_id,
    },
  };
}

// ─── Token Validation ────────────────────────────────────────────────────────

/**
 * Validate that stored credentials are still valid.
 *
 * Calls the Notion users/me endpoint to verify the token.
 * Returns false for any non-200 response.
 *
 * @param accessToken - Notion access token
 * @returns `true` if the token is valid
 */
export async function validateCredentials(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.notion.com/v1/users/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": NOTION_API_VERSION,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Token Refresh (No-op for Notion) ────────────────────────────────────────

/**
 * Refresh an access token.
 *
 * Notion access tokens are long-lived and do not expire. This returns
 * the same token for compatibility with the ConnectorPlugin interface.
 *
 * In a production implementation, this should use the stored access token
 * directly (or a stored refresh token if Notion adds support).
 *
 * @param _refreshToken - Unused (Notion does not issue refresh tokens)
 * @returns The same token result
 */
export async function refreshAccessToken(
  _refreshToken: string,
): Promise<OAuthTokenResult> {
  // Notion tokens do not expire; return a placeholder.
  return {
    access_token: _refreshToken,
    token_type: "bearer",
  };
}

// ─── Token Revocation (Placeholder) ──────────────────────────────────────────

/**
 * Revoke Notion access tokens.
 *
 * Placeholder - Notion does not provide a token revocation endpoint
 * as of API version 2022-06-28. This is a no-op kept for interface compatibility.
 *
 * @param _accessToken - Access token to revoke
 */
export async function revokeTokens(_accessToken: string): Promise<void> {
  // Notion does not have a token revocation endpoint.
  // Tokens can be revoked manually via the Notion integration settings page.
}
