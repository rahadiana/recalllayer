# Notion Connector

## Responsibility

Sync Notion pages/databases into ingestion pipeline.

## Allowed

- OAuth/token refresh via connector-service contract.
- Delta sync pages/databases.
- Map Notion blocks to source records.

## Forbidden

- Embedding, vector indexing, retrieval.
- Storing tokens outside connector-service owned storage.
