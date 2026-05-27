import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Application } from "express";
import request from "supertest";
import type { GraphReader } from "../src/graph-reader.js";
import type { WorkspaceId, EntityId, Entity } from "../src/types.js";
import { createGraphRouter } from "../src/routes/graph.js";

function createMockGraphReader(): GraphReader {
  return {
    getEntity: vi.fn(async (entityId, workspaceId) => {
      if (entityId === "non-existent") return null;
      return {
        id: entityId as EntityId,
        workspace_id: workspaceId,
        entity_type: "person",
        name: "Alice",
        aliases: [],
        properties: { role: "engineer" },
        source_document_ids: ["doc-1"],
        confidence: 0.9,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      } as Entity;
    }),
    queryGraph: vi.fn(async (query) => ({
      nodes: [
        { id: "ent_1", labels: ["Entity", "person"], properties: { name: "Alice" } },
        { id: "ent_2", labels: ["Entity", "person"], properties: { name: "Bob" } },
      ],
      edges: [
        { id: "edge_1", type: "KNOWS", source_id: "ent_1", target_id: "ent_2", properties: { since: 2020 } },
      ],
      paths: [{ nodes: [], edges: [], length: 1 }],
      total_nodes: 2,
      total_edges: 1,
      max_depth_reached: 1,
    })),
    getNeighbors: vi.fn(async (entityId, workspaceId) => ({
      nodes: [
        { id: "ent_2", labels: ["Entity", "person"], properties: { name: "Bob" } },
      ],
      edges: [],
      total_nodes: 1,
      total_edges: 0,
      max_depth_reached: 1,
    })),
    findPaths: vi.fn(async (sourceId, targetId, workspaceId) => ({
      nodes: [],
      edges: [],
      paths: [],
      total_nodes: 0,
      total_edges: 0,
      max_depth_reached: 0,
    })),
  };
}

function createApp(): Application {
  const app = express();
  app.use(express.json());
  const reader = createMockGraphReader();
  const router = createGraphRouter(reader);
  app.use(router);
  return app;
}

describe("Graph Routes", () => {
  let app: Application;

  beforeEach(() => {
    app = createApp();
  });

  describe("POST /internal/graph/query", () => {
    it("returns traversal result for valid query", async () => {
      const res = await request(app)
        .post("/internal/graph/query")
        .send({
          workspace_id: "ws-1",
          seed_entity_ids: ["ent_1"],
          max_depth: 2,
          max_nodes: 100,
        })
        .expect(200);

      expect(res.body.nodes).toBeDefined();
      expect(res.body.edges).toBeDefined();
      expect(res.body.total_nodes).toBe(2);
      expect(res.body.total_edges).toBe(1);
      expect(res.body.query_id).toBeDefined();
      expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it("returns 400 when workspace_id is missing", async () => {
      const res = await request(app)
        .post("/internal/graph/query")
        .send({
          seed_entity_ids: ["ent_1"],
        })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when seed_entity_ids is empty", async () => {
      const res = await request(app)
        .post("/internal/graph/query")
        .send({
          workspace_id: "ws-1",
          seed_entity_ids: [],
        })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when seed_entity_ids is missing", async () => {
      const res = await request(app)
        .post("/internal/graph/query")
        .send({
          workspace_id: "ws-1",
        })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("accepts optional parameters", async () => {
      const res = await request(app)
        .post("/internal/graph/query")
        .send({
          workspace_id: "ws-1",
          seed_entity_ids: ["ent_1"],
          max_depth: 3,
          max_nodes: 50,
          relation_types: ["KNOWS"],
          entity_types: ["person"],
          return_paths: true,
          min_confidence: 0.5,
        })
        .expect(200);

      expect(res.body.nodes).toBeDefined();
    });
  });

  describe("GET /internal/graph/entities/:id", () => {
    it("returns entity with neighbors", async () => {
      const res = await request(app)
        .get("/internal/graph/entities/ent_alice?workspace_id=ws-1")
        .expect(200);

      expect(res.body.entity).toBeDefined();
      expect(res.body.entity.name).toBe("Alice");
      expect(res.body.neighbors).toBeDefined();
      expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it("returns 404 for non-existent entity", async () => {
      const res = await request(app)
        .get("/internal/graph/entities/non-existent?workspace_id=ws-1")
        .expect(404);

      expect(res.body.code).toBe("ENTITY_NOT_FOUND");
    });

    it("defaults workspace_id when not provided", async () => {
      const res = await request(app)
        .get("/internal/graph/entities/ent_alice")
        .expect(200);

      expect(res.body.entity).toBeDefined();
    });
  });

  describe("POST /internal/graph/paths", () => {
    it("returns paths between entities", async () => {
      const res = await request(app)
        .post("/internal/graph/paths")
        .send({
          source_id: "ent_a",
          target_id: "ent_b",
          workspace_id: "ws-1",
        })
        .expect(200);

      expect(res.body.total_nodes).toBeDefined();
    });

    it("returns 400 when source_id is missing", async () => {
      const res = await request(app)
        .post("/internal/graph/paths")
        .send({
          target_id: "ent_b",
        })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("accepts optional max_depth and max_paths", async () => {
      const res = await request(app)
        .post("/internal/graph/paths")
        .send({
          source_id: "ent_a",
          target_id: "ent_b",
          workspace_id: "ws-1",
          max_depth: 5,
          max_paths: 20,
        })
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });
});
