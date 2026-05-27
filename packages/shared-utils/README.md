# Shared Utils

## Responsibility

Pure reusable helpers shared across services/apps/packages.

## Allowed

- ID generation helpers.
- Pagination helpers.
- Date/time helpers.
- Retry/backoff helpers.
- Text sanitization helpers.
- Safe JSON helpers.

## Forbidden

- Service-specific business logic.
- DB/network calls.
- Importing from services/apps/connectors.
- Secret management.
