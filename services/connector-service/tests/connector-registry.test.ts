import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectorRegistry } from "../src/connector-registry.js";
import type { ConnectorPlugin } from "../src/types.js";

function makeMockPlugin(type: string, displayName: string): ConnectorPlugin {
  return {
    type,
    displayName,
    getAuthorizationUrl: vi.fn().mockReturnValue("https://example.com/auth"),
    exchangeCodeForTokens: vi.fn().mockResolvedValue({
      access_token: "mock-access-token",
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      access_token: "mock-refreshed-token",
    }),
    validateCredentials: vi.fn().mockResolvedValue(true),
    sync: vi.fn().mockResolvedValue({
      items: [],
      hasMore: false,
      metadata: {},
    }),
  };
}

describe("ConnectorRegistry", () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it("registers a plugin successfully", () => {
    const plugin = makeMockPlugin("google-drive", "Google Drive");
    registry.register(plugin);
    expect(registry.has("google-drive")).toBe(true);
  });

  it("retrieves a registered plugin", () => {
    const plugin = makeMockPlugin("slack", "Slack");
    registry.register(plugin);
    const retrieved = registry.get("slack");
    expect(retrieved).toBe(plugin);
    expect(retrieved.displayName).toBe("Slack");
  });

  it("throws when getting unregistered plugin", () => {
    expect(() => registry.get("unknown")).toThrow(
      "No connector plugin registered for type: unknown",
    );
  });

  it("unregisters a plugin", () => {
    const plugin = makeMockPlugin("notion", "Notion");
    registry.register(plugin);
    expect(registry.has("notion")).toBe(true);
    registry.unregister("notion");
    expect(registry.has("notion")).toBe(false);
  });

  it("lists all registered plugins", () => {
    registry.register(makeMockPlugin("gmail", "Gmail"));
    registry.register(makeMockPlugin("slack", "Slack"));

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.type)).toContain("gmail");
    expect(list.map((p) => p.type)).toContain("slack");
  });

  it("returns registered type names", () => {
    registry.register(makeMockPlugin("web-crawler", "Web Crawler"));
    const types = registry.getRegisteredTypes();
    expect(types).toEqual(["web-crawler"]);
  });

  it("overwrites plugin when registering same type", () => {
    const plugin1 = makeMockPlugin("test", "Test 1");
    const plugin2 = makeMockPlugin("test", "Test 2");

    registry.register(plugin1);
    registry.register(plugin2);

    const retrieved = registry.get("test");
    expect(retrieved.displayName).toBe("Test 2");
  });
});
