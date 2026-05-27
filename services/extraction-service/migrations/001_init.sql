-- 001_init.sql
-- Extraction Service: extraction_jobs, extracted_documents

CREATE TABLE extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  document_id UUID NOT NULL,
  source_id UUID,
  source_type VARCHAR(32) NOT NULL,
  extractor VARCHAR(32) NOT NULL, -- 'text', 'html', 'markdown', 'pdf'
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  input_size BIGINT,
  output_size BIGINT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_extraction_jobs_status ON extraction_jobs(workspace_id, status);
CREATE INDEX idx_extraction_jobs_doc ON extraction_jobs(document_id);

CREATE TABLE extracted_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(64) NOT NULL,
  document_id UUID NOT NULL,
  job_id UUID REFERENCES extraction_jobs(id),
  content TEXT NOT NULL,
  content_hash VARCHAR(128),
  char_count INTEGER,
  word_count INTEGER,
  language VARCHAR(8),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_extracted_docs_workspace ON extracted_documents(workspace_id);
CREATE INDEX idx_extracted_docs_document ON extracted_documents(document_id);
CREATE INDEX idx_extracted_docs_job ON extracted_documents(job_id);
