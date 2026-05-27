-- 001_init.sql
-- Memory Graph Service: entities, relations (Postgres metadata)
-- Note: actual graph stored in Neo4j; this is tracking/metadata

CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  graph_id VARCHAR(256), -- Neo4j node ID
  entity_type VARCHAR(64) NOT NULL, -- 'person', 'organization', 'project', 'topic', etc.
  name VARCHAR(512) NOT NULL,
  aliases TEXT[],
  description TEXT,
  confidence DOUBLE PRECISION DEFAULT 1.0,
  source_chunk_ids UUID[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_entities_workspace ON entities(workspace_id);
CREATE INDEX idx_entities_type ON entities(workspace_id, entity_type);
CREATE INDEX idx_entities_name ON entities(workspace_id, name);

CREATE TABLE relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  graph_id VARCHAR(256), -- Neo4j relationship ID
  relation_type VARCHAR(64) NOT NULL, -- 'works_on', 'likes', 'mentions', etc.
  source_entity_id UUID NOT NULL REFERENCES entities(id),
  target_entity_id UUID NOT NULL REFERENCES entities(id),
  confidence DOUBLE PRECISION DEFAULT 1.0,
  weight DOUBLE PRECISION DEFAULT 1.0,
  source_chunk_ids UUID[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_relations_workspace ON relations(workspace_id);
CREATE INDEX idx_relations_source ON relations(source_entity_id);
CREATE INDEX idx_relations_target ON relations(target_entity_id);
CREATE INDEX idx_relations_type ON relations(workspace_id, relation_type);

CREATE TABLE graph_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  entity_count INTEGER,
  relation_count INTEGER,
  snapshot_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_graph_snapshots_workspace ON graph_snapshots(workspace_id);
