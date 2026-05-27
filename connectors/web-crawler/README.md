# Web Crawler Connector

## Responsibility

Discover and fetch web pages for ingestion.

## Allowed

- Crawl allowed URLs.
- Respect robots/rate limits if implemented.
- Map fetched pages to document source schema.

## Forbidden

- HTML extraction beyond lightweight metadata.
- Embedding/indexing/search.
- Secret or credential storage.
