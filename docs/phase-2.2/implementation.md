# Phase 2.2: Accounts and basic bookmark/folder management

**Status:** Email-code implementation is in place and unit tests pass. SMTP configuration and a fresh inbox/API check are required before the new sign-in flow is usable.  
**Review boundary:** This phase does not include metadata fetching, search, duplicate detection, offline queues, or production deployment.

## Delivered

- Email/password registration and sign-in through Spring Security.
- One-time email codes for account creation and each sign-in, replacing authenticator setup. SMTP delivery must be configured on the server before these flows can complete.
- Google sign-in through native Google Identity UI. The API verifies Google ID-token signature, issuer, audience, expiry, and verified email before sending a UniMark email code. Existing accounts with the same verified email are linked; new Google accounts do not need a password.
- BCrypt password hashes; passwords are never returned from the API.
- Per-IP throttling for registration/login (10 requests per minute per route) and refresh (30 per minute) on the single API instance.
- Fifteen-minute HS256 access tokens and thirty-day opaque refresh tokens. Refresh tokens rotate and only SHA-256 hashes are stored in PostgreSQL. The mobile client stores its current session using Android Keystore/iOS Keychain through `react-native-keychain`.
- Account-scoped bookmark create/list/read/update/delete routes. The API derives ownership from the verified JWT; it does not trust a client `userId`.
- HTTP(S)-only URL validation, best-effort source platform, separate optional custom title and notes, paginated list cursors, optional folder/platform filters.
- Folder create/list/rename/delete routes. Folder names are case-insensitively unique per account. A bookmark can be in multiple folders. Deleting a folder removes memberships while leaving bookmarks intact.
- Android client account screen, server-backed bookmark list, title editing, folder filtering/CRUD, multi-folder assignment, delete confirmation, sign-out, and external URL opening.
- Explicit import prompt for earlier device-only Phase 2.1 bookmarks. The local copy is removed only as each item is successfully uploaded, so a failed import can resume without re-uploading completed items.
- PostgreSQL Flyway migration, Docker Compose stack, health endpoint, and OpenAPI contract.

## Run locally

Follow `backend/README.md` and `mobile/README.md`. The emulator reaches the host API at `http://10.0.2.2:8080`; the host health endpoint is `http://localhost:8080/actuator/health`. Keep the API/database and Metro processes running while using the app.

## Security and environment notes

- Local Compose defaults are development-only. Supply a random `UNIMARK_JWT_SECRET` of at least 32 bytes and a unique PostgreSQL password in a root `.env` before deployment. The API refuses to start if no JWT secret is configured.
- This phase uses HTTP only for the local emulator/host bridge. It must use HTTPS before being exposed to the internet.
- Password reset is not included in this phase. Registration email addresses are confirmed by the one-time code. Refresh-token revocation is implemented; already-issued access tokens expire within fifteen minutes.
- Shared/distributed rate-limit storage, account recovery, operational metrics, and cloud deployment remain hardening/deployment work, not locally validated Phase 2.2 behavior.

## Verification record

- Backend unit tests cover bookmark rules, saving/editing/deleting, folder operations, native login, and email-code issuance and verification.
- Mobile `npm test -- --runInBand`: 13 tests passed, covering source labels, YouTube Shorts, content filters, duration display, and the sign-in screen render.
- Mobile TypeScript `tsc --noEmit`: passed.
- The updated Docker API image built successfully. A separate temporary API container applied migration V7 and passed health checks. With SMTP unset, registration returned 503 and rolled back the new account; the temporary container was stopped without replacing the running API.
- The earlier local API/PostgreSQL check passed on October 26, 2026 with authenticator codes. The replacement email flow needs a fresh API/PostgreSQL and inbox check after SMTP is configured.
- Google sign-in requires a Google Cloud OAuth Web client ID configured as `GOOGLE_CLIENT_ID` in the root `.env` and the same value in `mobile/src/api/googleConfig.ts`. Android OAuth setup must also include the app package and debug signing SHA-1; until those values are configured, the Google button reports that setup is needed.
- Interactive Android UI flows and Google sign-in were not repeated during this verification pass. They should be checked on the emulator before release.
- iOS compilation and Keychain behavior require macOS/Xcode and were not verified from this Windows host.
