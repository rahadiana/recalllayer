# Apps

Deployable frontend applications.

## Rule

- Apps hanya boleh memanggil public API dari `services/api-gateway`.
- Apps tidak boleh akses database, queue, vector DB, graph DB, atau service internal langsung.
- Shared UI component wajib diambil dari `packages/ui`.
- Request/response type wajib dari `packages/shared-schemas` atau SDK publik.
