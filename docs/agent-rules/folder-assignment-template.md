# Folder Assignment Template

Gunakan template ini saat menugaskan folder ke AI agent lain.

```txt
Anda bertugas mengerjakan folder: [FOLDER]

Scope:
- Kerjakan hanya folder ini.
- Baca root AGENTS.md dan README folder ini sebelum coding.
- Ikuti kontrak dari packages/shared-schemas.
- Jangan mengubah folder lain kecuali diminta eksplisit.
- Jika butuh type/event/API baru, usulkan perubahan ke packages/shared-schemas.
- Semua komunikasi antar-service harus lewat API Gateway atau queue event.
- Jangan akses database milik service lain.

Deliverables:
- Source code sesuai scope.
- Tests relevan.
- README folder lengkap.
- API/event contract jika folder mengekspos contract.
- Example usage.
- Logging dan error handling.

Forbidden:
- Hardcoded secret.
- Circular dependency.
- Import dari services/*/src milik service lain.
- Direct DB access ke database service lain.

Definition of Done:
- Build sukses.
- Test sukses.
- Typecheck sukses jika TypeScript.
- Dokumentasi folder lengkap.
```
