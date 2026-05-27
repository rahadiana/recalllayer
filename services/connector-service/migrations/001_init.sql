-- 001_init.sql
-- Connector Service: connector_accounts, tokens, sync_jobs, sync_states

CREATE TABLE connector_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  connector_type VARCHAR(32) NOT NULL, -- 'notion', 'google_drive', 'slack', 'gmail', 's3', 'web_crawler'
  account_name VARCHAR(256),
  account_email VARCHAR(256),
  external_account_id VARCHAR(256),
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, connector_type, external_account_id)
);
CREATE INDEX idx_connector_accounts_workspace ON connector_accounts(workspace_id);

CREATE TABLE connector_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  account_id UUID NOT NULL REFERENCES connector_accounts(id),
  token_type VARCHAR(16) NOT NULL, -- 'oauth', 'api_key', 'webhook_secret'
  access_token TEXT,
  refresh_token TEXT,
  token_metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_connector_tokens_account ON connector_tokens(account_id);

CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  account_id UUID NOT NULL REFERENCES connector_accounts(id),
  connector_type VARCHAR(32) NOT NULL,
  sync_type VARCHAR(16) DEFAULT 'full', -- 'full', 'delta', 'webhook'
  status VARCHAR(16) DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  items_discovered INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_deleted INTEGER DEFAULT 0,
  error_message TEXT,
  cursor_token TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sync_jobs_account ON sync_jobs(account_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(workspace_id, status);

CREATE TABLE sync_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  account_id UUID NOT NULL REFERENCES connector_accounts(id),
  external_item_id VARCHAR(256) NOT NULL,
  item_type VARCHAR(32), -- 'page', 'file', 'message', 'email'
  last_synced_hash VARCHAR(128),
  last_synced_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, external_item_id)
);
CREATE INDEX idx_sync_states_account ON sync_states(account_id);
