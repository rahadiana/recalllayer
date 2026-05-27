import type { ExtractedEntityCandidate, ExtractedRelationCandidate, RelationDetectionConfig } from "./types.js";
import { DEFAULT_RELATION_CONFIG } from "./types.js";
import { createLogger, type Logger } from "@memory-platform/observability";

const PREPOSITION_PATTERNS: Record<string, string> = {
  "works at": "works_at",
  "works for": "works_at",
  "employed by": "works_at",
  "located in": "located_in",
  "based in": "located_in",
  "lives in": "lives_in",
  "part of": "part_of",
  "member of": "member_of",
  "founded by": "founded_by",
  "created by": "created_by",
  "owns": "owns",
  "acquired": "acquired",
  "merged with": "merged_with",
  "reports to": "reports_to",
  "depends on": "depends_on",
  "uses": "uses",
  "built with": "uses",
  "manages": "manages",
  "leads": "leads",
  "knows": "knows",
};

const PREPOSITION_KEYS = Object.keys(PREPOSITION_PATTERNS).sort(
  (a, b) => b.length - a.length,
);

function detectExplicitRelations(
  text: string,
  sourceEntity: ExtractedEntityCandidate,
  allEntities: ExtractedEntityCandidate[],
): ExtractedRelationCandidate[] {
  const relations: ExtractedRelationCandidate[] = [];
  const lowerText = text.toLowerCase();

  const otherEntities = allEntities.filter(
    (e) => e.name.toLowerCase() !== sourceEntity.name.toLowerCase(),
  );

  for (const targetEntity of otherEntities) {
    const lowerTarget = targetEntity.name.toLowerCase();
    const lowerSource = sourceEntity.name.toLowerCase();

    for (const patternKey of PREPOSITION_KEYS) {
      const relationType = PREPOSITION_PATTERNS[patternKey];

      const fullPattern1 = new RegExp(
        `\\b${escapeRegex(lowerSource)}\\s+${escapeRegex(patternKey)}\\s+${escapeRegex(lowerTarget)}\\b`,
        "i",
      );

      const fullPattern2 = new RegExp(
        `\\b${escapeRegex(lowerTarget)}\\s+(?:is|was|are|were)\\s+${escapeRegex(patternKey)}\\s+${escapeRegex(lowerSource)}\\b`,
        "i",
      );

      if (fullPattern1.test(lowerText) || fullPattern2.test(lowerText)) {
        relations.push({
          source_entity_name: sourceEntity.name,
          target_entity_name: targetEntity.name,
          relation_type: relationType,
          properties: { detected_by: "pattern", pattern: patternKey },
          evidence_spans: [text.slice(0, 200)],
          confidence: 0.7,
        });
        break;
      }
    }
  }

  return relations;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface RelationDetector {
  detectRelations(
    entities: ExtractedEntityCandidate[],
    chunks: { id: string; text: string; document_id: string }[],
    config?: Partial<RelationDetectionConfig>,
  ): ExtractedRelationCandidate[];
}

export function createRelationDetector(): RelationDetector {
  const log = createLogger("memory-graph:relation-detector");

  function detectCoOccurrenceRelations(
    entities: ExtractedEntityCandidate[],
    chunks: { id: string; text: string; document_id: string }[],
    config: RelationDetectionConfig,
  ): ExtractedRelationCandidate[] {
    const relations: ExtractedRelationCandidate[] = [];
    const entityNames = entities.map((e) => e.name.toLowerCase());

    const coOccurrence = new Map<string, { count: number; chunks: Set<string> }>();

    for (const chunk of chunks) {
      const lowerText = chunk.text.toLowerCase();
      const presentEntities = entityNames.filter((name) => lowerText.includes(name));

      for (let i = 0; i < presentEntities.length; i++) {
        for (let j = i + 1; j < presentEntities.length; j++) {
          const pairKey = [presentEntities[i], presentEntities[j]].sort().join("||");
          const existing = coOccurrence.get(pairKey);
          if (existing) {
            existing.count++;
            existing.chunks.add(chunk.id);
          } else {
            coOccurrence.set(pairKey, { count: 1, chunks: new Set([chunk.id]) });
          }
        }
      }
    }

    for (const [pairKey, data] of coOccurrence) {
      if (data.count < config.min_co_occurrence) continue;

      const [entity1Name, entity2Name] = pairKey.split("||");
      const e1 = entities.find((e) => e.name.toLowerCase() === entity1Name);
      const e2 = entities.find((e) => e.name.toLowerCase() === entity2Name);
      if (!e1 || !e2) continue;

      const confidence = Math.min(1, (data.count / chunks.length) * 2);

      relations.push({
        source_entity_name: e1.name,
        target_entity_name: e2.name,
        relation_type: "related_to",
        properties: {
          co_occurrence_count: data.count,
          shared_chunk_count: data.chunks.size,
          detected_by: "co_occurrence",
        },
        evidence_spans: [],
        confidence,
      });
    }

    return relations;
  }

  function detectProximityRelations(
    entities: ExtractedEntityCandidate[],
    chunks: { id: string; text: string; document_id: string }[],
    config: RelationDetectionConfig,
  ): ExtractedRelationCandidate[] {
    const relations: ExtractedRelationCandidate[] = [];
    const entityNames = entities.map((e) => e.name.toLowerCase());

    for (const chunk of chunks) {
      const sentences = chunk.text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      const sentenceEntities: Map<number, string[]> = new Map();

      for (let i = 0; i < sentences.length; i++) {
        const lower = sentences[i].toLowerCase();
        const present = entityNames.filter((name) => lower.includes(name));
        if (present.length > 0) {
          sentenceEntities.set(i, present);
        }
      }

      const sentenceIndices = Array.from(sentenceEntities.keys()).sort((a, b) => a - b);

      for (let i = 0; i < sentenceIndices.length; i++) {
        for (let j = i + 1; j < sentenceIndices.length; j++) {
          const dist = sentenceIndices[j] - sentenceIndices[i];
          if (dist > config.max_sentence_distance) continue;

          const entities1 = sentenceEntities.get(sentenceIndices[i])!;
          const entities2 = sentenceEntities.get(sentenceIndices[j])!;

          for (const e1Name of entities1) {
            for (const e2Name of entities2) {
              if (e1Name === e2Name) continue;
              const proximityScore = 1 - (dist - 1) / config.max_sentence_distance;
              const confidence = Math.max(0.2, proximityScore * 0.5);

              if (confidence >= config.min_confidence) {
                relations.push({
                  source_entity_name: e1Name.charAt(0).toUpperCase() + e1Name.slice(1),
                  target_entity_name: e2Name.charAt(0).toUpperCase() + e2Name.slice(1),
                  relation_type: "nearby",
                  properties: {
                    sentence_distance: dist,
                    detected_by: "proximity",
                  },
                  evidence_spans: [
                    sentences[sentenceIndices[i]].trim().slice(0, 200),
                    sentences[sentenceIndices[j]].trim().slice(0, 200),
                  ],
                  confidence,
                });
              }
            }
          }
        }
      }
    }

    return relations;
  }

  return {
    detectRelations(
      entities,
      chunks,
      config?: Partial<RelationDetectionConfig>,
    ): ExtractedRelationCandidate[] {
      const cfg = { ...DEFAULT_RELATION_CONFIG, ...config };
      const allRelations: ExtractedRelationCandidate[] = [];

      for (const chunk of chunks) {
        for (const entity of entities) {
          const explicitRels = detectExplicitRelations(chunk.text, entity, entities);
          allRelations.push(...explicitRels);
        }
      }

      const coOccurRels = detectCoOccurrenceRelations(entities, chunks, cfg);
      allRelations.push(...coOccurRels);

      const proximityRels = detectProximityRelations(entities, chunks, cfg);
      allRelations.push(...proximityRels);

      const deduped = new Map<string, ExtractedRelationCandidate>();
      for (const rel of allRelations) {
        const key = `${rel.source_entity_name.toLowerCase()}||${rel.relation_type}||${rel.target_entity_name.toLowerCase()}`;
        const existing = deduped.get(key);
        if (!existing || rel.confidence > existing.confidence) {
          deduped.set(key, rel);
        }
      }

      const filtered = Array.from(deduped.values()).filter(
        (rel) => rel.confidence >= cfg.min_confidence,
      );

      const relationTypes = cfg.enabled_relation_types;
      const result =
        relationTypes.length > 0
          ? filtered.filter((rel) => relationTypes.includes(rel.relation_type))
          : filtered;

      log.info("Relations detected", {
        entityCount: entities.length,
        chunkCount: chunks.length,
        relationCount: result.length,
        byMethod: {
          explicit: allRelations.filter((r) => r.properties.detected_by === "pattern").length,
          coOccurrence: coOccurRels.length,
          proximity: proximityRels.length,
        },
      });

      return result;
    },
  };
}
