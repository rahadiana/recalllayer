import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Message } from "@memory-platform/queue";
import type { Entity, Relation, WorkspaceId, EntityId } from "../src/types.js";
import type { EntityExtractor } from "../src/entity-extractor.js";
import type { RelationDetector } from "../src/relation-detector.js";
import type { GraphWriter } from "../src/graph-writer.js";
import type { ConflictDetector } from "../src/conflict-detector.js";
import type { EventPublisher } from "../src/events.js";
import type { DocumentIndexedPayload } from "../src/worker.js";
import { GraphWorker } from "../src/worker.js";

function createMessage(overrides: Partial<{
  document_id: string;
  workspace_id: string;
  chunk_count: number;
  chunks: Array<{ id: string; text: string; document_id: string }>;
  correlationId: string;
}> = {}): Message<DocumentIndexedPayload> {
  return {
    id: "msg-1",
    event: {
      id: "evt-1",
      type: "document.indexed",
      timestamp: new Date().toISOString(),
      payload: {
        document_id: overrides.document_id ?? "doc-123",
        chunk_count: overrides.chunk_count ?? 3,
        chunks: overrides.chunks ?? [
          { id: "chunk-1", text: "Apple Inc. is a technology company.", document_id: "doc-123" },
          { id: "chunk-2", text: "Apple was founded by Steve Jobs.", document_id: "doc-123" },
          { id: "chunk-3", text: "Apple's headquarters are in Cupertino.", document_id: "doc-123" },
        ],
        workspace_id: overrides.workspace_id ?? "ws-1",
      },
      correlationId: overrides.correlationId ?? "corr-1",
    },
    meta: {
      enqueuedAt: new Date().toISOString(),
      attempt: 1,
      channel: "document.indexed",
      consumerId: "consumer-1",
    },
  };
}

function createMockExtractor(): EntityExtractor {
  return {
    extractFromChunks: vi.fn(() => [
      {
        name: "Apple Inc.",
        entity_type: "organisation",
        aliases: ["Apple"],
        properties: { industry: "technology" },
        source_chunk_ids: ["chunk-1", "chunk-2", "chunk-3"],
        source_document_id: "doc-123",
        evidence_spans: ["Apple Inc. is a technology company"],
        confidence: 0.9,
      },
      {
        name: "Steve Jobs",
        entity_type: "person",
        aliases: [],
        properties: {},
        source_chunk_ids: ["chunk-2"],
        source_document_id: "doc-123",
        evidence_spans: ["Steve Jobs"],
        confidence: 0.85,
      },
      {
        name: "Cupertino",
        entity_type: "location",
        aliases: [],
        properties: {},
        source_chunk_ids: ["chunk-3"],
        source_document_id: "doc-123",
        evidence_spans: ["Cupertino"],
        confidence: 0.7,
      },
    ]),
  };
}

function createMockDetector(): RelationDetector {
  return {
    detectRelations: vi.fn(() => [
      {
        source_entity_name: "Apple Inc.",
        target_entity_name: "Steve Jobs",
        relation_type: "founded_by",
        properties: { detected_by: "pattern" },
        evidence_spans: ["founded by Steve Jobs"],
        confidence: 0.8,
      },
      {
        source_entity_name: "Apple Inc.",
        target_entity_name: "Cupertino",
        relation_type: "located_in",
        properties: { detected_by: "pattern" },
        evidence_spans: ["headquarters are in Cupertino"],
        confidence: 0.75,
      },
    ]),
  };
}

