# Python SDK

## Responsibility

Official Python client for the public API.

## Target API

```python
client.documents.add(...)
client.documents.get(...)
client.search.query(...)
client.context.build(...)
client.memories.get(...)
client.connectors.sync(...)
```

## Allowed

- API Gateway HTTP client.
- Typed models.
- Structured exceptions.

## Forbidden

- Calling internal services.
- Embedding/search implementation inside SDK.
- Hardcoded API keys.
