# Observability Package

## Responsibility

Shared logging, tracing, metrics, and error instrumentation.

## Owns

- Structured logger factory.
- OpenTelemetry setup.
- Metrics helper.
- Health check helper.
- Request correlation ID utilities.

## Allowed

- Export `initObservability(serviceName)`.
- Standardize log fields.

## Forbidden

- Logging raw document contents or secrets.
- Service-specific business logic.
- Imports from services/apps.
