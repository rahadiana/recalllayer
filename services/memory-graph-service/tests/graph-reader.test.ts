import { describe, it, expect, beforeEach, vi } from "vitest";
import type { GraphClient } from "@memory-platform/db";
import type { Driver, Session, Result, Record as NeoRecord } from "neo4j-driver";
import type { WorkspaceId, EntityId } from "../src/types.js";

function createMockDriver(): Driver {
  return {
    session: () => ({
      run: vi.fn(async (query: string, params?: Record<string, unknown>) => {
        if (query.includes("MATCH (e:Entity {id:")) {
          const entityId = params?.entityId as string;
          if (entityId === "non-existent") {
            return { records: [] } as Result;
          }

          return {
            records: [{
              get: (key: string) => ({
                id: entityId,
                workspace_id: params?.workspaceId as string,
                entity_type: "person",
                name: "Alice",
                aliases: ["A"],
                properties: '{"role":"engineer"}',
                source_document_ids: ["doc-1"],
                confidence: 0.9,
                created_at: "2024-01-01T00:00:00.000Z",
                updated_at: "2024-06-01T00:00:00.000Z",
              }),
            }] as unknown as NeoRecord[],
          } as Result;
        }

        if (query.includes("shortestPath")) {
          return {
            records: [{
              get: (key: string) => ({
                segments: [
                  {
                    start: {
                      identity: { toString: () => "0" },
                      properties: { id: "ent_a", name: "Alice" },
                      labels: ["Entity", "person"],
                    },
                    end: {
                      identity: { toString: () => "1" },
                      properties: { id: "ent_b", name: "Bob" },
                      labels: ["Entity", "person"],
                    },
                    relationship: {
                      identity: { toString: () => "r1" },
                      type: "KNOWS",
                      properties: { confidence: 0.9 },
                    },
                  },
                ],
              }),
            }] as unknown as NeoRecord[],
          } as Result;
        }

        return {
          records: [{
            get: (key: string) => {
              if (key === "nodes") return [
                { id: "ent_a", labels: ["Entity", "person"], name: "Alice", entity_type: "person", properties: {}, confidence: 0.9 },
                { id: "ent_b", labels: ["Entity", "person"], name: "Bob", entity_type: "person", properties: {}, confidence: 0.8 },
              ];
              if (key === "edges") return [[
                { id: "r1", type: "KNOWS", relation_type: "knows", source_entity_id: "ent_a", target_entity_id: "ent_b", properties: '{"since":2020}' },
              ]];
              if (key === "paths") return [];
              return [];
            },
          }] as unknown as NeoRecord[],
        } as Result;
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

describe("GraphReader", () => {
  let reader: ReturnType<typeof import("../src/graph-reader.js").createGraphReader>;

  beforeEach(async () => {
    const { createGraphReader } = await import("../src/graph-reader.js");
    reader = createGraphReader(createMockGraphClient());
  });

  it("returns entity by ID", async () => {
    const entity = await reader.getEntity(
      "ent_alice" as EntityId,
      "ws-1" as WorkspaceId,
    );

    expect(entity).not.toBeNull();
    expect(entity!.name).toBe("Alice");
    expect(entity!.entity_type).toBe("person");
    expect(entity!.id).toBe("ent_alice");
  });

  it("returns null for non-existent entity", async () => {
    const entity = await reader.getEntity(
      "non-existent" as EntityId,
      "ws-1" as WorkspaceId,
    );

    expect(entity).toBeNull();
  });

  it("queries graph and returns traversal result", async () => {
    const result = await reader.queryGraph({
      workspace_id: "ws-1" as WorkspaceId,
      seed_entity_ids: ["ent_a" as EntityId],
      max_depth: 2,
      max_nodes: 100,
    });

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.total_nodes).toBeGreaterThan(0);
    expect(result.total_edges).toBeGreaterThan(0);
  });

  it("getNeighbors delegates to queryGraph with depth 1", async () => {
    const result = await reader.getNeighbors(
      "ent_a" as EntityId,
      "ws-1" as WorkspaceId,
    );

    expect(result).toBeDefined();
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it("finds paths between entities", async () => {
    const result = await reader.findPaths(
      "ent_a" as EntityId,
      "ent_b" as EntityId,
      "ws-1" as WorkspaceId,
      4,
      10,
    );

    expect(result.paths).toBeDefined();
    expect(result.paths!.length).toBeGreaterThan(0);
    expect(result.paths![0].edges.length).toBeGreaterThan(0);
  });
});
