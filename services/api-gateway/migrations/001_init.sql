-- 001_init.sql
-- API Gateway: api_keys, rate_limits, sessions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id VARCHAR(64) NOT NULL,
  key_hash VARCHAR(256) NOT NULL UNIQUE,
  key_prefix VARCHAR(16) NOT NULL,
  name VARCHAR(128),
  scopes TEXT[] DEFAULT '{}',
  rate_limit INTEGER DEFAULT 1000,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE rate_limit_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id VARCHAR(64) NOT NULL,
  endpoint VARCHAR(256) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, endpoint, window_start)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(64) NOT NULL,
  workspace_id VARCHAR(64) NOT NULL,
  token_id VARCHAR(128),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_workspace ON sessions(workspace_id);
