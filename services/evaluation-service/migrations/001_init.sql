-- 001_init.sql
-- Evaluation Service: eval_datasets, eval_runs, retrieval_scores, human_feedback

CREATE TABLE eval_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  name VARCHAR(256) NOT NULL,
  description TEXT,
  dataset_type VARCHAR(32) DEFAULT 'retrieval', -- 'retrieval', 'ranking', 'relevance'
  item_count INTEGER DEFAULT 0,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_eval_datasets_workspace ON eval_datasets(workspace_id);

CREATE TABLE eval_dataset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES eval_datasets(id),
  query_text TEXT NOT NULL,
  relevant_chunk_ids UUID[],
  relevant_document_ids UUID[],
  min_relevance_score DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_eval_items_dataset ON eval_dataset_items(dataset_id);

CREATE TABLE eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  dataset_id UUID NOT NULL REFERENCES eval_datasets(id),
  run_name VARCHAR(256),
  status VARCHAR(16) DEFAULT 'pending', -- pending, running, completed, failed
  metrics JSONB DEFAULT '{}', -- MRR, P@K, R@K, NDCG, MAP
  total_queries INTEGER,
  completed_queries INTEGER DEFAULT 0,
  avg_latency_ms DOUBLE PRECISION,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_eval_runs_workspace ON eval_runs(workspace_id);
CREATE INDEX idx_eval_runs_dataset ON eval_runs(dataset_id);

CREATE TABLE retrieval_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  eval_run_id UUID NOT NULL REFERENCES eval_runs(id),
  query_text TEXT NOT NULL,
  retrieved_chunk_ids UUID[],
  relevant_chunk_ids UUID[],
  precision_at_1 DOUBLE PRECISION,
  precision_at_5 DOUBLE PRECISION,
  precision_at_10 DOUBLE PRECISION,
  recall_at_10 DOUBLE PRECISION,
  mrr DOUBLE PRECISION,
  ndcg DOUBLE PRECISION,
  latency_ms INTEGER,
  hallucination_risk DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_retrieval_scores_run ON retrieval_scores(eval_run_id);

CREATE TABLE human_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  query_text TEXT NOT NULL,
  chunk_id UUID NOT NULL,
  is_relevant BOOLEAN,
  relevance_rating INTEGER CHECK (relevance_rating >= 1 AND relevance_rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_human_feedback_workspace ON human_feedback(workspace_id);
