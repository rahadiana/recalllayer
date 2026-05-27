# Dependency Checklist

Sebelum merge hasil kerja agent, cek:

- [ ] Folder hanya mengubah scope yang ditugaskan.
- [ ] Tidak ada import dari `services/*/src` service lain.
- [ ] Tidak ada akses database service lain.
- [ ] Semua DTO/event memakai `packages/shared-schemas`.
- [ ] Helper umum diekstrak ke `packages/shared-utils`.
- [ ] Logging memakai `packages/observability`.
- [ ] Queue/event memakai `packages/queue`.
- [ ] Model/embedding/LLM memakai `packages/llm`.
- [ ] Tidak ada secret di source, tests, README, atau config.
- [ ] README folder menjelaskan responsibility, API/event, dan forbidden actions.
