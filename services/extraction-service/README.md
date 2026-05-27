# Extraction Service

Transforms raw document source content into normalized text for indexing.

## Quick Start

```bash
pnpm build
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memory_platform REDIS_URL=redis://localhost:6379 node dist/start.js
```

## Migration

```bash
docker exec -i memory-postgres psql -U postgres -d memory_platform < services/extraction-service/migrations/001_init.sql
```

## Pipeline

```
document.received → ExtractionWorker → Text/HTML/Markdown extractor → document.extracted
```

## Extractors

| Extractor | MIME Types | Description |
|---|---|---|
| Text | text/plain | Normalize unicode, trim |
| HTML | text/html | Strip tags, decode entities |
| Markdown | text/markdown | Strip syntax, preserve code |
| PDF | application/pdf | Text placeholder (MVP) |

## Database

- `extraction_jobs` — Job tracking, status, retry
- `extracted_documents` — Extracted text with metadata

## Responsibility

Transforms raw source content into normalized text.

## Owns Data

- `extraction_jobs`
- `extracted_documents`
- parser-specific metadata.

## Consumes

- `document.received`

## Emits

- `document.extracted`
- `extraction.failed`

## Allowed

- Parse PDF, HTML, Markdown, images via OCR, and audio via transcription.
- Normalize text and preserve source references.
- Store extraction job results.

## Forbidden

- Final chunking strategy.
- Embedding/vector indexing.
- Public API for user search.
