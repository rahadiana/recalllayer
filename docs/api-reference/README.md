# API Reference

Public API hanya diekspos oleh `services/api-gateway`.

## MVP Endpoints

```txt
POST /v1/documents
GET  /v1/documents/:id
POST /v1/search
POST /v1/context
GET  /v1/memories/:id
POST /v1/connectors/:type/sync
GET  /v1/usage
```

## Rules

- Request/response schema harus berasal dari `packages/shared-schemas`.
- Semua endpoint wajib punya auth, rate limit, structured error, dan request ID.
- API Gateway boleh aggregate response, tetapi tidak boleh menjalankan business logic RAG/indexing.

## Standard Error Shape

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "request_id": "string",
    "details": {}
  }
}
```
