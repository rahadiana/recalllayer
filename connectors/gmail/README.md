# Gmail Connector

## Responsibility

Sync Gmail messages into ingestion pipeline.

## Allowed

- Fetch email metadata/content with approved scopes.
- Support incremental sync state.
- Map email threads to document source schema.

## Forbidden

- Embedding/search.
- Storing OAuth credentials in source code.
- Sending emails unless explicitly scoped in future.
