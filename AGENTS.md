# AI Agent Operating Rules

File ini wajib dibaca oleh setiap AI agent yang mengerjakan folder di repo ini.

## Scope Rule

- Kerjakan hanya folder yang ditugaskan.
- Jangan mengubah folder lain kecuali tugas secara eksplisit membutuhkan kontrak lintas-folder.
- Jika butuh type/event/API baru, usulkan perubahan di `packages/shared-schemas` terlebih dahulu.
- Jika butuh shared helper, letakkan di `packages/shared-utils`, bukan copy-paste antar-service.

## Dependency Rule

Allowed dependency flow:

```txt
apps/* -> services/api-gateway -> services/*
services/* -> packages/*
connectors/* -> services/connector-service contract + packages/*
sdks/* -> services/api-gateway public API only
```

Forbidden:

```txt
apps/* -> services/* except api-gateway
sdks/* -> services/* except api-gateway
services/* -> services/*/src
services/* -> database owned by another service
packages/* -> services/*
connectors/* -> extraction or indexing logic
```

## Data Ownership Rule

Setiap service memiliki schema/migration/data store-nya sendiri. Cross-service access hanya lewat:

- API Gateway untuk request synchronous.
- Queue event untuk workflow asynchronous.

## Definition of Done

Sebuah folder dianggap selesai hanya jika memiliki:

- Source code sesuai scope.
- README folder dengan responsibility, public API/event, dan forbidden actions.
- Unit/integration tests relevan.
- Logging dan error handling.
- Tidak ada hardcoded secret.
- Tidak ada circular dependency.
- Build/typecheck/test sukses.

## Implementation Prompt Template

```txt
Anda bertugas mengerjakan folder: [FOLDER]

Scope:
- Kerjakan hanya folder ini.
- Ikuti kontrak dari packages/shared-schemas.
- Jangan mengubah folder lain kecuali diminta.
- Semua komunikasi antar-service harus lewat API Gateway atau queue event.
- Jangan akses database milik service lain.

Deliverables:
- Source code
- Tests
- README folder
- API/event contract
- Example usage
- Error handling
- Logging/observability

Definition of Done:
- Build sukses
- Test sukses
- Tidak ada circular dependency
- Tidak ada hardcoded secret
- Dokumentasi folder lengkap
```
