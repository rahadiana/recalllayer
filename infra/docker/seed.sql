-- seed.sql
-- Seed data for local development across all services

-- API Gateway: test API keys
INSERT INTO api_keys (workspace_id, key_hash, key_prefix, name, scopes)
VALUES
  ('workspace123abc', '$2b$10$placeholder_hash_dev_key_1', 'ak_ws123', 'Development Key', '{read,write}'),
  ('workspace123abc', '$2b$10$placeholder_hash_dev_key_2', 'sk_ws123', 'Admin Key', '{read,write,admin}');

-- Ingestion: sample documents
INSERT INTO documents (workspace_id, source_type, title, status, metadata)
VALUES
  ('workspace123abc', 'text', 'Getting Started Guide', 'validated', '{"tags":["onboarding"]}'),
  ('workspace123abc', 'url', 'API Reference', 'validated', '{"url":"https://docs.example.com"}'),
  ('workspace123abc', 'file', 'Meeting Notes Q1', 'received', '{"filename":"q1-notes.pdf"}');

-- Profile: sample user profiles
INSERT INTO user_profiles (workspace_id, user_id, display_name)
VALUES
  ('workspace123abc', 'user-1', 'Alice Developer'),
  ('workspace123abc', 'user-2', 'Bob Manager');

INSERT INTO user_preferences (workspace_id, user_id, preference_key, preference_value, source)
VALUES
  ('workspace123abc', 'user-1', 'language', '"id"', 'explicit'),
  ('workspace123abc', 'user-1', 'response_style', '"concise"', 'inferred');

-- Evaluation: sample dataset
INSERT INTO eval_datasets (workspace_id, name, description, dataset_type)
VALUES
  ('workspace123abc', 'Default Retrieval Test', 'Basic retrieval quality dataset', 'retrieval');

INSERT INTO eval_dataset_items (dataset_id, query_text, relevant_chunk_ids)
SELECT id, 'What is the onboarding process?', ARRAY[]::UUID[]
FROM eval_datasets WHERE name = 'Default Retrieval Test';
