# LLM Package

## Responsibility

Provider-neutral AI model wrappers.

## Owns

- Embedding provider interface.
- Chat/completion provider interface.
- Reranker provider interface.
- Token counting utilities.
- Provider retry/rate-limit handling.

## Allowed

- Provider adapters for OpenAI/Voyage/local models.
- Typed model result objects.

## Forbidden

- Retrieval business logic.
- Extraction prompts owned by extraction-service.
- Memory graph prompts owned by memory-graph-service.
- Service imports.
