-- 001_init.sql
-- Indexing Service: chunks, embeddings, index_records

CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  document_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  char_count INTEGER,
  token_count INTEGER,
  chunking_strategy VARCHAR(32) DEFAULT 'fixed_size',
  parent_chunk_id UUID REFERENCES chunks(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chunks_workspace ON chunks(workspace_id);
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_parent ON chunks(parent_chunk_id);

CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  chunk_id UUID NOT NULL REFERENCES chunks(id),
  model VARCHAR(64),
  dimensions INTEGER,
  vector_id VARCHAR(256), -- reference to Qdrant point ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_embeddings_chunk ON embeddings(chunk_id);
CREATE INDEX idx_embeddings_workspace ON embeddings(workspace_id);

CREATE TABLE index_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  document_id UUID NOT NULL,
  chunk_id UUID NOT NULL REFERENCES chunks(id),
  index_type VARCHAR(16) NOT NULL, -- 'vector', 'keyword', 'hybrid'
  index_status VARCHAR(16) DEFAULT 'pending', -- pending, indexed, failed
  vector_point_id VARCHAR(256),
  keyword_tsvector TSVECTOR,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_index_records_chunk ON index_records(chunk_id);
CREATE INDEX idx_index_records_status ON index_records(index_status);
CREATE INDEX idx_keyword_search ON index_records USING GIN(keyword_tsvector);
