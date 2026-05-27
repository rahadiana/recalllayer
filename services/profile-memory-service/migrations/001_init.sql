-- 001_init.sql
-- Profile Memory Service: user_profiles, preferences, behavior_events, profile_facts

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(256),
  avatar_url TEXT,
  locale VARCHAR(8) DEFAULT 'en',
  timezone VARCHAR(64),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
CREATE INDEX idx_user_profiles_workspace ON user_profiles(workspace_id);

CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  preference_key VARCHAR(128) NOT NULL,
  preference_value JSONB NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0.5,
  source VARCHAR(32), -- 'explicit', 'inferred', 'behavior'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, preference_key)
);
CREATE INDEX idx_user_prefs_user ON user_preferences(workspace_id, user_id);

CREATE TABLE behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL, -- 'search', 'document_view', 'click', 'feedback'
  event_data JSONB DEFAULT '{}',
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_behavior_events_user ON behavior_events(workspace_id, user_id);
CREATE INDEX idx_behavior_events_type ON behavior_events(workspace_id, event_type);
CREATE INDEX idx_behavior_events_time ON behavior_events(created_at DESC);

CREATE TABLE profile_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  fact_key VARCHAR(128) NOT NULL,
  fact_value JSONB NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0.5,
  evidence_count INTEGER DEFAULT 1,
  last_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id, fact_key)
);
CREATE INDEX idx_profile_facts_user ON profile_facts(workspace_id, user_id);
