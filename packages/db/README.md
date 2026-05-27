# DB Package

## Responsibility

Database client factories and connection utilities.

## Owns

- Postgres client factory.
- Redis client factory.
- Vector DB client factory.
- Graph DB client factory.
- Object storage client factory if needed.

## Allowed

- Connection pooling.
- Health checks.
- Typed low-level client wrappers.

## Forbidden

- Global application models.
- Service migrations.
- Cross-service repository methods.
- Reading another service's database on behalf of a caller.

## Rule

Migrations and schema definitions live in the service that owns the data.
