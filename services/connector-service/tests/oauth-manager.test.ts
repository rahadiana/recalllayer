import { describe, it, expect, vi, beforeEach } from "vitest";
import { OAuthManager } from "../src/oauth-manager.js";
import type { ConnectorRepository } from "../src/repository.js";
import type { ConnectorPlugin, OAuthState, ConnectorToken } from "../src/types.js";

function makeMockRepo(): ConnectorRepository {
  return {
    storeOAuthState: vi.fn(),
    getOAuthState: vi.fn(),
    deleteOAuthState: vi.fn(),
    purgeExpiredOAuthStates: vi.fn(),
    storeToken: vi.fn(),
    getLatestToken: vi.fn(),
    deleteTokensForAccount: vi.fn(),
    getAccount: vi.fn(),
    getAccountByTypeAndWorkspace: vi.fn(),
  } as unknown as ConnectorRepository;
}

function makeMockPlugin(): ConnectorPlugin {
  return {
    type: "google-drive",
    displayName: "Google Drive",
    getAuthorizationUrl: vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth"),
    exchangeCodeForTokens: vi.fn().mockResolvedValue({
      access_token: "ya29.test-access-token",
      refresh_token: "1//test-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/drive.readonly",
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      access_token: "ya29.new-access-token",
      expires_in: 3600,
    }),
    validateCredentials: vi.fn().mockResolvedValue(true),
    sync: vi.fn().mockResolvedValue({ items: [], hasMore: false, metadata: {} }),
    revokeTokens: vi.fn().mockResolvedValue(undefined),
  };
}

