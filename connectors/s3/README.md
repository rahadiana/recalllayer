# S3 Connector

## Responsibility

Sync S3-compatible object storage files into ingestion pipeline.

## Allowed

- List buckets/prefixes using configured credentials.
- Detect changed objects.
- Emit source records for ingestion.

## Forbidden

- Parsing file contents.
- Embedding/indexing/search.
- Hardcoded access keys.
