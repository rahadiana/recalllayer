# Auth Package

## Responsibility

Reusable authentication and authorization helpers.

## Owns

- JWT verification helpers.
- API key hashing/verification helpers.
- Permission/role checking primitives.
- Auth middleware factories if framework-neutral.

## Forbidden

- Owning sessions or API key database tables.
- Billing logic.
- Public routes.
- Direct imports from `services/api-gateway`.
