\# Changelog

\## v0.1.0 – 2025-10-10

\### Added

\- Estructura monorepo con `apps/backend` y `apps/mobile`.

\- Backend: Express + Prisma + PostgreSQL, rutas `/health`, `/config`, `/db`, `/db/add`.

\- Lint, Typecheck y Prettier para ambos proyectos.

\- GitHub Actions: CI monorepo (genera Prisma Client, typecheck, lint, prettier check).

\- Archivos `.env.example` en backend y mobile.

\- Reglas de protección para `main`.

\### Fixed/Changed

\- Ajustes de ESLint/Prettier y hooks de pre-commit.

\- Pipeline con `pnpm` y caching.
