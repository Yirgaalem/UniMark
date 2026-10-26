# UniMark

UniMark is a mobile-first social bookmark manager for saving links from other apps, organizing them into folders, and finding them later.

## Project status
 
**Phase 1: Planning and design** is documented in [`docs/phase-1/`](docs/phase-1/). Work proceeds one roadmap phase at a time, with review between phases.

**Phase 2.1: Share integration feasibility prototype** is documented in [`docs/phase-2.1/`](docs/phase-2.1/). The user verified Android shares from TikTok, Instagram, YouTube, and a Google share link; one saved YouTube link was confirmed after reopening the app. iOS and broader per-source persistence checks remain outstanding.

**Phase 2.2: Accounts and basic bookmark/folder management** is implemented in [`backend/`](backend/) and [`mobile/`](mobile/). It adds email/password and configurable Google sign-in, private server-backed bookmarks, title editing, and folder management. Google OAuth credentials are required to enable Google sign-in. Local setup instructions are in [`backend/README.md`](backend/README.md) and [`mobile/README.md`](mobile/README.md).

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
