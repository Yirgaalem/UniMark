# UniMark Phase 1: Requirements and decisions

**Status:** Review draft  
**Scope:** Planning and design only. Phase 2 implementation has not started.

## 1. Product goal

UniMark gives a user one private library for links they share from social apps and websites. The user can save a link quickly, organize it, personalize its title, and find or reopen it later. The original social content remains hosted by its source.

## 2. Target users and primary use case

The initial user is an individual who saves content while browsing on a phone and later wants to retrieve it without remembering which app contained it.

Primary flow:

1. Discover a post, video, article, or other link in another app.
2. Use the operating system's Share action and choose UniMark.
3. Review the received link/text and accept or choose a folder.
4. Save the bookmark and return to the source app.
5. Find it later in the library, a folder, or search, then open the original content.

## 3. MVP requirements

### Must have

- Register and sign in securely; users can only access their own private data.
- Receive shared text/URLs on iOS and Android, subject to platform and source-app behavior.
- Save the original URL even when metadata cannot be retrieved.
- Show a complete saved-bookmark list and a recently saved home view.
- Create, rename, and delete folders; assign a bookmark to one or more folders.
- Keep a custom title separate from fetched/original title and preserve it during metadata refresh.
- Search bookmarks by title and notes, with folder/platform filters introduced in the search phase.
- Open the original URL. In-app viewing can be explored per source in its dedicated phase; external app/browser fallback is required.
- Synchronize account data through the backend. Offline queuing is a later reliability increment.

### Should have

- Best-effort source identification and metadata (title, description, thumbnail, author, content type).
- Quick-save using the last-used folder, with the ability to change it.
- Clear errors and retry behavior for network failures.
- Accessible controls, readable text, and layouts usable with one hand.

### Explicitly out of MVP

- Downloading or permanently storing third-party videos.
- Guaranteed in-app playback for every platform.
- AI-generated summaries, semantic search, reminders, browser extensions, shared collections, social followers/reposts, and smart collections.
- A web client.

## 4. Product behavior and acceptance criteria

### Bookmark save

- A bookmark always retains its original URL and source text as available.
- Missing metadata never prevents a save.
- Custom title and notes are optional.
- If a URL is already in the account library, the later duplicate-detection phase will offer to open the existing record or add it to another folder rather than silently creating clutter.
- The app must not claim it can access a user's full social account merely because a link was shared.

### Folders

- A folder belongs to one user.
- A bookmark can be in multiple folders without duplicate bookmark records.
- Deleting a folder removes its memberships, not the bookmarks themselves.
- A bookmark may remain unfiled.

### Privacy and security

- Every API operation on private resources is scoped to the authenticated user on the server.
- Passwords, if locally managed, are stored only as a modern one-way password hash; raw passwords are never logged or stored.
- Secrets and signing keys are provided through environment/secret configuration, not committed to the repository.
- Minimize collected account data. Do not request social platform credentials.
- If server-side metadata fetching is added, validate URL schemes and destinations, constrain redirects/timeouts/response sizes, and isolate fetches to mitigate SSRF.

## 5. Proposed architecture

```text
React Native / TypeScript app
  ├─ shared UI and domain logic
  ├─ iOS Share Extension / native bridge (validated in Phase 2.1)
  └─ Android share intent (validated in Phase 2.1)
             │ HTTPS JSON REST API
             ▼
Spring Boot modular monolith
  ├─ Spring Security authentication and per-user authorization
  ├─ account, bookmark, folder, and search modules
  └─ metadata fetcher (later phase; isolated and bounded)
             │
             ▼
PostgreSQL
```

Start with one backend service and one relational database. Keep modules separated in code; do not add microservices, a message broker, or a separate search engine until measured needs justify them. Use Docker Compose for reproducible local development and database migrations for schema changes.

## 6. Technology decisions

| Area | Decision | Reason / validation |
|---|---|---|
| Mobile | React Native + TypeScript | Reuse most UI/domain code while retaining native integration for share entry points. |
| Native project shape | Use a React Native setup that permits native iOS and Android project changes; avoid relying on a managed workflow until share-extension compatibility is proven. | Phase 2.1 must test actual source-app payloads and platform behavior. |
| Backend | Java + Spring Boot REST API | Strong portfolio signal for backend, API, persistence, and security skills. |
| Security | Spring Security; use established password hashing and a standards-based token/session design. | Do not invent cryptography or token formats. Decide concrete access/refresh lifecycle before Phase 2.2 auth implementation. |
| Database | PostgreSQL | Relational ownership and bookmark-folder relationships are a natural fit. Begin with PostgreSQL full-text capabilities before considering external search. |
| Deployment | Dockerized app and database for local development; production host chosen before deployment phase. | Keeps setup reproducible without prematurely coupling to a cloud vendor. |
| API docs | OpenAPI contract maintained with the backend. | Makes endpoints inspectable and supports future client generation. |

## 7. Data and sync assumptions

- The backend is authoritative for signed-in account data.
- Phase 2.2 focuses on online CRUD. Phase 6 adds durable offline queueing and retry behavior.
- Each mutable record has `created_at` and `updated_at` timestamps. Initial conflict policy can be last-write-wins, with server updates reflected on refresh; revisit before offline editing ships.
- Folder membership is a join table. Deleting a bookmark cascades to its memberships; deleting a folder cascades only to memberships.
- Store both the original URL and a normalized comparison key. URL normalization rules and uniqueness policy must be validated against real shared links before enabling a unique constraint.

## 8. Risks and early validation

| Risk | Response |
|---|---|
| Sharing payload differs between iOS, Android, and source apps | Phase 2.1 prototype with real devices and representative TikTok, Instagram, YouTube, Reddit, and web links. Record payloads and failures. |
| A platform blocks metadata or embedded playback | Saving the URL remains successful; use official supported metadata/players and provide external fallback. |
| URL metadata fetch can be abused to reach internal services | Treat as a security-sensitive feature; strict destination controls, redirect policy, timeouts, size caps, and network isolation. |
| iOS share extension lifecycle/UX differs from Android intent flow | Validate prototype before building the full save experience; document platform-specific UX where needed. |
| Sync conflicts and offline failures | Keep offline editing out of first CRUD slice; define conflict policy before Phase 6. |

## 9. Roadmap boundaries

- **Phase 1 (this draft):** requirements, mobile screen design, database schema, API plan.
- **Phase 2.1:** share integration feasibility prototype; inspect actual payloads and save a basic bookmark.
- **Phase 2.2:** accounts and basic bookmark/folder management.
- **Phase 3:** production-quality native share workflows and wider source coverage.
- **Phase 4:** metadata, search, filters, duplicate detection.
- **Phase 5:** supported in-app viewing and fallback.
- **Phase 6:** cross-device synchronization hardening, offline queue, reliability/security improvements.
- **Phase 7:** tests, deployment, and distribution.

Phase completion is subject to user review before starting the next phase.