describe("OAuthManager", () => {
  let oauth: OAuthManager;
  let mockRepo: ReturnType<typeof makeMockRepo>;
  const encryptionKey = "test-encryption-key-32-bytes-!!";

  beforeEach(() => {
    mockRepo = makeMockRepo();
    oauth = new OAuthManager(mockRepo, encryptionKey);
  });

  describe("encryption", () => {
    it("encrypts and decrypts a token correctly", () => {
      const raw = "sensitive-access-token-value";
      const packed = oauth.encryptToken(raw);
      const decrypted = oauth.decryptToken(packed);

      expect(decrypted).toBe(raw);
      expect(packed).not.toBe(raw);
      expect(packed).toContain("encrypted");
      expect(packed).toContain("iv");
      expect(packed).toContain("tag");
    });

    it("produces different ciphertext for same plaintext", () => {
      const raw = "same-token-value";
      const packed1 = oauth.encryptToken(raw);
      const packed2 = oauth.encryptToken(raw);

      const { encrypted: enc1 } = JSON.parse(packed1);
      const { encrypted: enc2 } = JSON.parse(packed2);

      expect(enc1).not.toBe(enc2);
    });

    it("throws when decrypting with wrong key", () => {
      const raw = "test-token";
      const packed = oauth.encryptToken(raw);

      const otherOauth = new OAuthManager(mockRepo, "different-encryption-key-32-bytes!");
      expect(() => otherOauth.decryptToken(packed)).toThrow();
    });

    it("handles special characters in tokens", () => {
      const raw = "token+with/special=chars&unicode=\u2603";
      const packed = oauth.encryptToken(raw);
      const decrypted = oauth.decryptToken(packed);
      expect(decrypted).toBe(raw);
    });
  });

  describe("initiateOAuth", () => {
    it("generates an auth URL and stores OAuth state", async () => {
      const plugin = makeMockPlugin();

      const result = await oauth.initiateOAuth({
        connectorType: "google-drive",
        workspaceId: "ws_test" as never,
        plugin,
        redirectUri: "http://localhost:3003/callback",
        scopes: ["drive.readonly"],
      });

      expect(result.authUrl).toBe("https://accounts.google.com/o/oauth2/auth");
      expect(result.state).toMatch(/^oauth/);
      expect(mockRepo.storeOAuthState).toHaveBeenCalledTimes(1);
      expect(mockRepo.storeOAuthState).toHaveBeenCalledWith(
        expect.objectContaining({
          state: result.state,
          connectorType: "google-drive",
        }),
      );
    });
  });

  describe("handleCallback", () => {
    it("throws on OAuth error from provider", async () => {
      const plugin = makeMockPlugin();

      await expect(
        oauth.handleCallback(
          plugin,
          { code: "", state: "test-state", error: "access_denied", error_description: "User denied" },
          "http://localhost/callback",
        ),
      ).rejects.toThrow("OAuth error: access_denied");
    });

    it("throws on invalid state", async () => {
      const plugin = makeMockPlugin();
      mockRepo.getOAuthState = vi.fn().mockResolvedValue(null);

      await expect(
        oauth.handleCallback(
          plugin,
          { code: "auth-code", state: "invalid-state" },
          "http://localhost/callback",
        ),
      ).rejects.toThrow("Invalid OAuth state");
    });

    it("throws on expired state", async () => {
      const plugin = makeMockPlugin();
      mockRepo.getOAuthState = vi.fn().mockResolvedValue({
        state: "test-state",
        connector_type: "google-drive",
        workspace_id: "ws_test",
        expires_at: new Date(Date.now() - 1000).toISOString(),
        created_at: new Date().toISOString(),
      } as OAuthState);

      await expect(
        oauth.handleCallback(
          plugin,
          { code: "auth-code", state: "test-state" },
          "http://localhost/callback",
        ),
      ).rejects.toThrow("OAuth state expired");
    });

    it("exchanges code and returns workspace info", async () => {
      const plugin = makeMockPlugin();
      mockRepo.getOAuthState = vi.fn().mockResolvedValue({
        state: "test-state",
        connector_type: "google-drive",
        workspace_id: "ws_test",
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        created_at: new Date().toISOString(),
      } as OAuthState);

      const result = await oauth.handleCallback(
        plugin,
        { code: "auth-code", state: "test-state" },
        "http://localhost/callback",
      );

      expect(result.workspaceId).toBe("ws_test");
      expect(result.connectorType).toBe("google-drive");
      expect(result.tokenResult.access_token).toBe("ya29.test-access-token");
      expect(mockRepo.deleteOAuthState).toHaveBeenCalledWith("test-state");
    });
  });

  describe("storeTokens", () => {
    it("stores access and refresh tokens encrypted", async () => {
      await oauth.storeTokens("acct_123", {
        access_token: "access-123",
        refresh_token: "refresh-123",
        expires_in: 3600,
      });

      expect(mockRepo.storeToken).toHaveBeenCalledTimes(2);

      const accessCall = (mockRepo.storeToken as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(accessCall.tokenType).toBe("access");
      expect(accessCall.tokenEncrypted).toContain("encrypted");
      expect(accessCall.tokenEncrypted).not.toContain("access-123");

      const refreshCall = (mockRepo.storeToken as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(refreshCall.tokenType).toBe("refresh");
    });
  });

  describe("getValidAccessToken", () => {
    it("returns decrypted token when not expired", async () => {
      mockRepo.getLatestToken = vi.fn().mockResolvedValue({
        token_encrypted: oauth.encryptToken("valid-access-token"),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      } as ConnectorToken);

      const plugin = makeMockPlugin();
      const token = await oauth.getValidAccessToken("acct_123", plugin);

      expect(token).toBe("valid-access-token");
    });

    it("refreshes when token is expired", async () => {
      mockRepo.getLatestToken = vi.fn().mockResolvedValue({
        token_encrypted: oauth.encryptToken("expired-token"),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      } as ConnectorToken);

      const plugin = makeMockPlugin();
      const token = await oauth.getValidAccessToken("acct_123", plugin);

      expect(token).toBe("ya29.new-access-token");
      expect(plugin.refreshAccessToken).toHaveBeenCalled();
    });

    it("refreshes when credentials are invalid", async () => {
      mockRepo.getLatestToken = vi.fn().mockResolvedValue({
        token_encrypted: oauth.encryptToken("invalid-token"),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      } as ConnectorToken);

      const plugin = makeMockPlugin();
      (plugin.validateCredentials as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const token = await oauth.getValidAccessToken("acct_123", plugin);
      expect(token).toBe("ya29.new-access-token");
    });
  });

  describe("revokeTokens", () => {
    it("revokes tokens with provider and deletes from storage", async () => {
      mockRepo.getLatestToken = vi.fn().mockResolvedValue({
        token_encrypted: oauth.encryptToken("token-to-revoke"),
      } as ConnectorToken);

      const plugin = makeMockPlugin();
      await oauth.revokeTokens("acct_123", plugin);

      expect(plugin.revokeTokens).toHaveBeenCalledWith("token-to-revoke");
      expect(mockRepo.deleteTokensForAccount).toHaveBeenCalledWith("acct_123");
    });

    it("deletes tokens even if provider revoke fails", async () => {
      mockRepo.getLatestToken = vi.fn().mockResolvedValue({
        token_encrypted: oauth.encryptToken("token-to-revoke"),
      } as ConnectorToken);

      const plugin = makeMockPlugin();
      (plugin.revokeTokens as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));

      await oauth.revokeTokens("acct_123", plugin);

      expect(mockRepo.deleteTokensForAccount).toHaveBeenCalledWith("acct_123");
    });
  });
});
