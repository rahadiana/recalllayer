# Google Drive Connector

## Responsibility

Sync Google Drive files into ingestion pipeline.

## Allowed

- List changed files.
- Fetch file metadata and download links/content through approved scopes.
- Map file records to document source schema.

## Forbidden

- Parsing PDFs/docs in this connector.
- Embedding/indexing/search.
- Hardcoded OAuth credentials.
