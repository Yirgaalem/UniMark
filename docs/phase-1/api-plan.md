# UniMark Phase 1: REST API plan

**Base path:** `/api/v1`  
**Format:** JSON over HTTPS  
**Status:** Contract outline; no endpoints are implemented yet.
 
## API conventions

- Use UUID resource IDs and ISO-8601 UTC timestamps.
- Authenticate private routes with a bearer access token (exact issuance, refresh, rotation, and revocation design is a Phase 2.2 decision).
- Derive the owner from the authenticated principal. Never accept a client-provided `userId` to scope private data.
- Return consistent validation and error bodies. Suggested shape:

```json
{
  "type": "validation_error",
  "title": "Request validation failed",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "fieldErrors": [{ "field": "originalUrl", "message": "Must be a valid http or https URL." }]
}
```

- Paginate bookmark lists with `limit` and opaque `cursor`; cap page size. Default order is newest first.
- Use `404` for inaccessible/non-owned resources to avoid disclosing another user's records.
- API documentation will be maintained as OpenAPI in the backend when implementation begins.

## Phase 2.2: account and basic management endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account. Normalize email and validate password policy. |
| POST | `/auth/login` | Authenticate and issue the agreed session/token response. |
| POST | `/auth/refresh` | Refresh credentials if the selected token design uses refresh tokens. |
| POST | `/auth/logout` | Revoke the current refresh/session credential where supported. |
| GET | `/me` | Return the authenticated account profile. |
| GET | `/bookmarks` | List the user's bookmarks; optional `folderId`, `platform`, cursor and limit. |
| POST | `/bookmarks` | Save URL plus optional custom title, note, and folder IDs. Metadata is not required. |
| GET | `/bookmarks/{bookmarkId}` | Get one owned bookmark and its folder memberships. |
| PATCH | `/bookmarks/{bookmarkId}` | Update custom title and/or notes. |
| PUT | `/bookmarks/{bookmarkId}/folders` | Replace folder memberships for the owned bookmark. |
| DELETE | `/bookmarks/{bookmarkId}` | Delete an owned bookmark. |
| GET | `/folders` | List the user's folders with bookmark counts. |
| POST | `/folders` | Create a folder. |
| PATCH | `/folders/{folderId}` | Rename a folder. |
| DELETE | `/folders/{folderId}` | Delete the folder and memberships; bookmarks remain. |

### Core request/response examples

Create bookmark request:

```json
{
  "originalUrl": "https://example.com/story/123",
  "customTitle": "Read this later",
  "userNotes": null,
  "folderIds": []
}
```

Bookmark response (metadata fields may be null):

```json
{
  "id": "4a9d1f5e-a476-4c68-a2cc-8b66ea1167c0",
  "originalUrl": "https://example.com/story/123",
  "sourcePlatform": "web",
  "originalTitle": null,
  "customTitle": "Read this later",
  "description": null,
  "thumbnailUrl": null,
  "contentType": "unknown",
  "userNotes": null,
  "savedAt": "2026-10-17T16:00:00Z",
  "folderIds": []
}
```

## Later-phase endpoint groups (not Phase 2.2 implementation scope)

| Phase | Proposed routes/capabilities |
|---|---|
| 2.1 prototype | Native share payload enters the app and is saved as a basic bookmark; decide whether prototype calls the eventual API or uses a throwaway local stub. |
| 3 | No separate public route is necessarily required; native share entry points call the same authenticated bookmark creation endpoint. Add idempotency support if retry behavior requires it. |
| 4 | `GET /bookmarks/search?q=...` or query parameters on list; platform/folder/date/content filters; metadata refresh; duplicate lookup and add-to-folder behavior. |
| 5 | Viewing stays client-side via supported embed/player configuration and external-open behavior unless a platform requires a backend integration. |
| 6 | Sync cursors/change feed, tombstones or deletion propagation, and offline retry/idempotency semantics. |
| Future social features | Shared collection and follower/repost APIs only after permissions, visibility, reporting, blocking, and privacy rules are designed. |

## Security and validation notes

- Accept only `http`/`https` bookmark URLs. Reject credentials in URLs and malformed/unsupported schemes.
- Do not fetch arbitrary URLs during the basic create-bookmark request. Metadata retrieval is a later isolated capability with destination restrictions, redirect controls, timeouts, and response limits.
- Validate every `folderId` and bookmark ID against the authenticated user in the same operation/transaction.
- Avoid returning password hashes, internal token data, or unfiltered upstream metadata.
- Rate-limit account and authentication routes; avoid revealing whether an email is registered in recovery responses.

## Open decisions before Phase 2.2

1. Self-managed email/password with Spring Security, or a hosted identity provider. Recommendation for this portfolio project: implement the application integration and authorization in Spring Security, use a maintained password-hashing implementation, and use a well-understood token/session pattern rather than custom cryptography.
2. Exact access/refresh lifetime, rotation, revocation, and secure mobile storage.
3. Account recovery and email verification approach.
4. Whether email is the account identifier or whether additional login providers are needed.
5. Folder rename case-sensitivity and duplicate-name behavior.
