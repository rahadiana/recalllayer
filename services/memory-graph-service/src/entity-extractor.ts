import type { ExtractedEntityCandidate, EntityExtractionConfig } from "./types.js";
import { DEFAULT_EXTRACTION_CONFIG } from "./types.js";
import { generateId } from "@memory-platform/shared-utils";
import { createLogger, type Logger } from "@memory-platform/observability";

const PERSON_PATTERNS = [
  /\b(?:Mr|Ms|Mrs|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
];

const ORG_PATTERNS = [
  /\b(?:Inc\.?|Corp\.?|LLC|Ltd\.?|Co\.?|Company|Corporation|Limited)\b/g,
  /\b[A-Z][a-z]*(?:\s+[A-Z][a-z]*)*\s+(?:Inc\.?|Corp\.?|LLC|Ltd\.?)\b/g,
];

const LOCATION_PATTERNS = [
  /\b(?:in|at|from|to|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
  /\b(?:city|town|village|country|region|state|province)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi,
];

const DATE_PATTERNS = [
  /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/g,
  /\b(?:\d{4}-\d{2}-\d{2})\b/g,
  /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
];

const COMMON_TECH_TERMS = new Set([
  "API", "REST", "GraphQL", "JSON", "SQL", "NoSQL", "HTTP", "HTTPS",
  "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "React",
  "Vue", "Angular", "Node.js", "Docker", "Kubernetes", "AWS", "GCP",
  "Azure", "Redis", "PostgreSQL", "MongoDB", "Neo4j", "Elasticsearch",
  "Kafka", "RabbitMQ", "gRPC", "WebSocket", "OAuth", "JWT", "TLS",
  "Machine Learning", "AI", "NLP", "LLM", "RAG", "Vector Database",
]);

const STOP_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her",
  "she", "or", "an", "will", "my", "one", "all", "would", "there",
  "their", "what", "so", "up", "out", "if", "about", "who", "get",
  "which", "go", "me", "when", "make", "can", "like", "time", "no",
  "just", "him", "know", "take", "people", "into", "year", "your",
  "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these",
  "give", "day", "most", "us", "is", "was", "are", "been", "has",
  "had", "were", "being", "does", "did", "doing", "should", "may",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function extractTFIDFKeyTerms(
  chunks: { id: string; text: string }[],
  maxTerms: number,
): { term: string; score: number }[] {
  const allText = chunks.map((c) => c.text).join(" ");
  const tokens = tokenize(allText);

  const termFreq = new Map<string, number>();
  for (const token of tokens) {
    termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
  }

  const totalChunks = chunks.length;
  const docFreq = new Map<string, number>();
  for (const token of termFreq.keys()) {
    let count = 0;
    for (const chunk of chunks) {
      if (chunk.text.toLowerCase().includes(token)) {
        count++;
      }
    }
    docFreq.set(token, count);
  }

  const scored = Array.from(termFreq.entries())
    .map(([term, tf]) => {
      const df = docFreq.get(term) ?? 1;
      const tfidf = tf * Math.log(totalChunks / df);
      return { term, score: tfidf };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxTerms);
}

export interface EntityExtractor {
  extractFromChunks(
    chunks: { id: string; text: string }[],
    documentId: string,
    workspaceId: string,
    config?: Partial<EntityExtractionConfig>,
  ): ExtractedEntityCandidate[];
}

export function createEntityExtractor(): EntityExtractor {
  const log = createLogger("memory-graph:entity-extractor");

  function detectEntityType(name: string, context: string): string {
    const lowerName = name.toLowerCase();
    const lowerContext = context.toLowerCase();

    if (PERSON_PATTERNS.some((p) => {
      p.lastIndex = 0;
      return p.test(context) && context.includes(name);
    })) {
      return "person";
    }

    if (name.match(/^\d{4}-\d{2}-\d{2}$/) || name.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
      return "date";
    }

    if (ORG_PATTERNS.some((p) => {
      p.lastIndex = 0;
      return p.test(context) && context.includes(name);
    })) {
      return "organisation";
    }

    if (lowerContext.includes("city of") || lowerContext.includes("located in")) {
      return "location";
    }

    if (COMMON_TECH_TERMS.has(name) || lowerName.includes("api") || lowerName.includes("database")) {
      return "concept";
    }

    const capitalizedPattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/;
    if (capitalizedPattern.test(name) && name.split(/\s+/).length >= 2) {
      return "person";
    }

    return "concept";
  }

  return {
    extractFromChunks(
      chunks: { id: string; text: string }[],
      documentId: string,
      workspaceId: string,
      config?: Partial<EntityExtractionConfig>,
    ): ExtractedEntityCandidate[] {
      const cfg = { ...DEFAULT_EXTRACTION_CONFIG, ...config };
      const entitiesMap = new Map<string, ExtractedEntityCandidate>();

      for (const chunk of chunks) {
        const text = chunk.text;

        const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
        let match: RegExpExecArray | null;
        while ((match = namePattern.exec(text)) !== null) {
          const name = match[1];
          if (name.length < 3) continue;

          const key = name.toLowerCase();
          const existing = entitiesMap.get(key);

          if (existing) {
            existing.source_chunk_ids.push(chunk.id);
            existing.evidence_spans.push(match[0]);
            existing.confidence = Math.min(1, existing.confidence + 0.1);
          } else {
            const entityType = detectEntityType(name, text);
            entitiesMap.set(key, {
              name,
              entity_type: entityType,
              aliases: [],
              properties: { extracted_from: chunk.id },
              source_chunk_ids: [chunk.id],
              source_document_id: documentId,
              evidence_spans: [match[0]],
              confidence: 0.5,
            });
          }
        }

        for (const pattern of LOCATION_PATTERNS) {
          pattern.lastIndex = 0;
          let locMatch: RegExpExecArray | null;
          while ((locMatch = pattern.exec(text)) !== null) {
            const locName = locMatch[1];
            if (!locName || locName.length < 3) continue;
            const key = locName.toLowerCase();
            if (!entitiesMap.has(key)) {
              entitiesMap.set(key, {
                name: locName,
                entity_type: "location",
                aliases: [],
                properties: {},
                source_chunk_ids: [chunk.id],
                source_document_id: documentId,
                evidence_spans: [locMatch[0]],
                confidence: 0.4,
              });
            }
          }
        }

        for (const pattern of DATE_PATTERNS) {
          pattern.lastIndex = 0;
          let dateMatch: RegExpExecArray | null;
          while ((dateMatch = pattern.exec(text)) !== null) {
            const dateStr = dateMatch[0];
            const key = dateStr;
            if (!entitiesMap.has(key)) {
              entitiesMap.set(key, {
                name: dateStr,
                entity_type: "date",
                aliases: [],
                properties: { iso_date: dateStr },
                source_chunk_ids: [chunk.id],
                source_document_id: documentId,
                evidence_spans: [dateStr],
                confidence: 0.7,
              });
            }
          }
        }
      }

      const keyTerms = extractTFIDFKeyTerms(chunks, cfg.max_entities_per_document);
      for (const { term, score } of keyTerms) {
        const key = term;
        if (entitiesMap.has(key)) {
          const existing = entitiesMap.get(key)!;
          existing.confidence = Math.min(1, existing.confidence + score * 0.1);
        } else if (score > 1.5) {
          entitiesMap.set(key, {
            name: term.charAt(0).toUpperCase() + term.slice(1),
            entity_type: "concept",
            aliases: [],
            properties: { tfidf_score: score },
            source_chunk_ids: chunks.map((c) => c.id),
            source_document_id: documentId,
            evidence_spans: [],
            confidence: Math.min(1, score / 10),
          });
        }
      }

      let entities = Array.from(entitiesMap.values())
        .filter((e) => e.confidence >= cfg.min_confidence);

      const enabledTypes = cfg.enabled_entity_types;
      if (enabledTypes.length > 0) {
        entities = entities.filter((e) => enabledTypes.includes(e.entity_type));
      }

      entities = entities
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, cfg.max_entities_per_document);

      log.info("Entities extracted from document", {
        documentId,
        chunkCount: chunks.length,
        entityCount: entities.length,
      });

      return entities;
    },
  };
}
