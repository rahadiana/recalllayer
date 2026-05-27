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
      return `test_id_${counter}`;
    }),
  };
});

import { ProfileRepository } from "../src/profile-repository.js";
import type { WorkspaceId, UserId } from "@memory-platform/shared-schemas";

type SqlFn = ReturnType<typeof vi.fn>;

function createMockPool() {
  const sql = vi.fn() as unknown as SqlFn;
  return {
    sql,
    health: vi.fn().mockResolvedValue({ status: "healthy", latencyMs: 1, checkedAt: new Date() }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ProfileRepository", () => {
  let repo: ProfileRepository;
  let mockPool: ReturnType<typeof createMockPool>;
  let sql: SqlFn;

  beforeEach(() => {
    mockPool = createMockPool();
    sql = mockPool.sql;
    repo = new ProfileRepository(mockPool);
  });

  describe("getOrCreateProfile", () => {
    it("returns existing profile when found", async () => {
      const existingRow = {
        id: "ws-1:user-1",
        workspace_id: "ws-1",
        user_id: "user-1",
        display_name: "Test User",
        behaviour_summary: JSON.stringify({
          total_searches: 10,
          total_document_views: 5,
          top_search_terms: ["ai", "ml"],
          top_categories: ["tech"],
          last_active_at: "2024-01-01T00:00:00.000Z",
        }),
        metadata: JSON.stringify({ role: "developer" }),
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
      };

      sql.mockResolvedValueOnce([existingRow]);

      const profile = await repo.getOrCreateProfile("ws-1" as WorkspaceId, "user-1" as UserId);

      expect(profile.id).toBe("ws-1:user-1");
      expect(profile.workspace_id).toBe("ws-1");
      expect(profile.user_id).toBe("user-1");
      expect(profile.display_name).toBe("Test User");
      expect(profile.behaviour_summary.total_searches).toBe(10);
    });

    it("creates new profile when not found", async () => {
      sql.mockResolvedValueOnce([]);
      sql.mockResolvedValueOnce([]);

      const profile = await repo.getOrCreateProfile("ws-1" as WorkspaceId, "user-1" as UserId);

      expect(profile.id).toBe("ws-1:user-1");
      expect(profile.workspace_id).toBe("ws-1");
      expect(profile.user_id).toBe("user-1");
      expect(profile.preferences).toEqual([]);
      expect(profile.facts).toEqual([]);
      expect(profile.behaviour_summary.total_searches).toBe(0);
    });
  });

  describe("upsertPreference", () => {
    it("creates a new preference", async () => {
      sql.mockResolvedValueOnce([]);

      const row = {
        id: "pref_1",
        profile_id: "ws-1:user-1",
        key: "language",
        value: "id",
        source: "explicit",
        confidence: 1.0,
        updated_at: "2024-01-01T00:00:00.000Z",
      };
      sql.mockResolvedValueOnce([row]);

      const pref = await repo.upsertPreference("ws-1:user-1", {
        key: "language",
        value: "id",
        source: "explicit",
      });

      expect(pref.key).toBe("language");
      expect(pref.value).toBe("id");
      expect(pref.source).toBe("explicit");
      expect(pref.confidence).toBe(1.0);
    });

    it("updates existing preference", async () => {
      sql.mockResolvedValueOnce([{ id: "pref_1" }]);

      const row = {
        id: "pref_1",
        profile_id: "ws-1:user-1",
        key: "language",
        value: "en",
        source: "inferred",
        confidence: 0.8,
        updated_at: "2024-01-02T00:00:00.000Z",
      };
      sql.mockResolvedValueOnce([row]);

      const pref = await repo.upsertPreference("ws-1:user-1", {
        key: "language",
        value: "en",
        source: "inferred",
        confidence: 0.8,
      });

      expect(pref.value).toBe("en");
      expect(pref.source).toBe("inferred");
    });
  });

  describe("recordBehaviorEvent", () => {
    it("records a behavior event and returns it", async () => {
      sql.mockResolvedValueOnce([]);

      const event = await repo.recordBehaviorEvent(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
        {
          event_type: "search",
          payload: { query: "test" },
        },
      );

      expect(event.workspace_id).toBe("ws-1");
      expect(event.user_id).toBe("user-1");
      expect(event.event_type).toBe("search");
      expect(event.payload).toEqual({ query: "test" });
      expect(event.id).toMatch(/^bev_/);
      expect(event.occurred_at).toBeDefined();
    });
  });

  describe("getBehaviorEvents", () => {
    it("returns events ordered by occurred_at DESC", async () => {
      const rows = [
        {
          id: "bev_2",
          workspace_id: "ws-1",
          user_id: "user-1",
          event_type: "search",
          payload: JSON.stringify({ query: "latest" }),
          session_id: null,
          occurred_at: "2024-01-02T00:00:00.000Z",
        },
        {
          id: "bev_1",
          workspace_id: "ws-1",
          user_id: "user-1",
          event_type: "search",
          payload: JSON.stringify({ query: "old" }),
          session_id: "sess_1",
          occurred_at: "2024-01-01T00:00:00.000Z",
        },
      ];

      sql.mockResolvedValueOnce(rows);

      const events = await repo.getBehaviorEvents("ws-1" as WorkspaceId, "user-1" as UserId);

      expect(events).toHaveLength(2);
      expect(events[0].id).toBe("bev_2");
      expect(events[1].id).toBe("bev_1");
    });
  });

  describe("upsertProfileFact", () => {
    it("creates a new profile fact", async () => {
      sql.mockResolvedValueOnce([]);

      const row = {
        id: "fact_1",
        profile_id: "ws-1:user-1",
        key: "occupation",
        value: "software engineer",
        evidence: JSON.stringify(["doc_1"]),
        confidence: 0.9,
        observed_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      };
      sql.mockResolvedValueOnce([row]);

      const fact = await repo.upsertProfileFact("ws-1:user-1", {
        key: "occupation",
        value: "software engineer",
        evidence: ["doc_1"],
        confidence: 0.9,
      });

      expect(fact.key).toBe("occupation");
      expect(fact.value).toBe("software engineer");
      expect(fact.confidence).toBe(0.9);
    });
  });

  describe("buildProfileContext", () => {
    it("returns null for non-existent profile", async () => {
      sql.mockResolvedValueOnce([]);

      const context = await repo.buildProfileContext(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
      );

      expect(context).toBeNull();
    });

    it("builds full context with preferences and facts", async () => {
      sql.mockResolvedValueOnce([
        {
          id: "ws-1:user-1",
          workspace_id: "ws-1",
          user_id: "user-1",
          display_name: "Test User",
          behaviour_summary: JSON.stringify({
            total_searches: 5,
            total_document_views: 3,
            top_search_terms: ["ai"],
            top_categories: ["tech"],
          }),
          metadata: JSON.stringify({}),
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-02T00:00:00.000Z",
        },
      ]);

      sql.mockResolvedValueOnce([
        {
          id: "pref_1",
          profile_id: "ws-1:user-1",
          key: "language",
          value: "id",
          source: "explicit",
          confidence: 1.0,
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ]);

      sql.mockResolvedValueOnce([
        {
          id: "fact_1",
          profile_id: "ws-1:user-1",
          key: "occupation",
          value: "developer",
          evidence: JSON.stringify(["doc_1"]),
          confidence: 0.9,
          observed_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ]);

      const context = await repo.buildProfileContext(
        "ws-1" as WorkspaceId,
        "user-1" as UserId,
      );

      expect(context).not.toBeNull();
      expect(context!.display_name).toBe("Test User");
      expect(context!.preferences).toHaveLength(1);
      expect(context!.preferences[0].key).toBe("language");
      expect(context!.facts).toHaveLength(1);
      expect(context!.facts[0].key).toBe("occupation");
      expect(context!.behaviour_summary.total_searches).toBe(5);
    });
  });
});
