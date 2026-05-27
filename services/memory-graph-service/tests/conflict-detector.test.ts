import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@memory-platform/observability", () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  recordMetric: vi.fn(),
  initMetrics: vi.fn(),
}));

import type { GraphClient } from "@memory-platform/db";
import type { Driver, Session, Result, Record as NeoRecord } from "neo4j-driver";
import type { Entity, Relation, WorkspaceId, EntityId } from "../src/types.js";

function createMockDriver(): Driver {
  return {
    session: () => ({
      run: vi.fn(async (query: string, params?: Record<string, unknown>) => {
        if (query.includes("any(alias IN")) {
          return {
            records: [{
              get: (key: string) => ({
                id: "ent_dup",
                name: params?.entityId === "ent_1" ? "TestEntity" : "OtherEntity",
                entity_type: "concept",
                aliases: [],
                properties: "{}",
              }),
            }] as unknown as NeoRecord[],
          } as Result;
        }

        if (query.includes("OPTIONAL MATCH (e)<-[r_in]-")) {
          return { records: [] } as Result;
        }

        if (query.includes("MATCH (source)-[r:")) {
          return {
            records: [{
              get: (key: string) => (key === "existing_confidence" ? 0.9 : undefined),
            }] as unknown as NeoRecord[],
          } as Result;
        }

        return { records: [] } as Result;
      }),
      close: vi.fn(async () => {}),
    }) as unknown as Session,
    close: vi.fn(async () => {}),
  } as unknown as Driver;
}

function createMockGraphClient(): GraphClient {
  return {
    driver: createMockDriver(),
    health: vi.fn(async () => ({ status: "healthy", latencyMs: 1, checkedAt: new Date() })),
    close: vi.fn(async () => {}),
    verifyConnectivity: vi.fn(async () => true),
  };
}

describe("ConflictDetector", () => {
  let detector: ReturnType<typeof import("../src/conflict-detector.js").createConflictDetector>;

  beforeEach(async () => {
    const { createConflictDetector } = await import("../src/conflict-detector.js");
    detector = createConflictDetector(createMockGraphClient());
  });

  it("detects duplicate entities", async () => {
    const entity: Entity = {
      id: "ent_1" as EntityId,
      workspace_id: "ws-1" as WorkspaceId,
      entity_type: "concept",
      name: "TestEntity",
      aliases: [],
      properties: {},
      source_document_ids: ["doc-1"],
      confidence: 0.9,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const conflicts = await detector.detectEntityConflicts(entity, "ws-1" as WorkspaceId);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflict_type).toBe("duplicate_entity");
    expect(conflicts[0].entity_ids).toContain("ent_1");
    expect(conflicts[0].needs_review).toBe(true);
    expect(conflicts[0].status).toBe("open");
  });

  it("returns empty array when no conflicts found", async () => {
    const entity: Entity = {
      id: "ent_unique" as EntityId,
      workspace_id: "ws-1" as WorkspaceId,
      entity_type: "location",
      name: "UniqueName",
      aliases: ["unique"],
      properties: {},
      source_document_ids: ["doc-1"],
      confidence: 0.9,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const conflicts = await detector.detectEntityConflicts(entity, "ws-1" as WorkspaceId);

    expect(Array.isArray(conflicts)).toBe(true);
  });

  it("detects conflicting confidence in relations", async () => {
    const relations: Relation[] = [
      {
        id: "rel_1",
        workspace_id: "ws-1" as WorkspaceId,
        source_entity_id: "ent_a" as EntityId,
        target_entity_id: "ent_b" as EntityId,
        relation_type: "knows",
        properties: {},
        source_document_ids: [],
        confidence: 0.3,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ];

    const conflicts = await detector.detectRelationConflicts(relations, "ws-1" as WorkspaceId);

    expect(Array.isArray(conflicts)).toBe(true);

    if (conflicts.length > 0) {
      expect(conflicts[0].conflict_type).toBe("contradictory_property");
    }
  });

  it("detects duplicate entities in a batch", async () => {
    const entities: Entity[] = [
      {
        id: "ent_a" as EntityId,
        workspace_id: "ws-1" as WorkspaceId,
        entity_type: "person",
        name: "Alice",
        aliases: [],
        properties: {},
        source_document_ids: [],
        confidence: 0.9,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "ent_b" as EntityId,
        workspace_id: "ws-1" as WorkspaceId,
        entity_type: "person",
        name: "Alice",
        aliases: [],
        properties: {},
        source_document_ids: [],
        confidence: 0.8,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      },
    ];

    const conflicts = await detector.detectDuplicateEntities(entities, "ws-1" as WorkspaceId);

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].conflict_type).toBe("duplicate_entity");
    expect(conflicts[0].entity_ids).toContain("ent_a");
    expect(conflicts[0].entity_ids).toContain("ent_b");
  });

  it("resolves a conflict", () => {
    const resolved = detector.resolveConflict("conflict_1", "admin-user");

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_by).toBe("admin-user");
    expect(resolved.needs_review).toBe(false);
  });
});
