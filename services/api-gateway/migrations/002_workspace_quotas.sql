CREATE TABLE IF NOT EXISTS workspace_quotas (
  workspace_id VARCHAR(64) PRIMARY KEY,
  max_storage_bytes BIGINT DEFAULT 1073741824,
  max_documents INT DEFAULT 1000,
  storage_used_bytes BIGINT DEFAULT 0,
  document_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
