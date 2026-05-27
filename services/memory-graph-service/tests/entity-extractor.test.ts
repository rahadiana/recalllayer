import { describe, it, expect } from "vitest";
import { createEntityExtractor } from "../src/entity-extractor.js";
import type { ExtractedEntityCandidate } from "../src/types.js";

const extractor = createEntityExtractor();

describe("EntityExtractor", () => {
  it("extracts capitalized names from text", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "John Smith works at Acme Corporation in New York.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1");

    const names = entities.map((e) => e.name);
    expect(names).toContain("John Smith");
    expect(names).toContain("Acme Corporation");
    expect(names).toContain("New York");
  });

  it("extracts dates from text", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "The project started on 2024-01-15 and ended on 2024-06-30.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1");

    const dateEntities = entities.filter((e) => e.entity_type === "date");
    expect(dateEntities.length).toBeGreaterThan(0);
    expect(dateEntities.some((e) => e.name === "2024-01-15")).toBe(true);
    expect(dateEntities.some((e) => e.name === "2024-06-30")).toBe(true);
  });

  it("assigns entity types based on context", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "Dr. Sarah Johnson is the CEO of TechCorp Inc.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1");

    const orgEntities = entities.filter((e) => e.entity_type === "organisation");
    const personEntities = entities.filter((e) => e.entity_type === "person");

    expect(orgEntities.length + personEntities.length).toBeGreaterThan(0);
  });

  it("detects concept entities from tech terms", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "The system uses TypeScript for the backend and React for the frontend, with PostgreSQL as the database.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1");

    const conceptEntities = entities.filter((e) => e.entity_type === "concept");
    expect(conceptEntities.length).toBeGreaterThan(0);
  });

  it("respects max_entities_per_document limit", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "Alice, Bob, Charlie, David, Eve, Frank, Grace, Henry work at BigCompany Inc. in San Francisco.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1", {
      max_entities_per_document: 5,
    });

    expect(entities.length).toBeLessThanOrEqual(5);
  });

  it("respects min_confidence filter", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "Some random text with no clear entities here.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1", {
      min_confidence: 0.9,
    });

    expect(entities.length).toBe(0);
  });

  it("filters by enabled_entity_types", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "Dr. Alice Johnson from Stanford University visited Paris on 2024-03-15.",
      },
    ];

    const dateOnly = extractor.extractFromChunks(chunks, "doc-1", "ws-1", {
      enabled_entity_types: ["date"],
    });

    expect(dateOnly.every((e) => e.entity_type === "date")).toBe(true);
  });

  it("assigns source_chunk_ids and source_document_id", () => {
    const chunks = [
      {
        id: "chunk-a",
        text: "Microsoft was founded by Bill Gates.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-42", "ws-1");
    const ms = entities.find((e) => e.name === "Microsoft");

    expect(ms).toBeDefined();
    expect(ms!.source_document_id).toBe("doc-42");
    expect(ms!.source_chunk_ids).toContain("chunk-a");
  });

  it("deduplicates entities across chunks", () => {
    const chunks = [
      { id: "chunk-1", text: "Microsoft released Windows 11." },
      { id: "chunk-2", text: "Microsoft is based in Redmond." },
      { id: "chunk-3", text: "Microsoft acquired Activision Blizzard." },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1");
    const microsoftEntities = entities.filter((e) => e.name.toLowerCase() === "microsoft");

    expect(microsoftEntities.length).toBe(1);
    expect(microsoftEntities[0].confidence).toBeGreaterThan(0.5);
    expect(microsoftEntities[0].source_chunk_ids.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts key terms using TF-IDF for concepts", () => {
    const chunks = [
      {
        id: "chunk-1",
        text: "Machine learning models require training data. Neural networks are a type of machine learning model. Deep learning uses neural networks with many layers.",
      },
      {
        id: "chunk-2",
        text: "Training data quality affects machine learning performance. Neural networks benefit from large training datasets.",
      },
    ];

    const entities = extractor.extractFromChunks(chunks, "doc-1", "ws-1");

    const conceptEntities = entities.filter((e) => e.entity_type === "concept");
    expect(conceptEntities.length).toBeGreaterThan(0);
  });
});
