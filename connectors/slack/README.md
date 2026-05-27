# Slack Connector

## Responsibility

Sync Slack messages/channels/files into ingestion pipeline.

## Allowed

- Consume Slack API/webhook events.
- Map channel/message metadata to document source schema.
- Support incremental sync state via connector-service.

## Forbidden

- Profile inference.
- RAG retrieval.
- Token storage inside connector package.