function createMockWriter(): GraphWriter {
  const entities = new Map<string, Entity>();
  const relations: Relation[] = [];
  let entityCounter = 0;
  let relCounter = 0;

  return {
    mergeEntity: vi.fn(async (candidate, wsId) => {
      const id = `ent_${++entityCounter}`;
      const entity: Entity = {
        id: id as EntityId,
        workspace_id: wsId,
        entity_type: candidate.entity_type,
        name: candidate.name,
        aliases: candidate.aliases,
        properties: candidate.properties,
        source_document_ids: [candidate.source_document_id],
        confidence: candidate.confidence,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      entities.set(candidate.name, entity);
      return entity;
    }),
    mergeEntities: vi.fn(async (candidates, wsId) => {
      const result = new Map<string, Entity>();
      for (const c of candidates) {
        const e = await (this as unknown as GraphWriter).mergeEntity(c, wsId);
        result.set(c.name, e);
      }
      return result;
    }),
    mergeRelation: vi.fn(async (candidate, wsId, nameMap) => {
      const sourceId = nameMap.get(candidate.source_entity_name);
      const targetId = nameMap.get(candidate.target_entity_name);
      if (!sourceId || !targetId) return null;
      const id = `rel_${++relCounter}`;
      const rel: Relation = {
        id,
        workspace_id: wsId,
        source_entity_id: sourceId as EntityId,
        target_entity_id: targetId as EntityId,
        relation_type: candidate.relation_type,
        properties: candidate.properties,
        source_document_ids: [],
        confidence: candidate.confidence,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      relations.push(rel);
      return rel;
    }),
    mergeRelations: vi.fn(async (candidates, wsId, nameMap) => {
      const results: Relation[] = [];
      for (const c of candidates) {
        const r = await (this as unknown as GraphWriter).mergeRelation(c, wsId, nameMap);
        if (r) results.push(r);
      }
      return results;
    }),
    ensureConstraints: vi.fn(async () => {}),
    deleteEntity: vi.fn(async () => {}),
  };
}

function createMockConflictDetector(): ConflictDetector {
  return {
    detectEntityConflicts: vi.fn(async () => []),
    detectRelationConflicts: vi.fn(async () => []),
    detectDuplicateEntities: vi.fn(async () => []),
    resolveConflict: vi.fn((conflictId, resolvedBy) => ({
      id: conflictId,
      conflict_type: "duplicate_entity" as const,
      workspace_id: "ws-1" as WorkspaceId,
      entity_ids: [],
      description: "Resolved",
      conflicting_facts: {},
      needs_review: false,
      status: "resolved" as const,
      resolved_by: resolvedBy,
      detected_at: "",
      resolved_at: new Date().toISOString(),
    })),
  };
}

function createMockEvents(): EventPublisher {
  return {
    publishEntityCreated: vi.fn(async () => "evt-entity"),
    publishRelationCreated: vi.fn(async () => "evt-relation"),
    publishGraphUpdated: vi.fn(async () => "evt-graph-updated"),
    publishConflictDetected: vi.fn(async () => "evt-conflict"),
  } as unknown as EventPublisher;
}

describe("GraphWorker", () => {
  let extractor: EntityExtractor;
  let detector: RelationDetector;
  let writer: GraphWriter;
  let conflictDetector: ConflictDetector;
  let events: EventPublisher;
  let worker: GraphWorker;

  beforeEach(() => {
    extractor = createMockExtractor();
    detector = createMockDetector();
    writer = createMockWriter();
    conflictDetector = createMockConflictDetector();
    events = createMockEvents();
    worker = new GraphWorker({
      extractor,
      detector,
      writer,
      conflictDetector,
      events,
    });
  });

  it("processes document.indexed event successfully", async () => {
    const message = createMessage();

    await worker.processDocumentIndexed(message);

    expect(extractor.extractFromChunks).toHaveBeenCalled();
    expect(writer.mergeEntities).toHaveBeenCalled();
    expect(detector.detectRelations).toHaveBeenCalled();
    expect(writer.mergeRelations).toHaveBeenCalled();
  });

  it("publishes entity.created events for each entity", async () => {
    const message = createMessage();

    await worker.processDocumentIndexed(message);

    expect(events.publishEntityCreated).toHaveBeenCalled();
    const calls = (events.publishEntityCreated as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][2]).toBe("doc-123");
  });

  it("publishes relation.created events for each relation", async () => {
    const message = createMessage();

    await worker.processDocumentIndexed(message);

    expect(events.publishRelationCreated).toHaveBeenCalled();
  });

  it("publishes graph.updated at end of pipeline", async () => {
    const message = createMessage();

    await worker.processDocumentIndexed(message);

    expect(events.publishGraphUpdated).toHaveBeenCalledWith(
      "ws-1",
      expect.any(Number),
      expect.any(Number),
      "doc-123",
      "corr-1",
    );
  });

  it("handles empty chunks gracefully", async () => {
    const message = createMessage({
      chunks: [],
    });

    const mockExtractor = {
      extractFromChunks: vi.fn(() => []),
    } as unknown as EntityExtractor;

    const w = new GraphWorker({
      extractor: mockExtractor,
      detector,
      writer,
      conflictDetector,
      events,
    });

    await w.processDocumentIndexed(message);

    expect(events.publishGraphUpdated).toHaveBeenCalledWith(
      "ws-1",
      0,
      expect.any(Number),
      "doc-123",
      "corr-1",
    );
  });

  it("respects maxConcurrency limit", async () => {
    const singleWorker = new GraphWorker({
      extractor,
      detector,
      writer,
      conflictDetector,
      events,
      config: { maxConcurrency: 1 },
    });

    const message = createMessage();

    // Make extractor slow to block the slot
    const slowExtractor: EntityExtractor = {
      extractFromChunks: vi.fn(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
      ),
    };

    const slowWorker = new GraphWorker({
      extractor: slowExtractor,
      detector,
      writer,
      conflictDetector,
      events,
      config: { maxConcurrency: 1 },
    });

    const p1 = slowWorker.processDocumentIndexed(message);
    const p2 = slowWorker.processDocumentIndexed(message);

    await expect(Promise.all([p1, p2])).rejects.toThrow("Worker at capacity");
  });
});
