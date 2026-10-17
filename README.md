# UniMark

UniMark is a mobile-first social bookmark manager for saving links from other apps, organizing them into folders, and finding them later.

## Project status

**Phase 1: Planning and design** is documented in [`docs/phase-1/`](docs/phase-1/). No application implementation has started. Work will proceed one roadmap phase at a time, with review between phases.

## Phase 1 deliverables

- [Product requirements and decisions](docs/phase-1/requirements-and-decisions.md)
- [Mobile screen and flow design](docs/phase-1/mobile-screen-design.md)
- [Database schema draft](docs/phase-1/database/schema.sql)
- [API plan](docs/phase-1/api-plan.md)

## Proposed stack

- Mobile: React Native and TypeScript, with native iOS and Android integration where required
- Backend: Java, Spring Boot, Spring Security, REST API
- Database: PostgreSQL
- Local development: Docker Compose; database migrations in the backend project

The detailed rationale and decisions still requiring validation are in the Phase 1 documents.
