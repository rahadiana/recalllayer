import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookReceiver } from "../src/webhook-receiver.js";
import { ConnectorRegistry } from "../src/connector-registry.js";
import type { ConnectorRepository } from "../src/repository.js";
import type { ConnectorPlugin } from "../src/types.js";
import type { Request } from "express";

function makeMockRepo(): Pick<ConnectorRepository, "getAccountByTypeAndWorkspace"> {
  return {
    getAccountByTypeAndWorkspace: vi.fn(),
  };
}

function makeMockPlugin(opts?: { hasWebhook?: boolean }): ConnectorPlugin {
  return {
    type: "slack",
    displayName: "Slack",
    getAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    validateCredentials: vi.fn(),
    sync: vi.fn(),
    handleWebhook: opts?.hasWebhook !== false
      ? vi.fn().mockResolvedValue([{
          externalId: "msg_123",
          name: "New message",
          isDeleted: false,
          raw: {},
        }])
      : undefined,
  };
}

function makeMockRequest(overrides?: Partial<Request>): Request {
  return {
    body: { event: { type: "message", text: "hello" } },
    headers: {
      "content-type": "application/json",
      "x-slack-signature": "v0=abc123",
    },
    ...overrides,
  } as Request;
}

describe("WebhookReceiver", () => {
  let receiver: WebhookReceiver;
  let mockRegistry: ConnectorRegistry;
  let mockRepo: ReturnType<typeof makeMockRepo>;

  beforeEach(() => {
    mockRegistry = new ConnectorRegistry();
    mockRepo = makeMockRepo();
    receiver = new WebhookReceiver(mockRegistry, mockRepo);
  });

  it("processes webhook from registered connector", async () => {
    const plugin = makeMockPlugin();
    mockRegistry.register(plugin);

    const req = makeMockRequest();
    const result = await receiver.receiveWebhook("slack", req);

    expect(result.event.connector_type).toBe("slack");
    expect(result.event.validated).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].externalId).toBe("msg_123");
  });

  it("returns empty items when no webhook handler on plugin", async () => {
    const plugin = makeMockPlugin({ hasWebhook: false });
    mockRegistry.register(plugin);

    const req = makeMockRequest();
    const result = await receiver.receiveWebhook("slack", req);

    expect(result.items).toHaveLength(0);
    expect(result.event.validated).toBe(false);
  });

  it("throws for unregistered connector type", async () => {
    const req = makeMockRequest();

    await expect(
      receiver.receiveWebhook("unknown-type", req),
    ).rejects.toThrow("No connector plugin registered for type: unknown-type");
  });

  it("generates a webhook event ID", async () => {
    const plugin = makeMockPlugin();
    mockRegistry.register(plugin);

    const req = makeMockRequest();
    const result = await receiver.receiveWebhook("slack", req);

    expect(result.event.id).toMatch(/^wh/);
  });

  it("records received timestamp", async () => {
    const plugin = makeMockPlugin();
    mockRegistry.register(plugin);

    const req = makeMockRequest();
    const result = await receiver.receiveWebhook("slack", req);

    expect(result.event.received_at).toBeDefined();
    expect(new Date(result.event.received_at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("passes headers to webhook handler", async () => {
    const plugin = makeMockPlugin();
    mockRegistry.register(plugin);

    const req = makeMockRequest({
      headers: { "x-custom": "test-value", "content-type": "application/json" },
    });

    await receiver.receiveWebhook("slack", req);

    const handlerCall = (plugin.handleWebhook as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(handlerCall.headers["x-custom"]).toBe("test-value");
  });

  it("handles webhook without signature header", async () => {
    const plugin = makeMockPlugin();
    mockRegistry.register(plugin);

    const req = makeMockRequest({
      headers: { "content-type": "application/json" },
    });

    const result = await receiver.receiveWebhook("slack", req);
    expect(result.event.validated).toBe(true);
  });
});
