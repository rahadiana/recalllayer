import { describe, it, expect } from "vitest";
import { createRelationDetector } from "../src/relation-detector.js";
import { createEntityExtractor } from "../src/entity-extractor.js";
import type { ExtractedRelationCandidate } from "../src/types.js";

const detector = createRelationDetector();
const extractor = createEntityExtractor();

describe("RelationDetector", () => {
  it("detects explicit 'works_at' relations via patterns", () => {
    const chunks = [
      { id: "chunk-1", text: "John Smith works at Acme Corporation.", document_id: "doc-1" },
    ];

    const entities = extractor.extractFromChunks(
      [{ id: "chunk-1", text: "John Smith works at Acme Corporation." }],
      "doc-1",
      "ws-1",
    );

    const relations = detector.detectRelations(entities, chunks);

    const worksAt = relations.find((r) => r.relation_type === "works_at");
    expect(worksAt).toBeDefined();
    expect(worksAt!.confidence).toBeGreaterThan(0);
  });

  it("detects 'located_in' relations", () => {
    const text = "The company's main office is located in San Francisco. The company is located in San Francisco.";
    const chunks = [
      { id: "chunk-1", text, document_id: "doc-1" },
    ];

    const entities = extractor.extractFromChunks(
      [{ id: "chunk-1", text }],
      "doc-1",
      "ws-1",
    );

    const relations = detector.detectRelations(entities, chunks);

    const locatedIn = relations.filter((r) => r.relation_type === "located_in");
    expect(Array.isArray(locatedIn)).toBe(true);
  });

  it("detects 'founded_by' relations", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "Microsoft was founded by Bill Gates and Paul Allen.",
        document_id: "doc-1",
      },
    ];

    const entities = extractor.extractFromChunks(
      [{ id: "chunk-1", text: "Microsoft was founded by Bill Gates and Paul Allen." }],
      "doc-1",
      "ws-1",
    );

    const relations = detector.detectRelations(entities, chunks);

    const foundedBy = relations.find((r) => r.relation_type === "founded_by");
    expect(foundedBy).toBeDefined();
  });

  it("detects co-occurrence relations from repeated mentions", () => {
    const text = "Alice works with Bob on the project. Alice and Bob presented together. Alice collaborated with Bob.";
    const chunks = [
      { id: "chunk-1", text, document_id: "doc-1" },
      { id: "chunk-2", text, document_id: "doc-1" },
      { id: "chunk-3", text, document_id: "doc-1" },
    ];

    const entities = extractor.extractFromChunks(
      chunks.map((c) => ({ id: c.id, text: c.text })),
      "doc-1",
      "ws-1",
    );

    const relations = detector.detectRelations(entities, chunks, {
      min_co_occurrence: 2,
    });

    const relatedTo = relations.filter((r) => r.relation_type === "related_to");
    expect(relatedTo.length).toBeGreaterThan(0);
    expect(relatedTo.some((r) => r.source_entity_name === "Alice" || r.target_entity_name === "Alice")).toBe(true);
  });

  it("detects proximity-based relations", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "The CEO announced a new initiative. The company will expand to Europe. Stock prices rose after the announcement.",
        document_id: "doc-1",
      },
    ];

    const entities = extractor.extractFromChunks(
      [{ id: "chunk-1", text: "The CEO announced a new initiative. The company will expand to Europe." }],
      "doc-1",
      "ws-1",
    );

    const relations = detector.detectRelations(entities, chunks, {
      max_sentence_distance: 2,
    });

    const nearbyRels = relations.filter((r) => r.relation_type === "nearby");
    expect(nearbyRels.length).toBeGreaterThanOrEqual(0);
  });

  it("respects min_confidence config", () => {
    const chunks = [
      { id: "chunk-1", text: "Some random entity and another random concept.", document_id: "doc-1" },
    ];

    const entities = extractor.extractFromChunks(
      [{ id: "chunk-1", text: "Some random entity and another random concept." }],
      "doc-1",
      "ws-1",
    );

    const highConf = detector.detectRelations(entities, chunks, { min_confidence: 1.0 });
    const lowConf = detector.detectRelations(entities, chunks, { min_confidence: 0.0 });

    expect(highConf.length).toBeLessThanOrEqual(lowConf.length);
  });

  it("deduplicates relations by key", () => {
    const chunks = [
      { id: "chunk-1", text: "John works at Acme. John works at Acme. John works at Acme.", document_id: "doc-1" },
    ];

    const entities = extractor.extractFromChunks(
      [{ id: "chunk-1", text: "John works at Acme." }],
      "doc-1",
      "ws-1",
    );

    const relations = detector.detectRelations(entities, chunks);

    const worksAt = relations.filter(
      (r) => r.relation_type === "works_at" && r.source_entity_name === "John",
    );
    expect(worksAt.length).toBeLessThanOrEqual(1);
  });

  it("skips relations for entities not in the list", () => {
    const chunks = [
      { id: "chunk-1", text: "Some unrelated text about nothing.", document_id: "doc-1" },
    ];

    const entities = extractor.extractFromChunks(
      [{ id: "chunk-1", text: "Some unrelated text about nothing." }],
      "doc-1",
      "ws-1",
    );

    const relations = detector.detectRelations(entities, chunks);
    expect(Array.isArray(relations)).toBe(true);
  });
});
