# Connectors

Connector plugins for external sources. The orchestration and token storage belong to `services/connector-service`.

## Standard Connector Structure

```txt
connectors/[name]/
  src/
    auth.ts
    client.ts
    mapper.ts
    sync.ts
    webhook.ts
  tests/
  README.md
```

## Rules

- Connectors fetch raw source bytes and metadata; they must not parse, normalize, extract text, chunk, embed, or index content.
- Connector output is raw source (bytes + metadata); the `extraction-service` is responsible for parsing/normalizing.
- Connectors must not run embedding, indexing, search, or retrieval.
- Connectors must not store secrets in code.
- Connector output must become connector-service events or ingestion input.
