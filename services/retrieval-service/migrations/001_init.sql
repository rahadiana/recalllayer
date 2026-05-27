-- 001_init.sql
-- Retrieval Service: retrieval_logs, search_sessions, ranking_feedback

CREATE TABLE search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  query_text TEXT NOT NULL,
  query_embedding_id VARCHAR(256),
  filters JSONB DEFAULT '{}',
  search_type VARCHAR(16) DEFAULT 'hybrid', -- vector, keyword, hybrid
  top_k INTEGER DEFAULT 10,
  result_count INTEGER DEFAULT 0,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_search_sessions_workspace ON search_sessions(workspace_id);
CREATE INDEX idx_search_sessions_user ON search_sessions(workspace_id, user_id);
CREATE INDEX idx_search_sessions_time ON search_sessions(workspace_id, created_at DESC);

CREATE TABLE retrieval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  session_id UUID REFERENCES search_sessions(id),
  chunk_id UUID NOT NULL,
  vector_score DOUBLE PRECISION,
  keyword_score DOUBLE PRECISION,
  fusion_score DOUBLE PRECISION,
  reranker_score DOUBLE PRECISION,
  final_rank INTEGER,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_retrieval_logs_session ON retrieval_logs(session_id);
CREATE INDEX idx_retrieval_logs_chunk ON retrieval_logs(chunk_id);

CREATE TABLE ranking_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  session_id UUID REFERENCES search_sessions(id),
  chunk_id UUID NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  is_relevant BOOLEAN,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ranking_feedback_session ON ranking_feedback(session_id);
