# AJIN ON

- This is AJIN-ON-NEW, a new project in `/Users/han-yejun/Desktop/AJIN-ON`. Preserve the supplied AJIN ON design and its eight pages. Do not reuse the previous AJIN_AI project or secrets.
- Frontend: React19, TypeScript7, Vite8; backend: Spring Boot4.1, Java25, PostgreSQL18.
- `frontend/src/pages/*.jsx` contains normal React components converted from the supplied HTML. `scripts/convert-reference.mjs` regenerates them. Update the converter when changing generated behavior; keep source layout, business formulas, labels, filters and data intact.
- `frontend/src/runtime` connects page components to state storage. `frontend/src/services` owns API, autosave and real XLSX export. Preserve conflict handling and visible failures; don't fabricate scores, findings or file content missing from the design.
- Backend persists JSONB page state, revisions, source reference data and file metadata. Use new Flyway migrations; never change an applied migration. File originals stay outside frontend/public.
- No login UI was supplied. The '본사 관리자' switch is the reference's editing mode, not authentication. Local defaults bind to loopback.
- Run `npm test`, `npm run check`, `npm run build`; backend `./gradlew test bootJar` under Java25. Backend integration tests use separate PostgreSQL Testcontainers, not the development database.
- No `.env`, credentials, runtime storage, uploaded files, temporary reference extraction or build output in Git. `python3 scripts/dev.py start|stop|status` manages this project's services only.
