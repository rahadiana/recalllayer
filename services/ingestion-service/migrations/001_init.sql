-- 001_init.sql — Ingestion Service

CREATE TABLE documents (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL,
  title VARCHAR(1024),
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  source_type VARCHAR(32) NOT NULL,
  source_connector VARCHAR(64),
  source_location TEXT,
  source_filename VARCHAR(512),
  source_mime_type VARCHAR(64),
  source_size_bytes BIGINT,
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_documents_workspace ON documents(workspace_id);
CREATE INDEX idx_documents_status ON documents(workspace_id, status);
CREATE INDEX idx_documents_created ON documents(workspace_id, created_at DESC);

CREATE TABLE document_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  document_id VARCHAR(64) NOT NULL REFERENCES documents(id),
  source_type VARCHAR(32) NOT NULL,
  source_url TEXT,
  raw_content TEXT,
  storage_bucket VARCHAR(128),
  storage_key VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  document_id VARCHAR(64),
  filename VARCHAR(512),
  total_size BIGINT,
  uploaded_size BIGINT DEFAULT 0,
  status VARCHAR(32) DEFAULT 'pending',
  storage_key VARCHAR(512),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
