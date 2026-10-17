# UniMark

UniMark is a mobile-first social bookmark manager for saving links from other apps, organizing them into folders, and finding them later.

## Project status
 
**Phase 1: Planning and design** is documented in [`docs/phase-1/`](docs/phase-1/). Work proceeds one roadmap phase at a time, with review between phases.

**Phase 2.1: Share integration feasibility prototype** is in [`mobile/`](mobile/) and its validation notes are in [`docs/phase-2.1/`](docs/phase-2.1/). The Android debug build succeeds, and a direct Android share-intent smoke check confirmed URL receipt, local saving, and persistence after restart. Testing through real source-app share sheets and testing iOS remain outstanding.

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
