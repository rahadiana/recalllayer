# Service Map

## Layers

```txt
Client Layer:
  apps/*, sdks/*

Gateway Layer:
  services/api-gateway

Core Pipeline:
  services/ingestion-service
  services/extraction-service
  services/indexing-service
  services/retrieval-service

Memory Intelligence:
  services/memory-graph-service
  services/profile-memory-service
  services/evaluation-service

Integration Layer:
  services/connector-service
  connectors/*

Foundation:
  packages/*
```

## Allowed Calls

```txt
apps/* -> services/api-gateway
sdks/* -> services/api-gateway
services/api-gateway -> services/*
services/* -> packages/*
connectors/* -> packages/*
connectors/* -> services/connector-service contract
```

## Forbidden Calls

```txt
apps/* -> services/* except api-gateway
sdks/* -> services/* except api-gateway
services/* -> services/*/src
packages/* -> services/*
services/* -> another service database
```

## Data Ownership

| Service | Owns | Must Not Own |
|---|---|---|
| api-gateway | API keys, rate limits, sessions, tenant routing | Documents, chunks, graph, embeddings |
| ingestion-service | Documents metadata, source records, upload sessions | Parsed text, chunks, embeddings |
| extraction-service | Extraction jobs, normalized extracted text | Upload auth, search, vectors |
| indexing-service | Chunks, embedding records, index records | Search sessions, API keys, profile facts |
| retrieval-service | Search logs, ranking feedback, retrieval sessions | Documents source, graph facts |
| memory-graph-service | Entities, relations, graph snapshots | Raw document storage, vector index |
| profile-memory-service | User profiles, preferences, behavior facts | Graph topology, documents |
| connector-service | Connector accounts, sync states, OAuth metadata | Extraction, indexing, retrieval |
| evaluation-service | Eval datasets, eval runs, scores, feedback | Production memory mutation without workflow |
