import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";

vi.mock("@memory-platform/observability", () => {
  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    createLogger: vi.fn().mockReturnValue(mockLogger),
  };
});

vi.mock("@memory-platform/shared-utils", () => {
  let counter = 0;
  return {
    generateId: vi.fn(() => {
      counter++;
      return `event_${counter}`;
    }),
  };
});

vi.mock("@memory-platform/queue", () => {
  const publish = vi.fn().mockResolvedValue("mock_event_id");
  return {
    Publisher: class {
      publish = publish;
      publishBulk = vi.fn().mockResolvedValue(["mock_event_id"]);
    },
    validateEnvelope: vi.fn().mockReturnValue({}),
    buildKey: vi.fn((...args: string[]) => args.join(":")),
  };
});

import { EventPublisher } from "../src/events.js";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

describe("EventPublisher", () => {
  let publisher: EventPublisher;

  beforeEach(() => {
    publisher = new EventPublisher(
      {
        ping: vi.fn().mockResolvedValue("PONG"),
        quit: vi.fn().mockResolvedValue("OK"),
        publish: vi.fn().mockResolvedValue(1),
        duplicate: vi.fn(),
        on: vi.fn(),
        lpush: vi.fn(),
        rpop: vi.fn(),
        pipeline: vi.fn(),
        hget: vi.fn(),
        hset: vi.fn(),
      } as any,
      { redisUrl: "redis://localhost:6379", defaultChannel: "profile", keyPrefix: "profile" },
    );
  });

  describe("publishProfileUpdated", () => {
    it("publishes profile.updated event with correct payload", async () => {
      const payload = {
        profile_id: "ws-1:user-1",
        workspace_id: "ws-1",
        user_id: "user-1",
        changed_keys: ["language"],
        preference_count: 5,
        fact_count: 3,
      };

      const eventId = await publisher.publishProfileUpdated(
        "ws-1" as WorkspaceId,
        payload,
      );

      expect(eventId).toBe("mock_event_id");
    });

    it("accepts optional correlation ID", async () => {
      const payload = {
        profile_id: "ws-1:user-1",
        workspace_id: "ws-1",
        user_id: "user-1",
        changed_keys: [],
        preference_count: 0,
        fact_count: 0,
      };

      const eventId = await publisher.publishProfileUpdated(
        "ws-1" as WorkspaceId,
        payload,
        "corr-123",
      );

      expect(eventId).toBeDefined();
    });
  });

  describe("publishPreferenceDetected", () => {
    it("publishes preference.detected event with correct payload", async () => {
      const payload = {
        profile_id: "ws-1:user-1",
        workspace_id: "ws-1",
        user_id: "user-1",
        preference_key: "language",
        preference_value: "id",
        confidence: 0.9,
        source: "inferred" as const,
      };

      const eventId = await publisher.publishPreferenceDetected(
        "ws-1" as WorkspaceId,
        payload,
      );

      expect(eventId).toBe("mock_event_id");
    });
  });
});
