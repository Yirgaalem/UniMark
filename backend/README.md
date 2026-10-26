# UniMark API (Phase 2.2)

Spring Boot 3.5 / Java 17 REST API backed by PostgreSQL. Flyway creates the tables on first startup. All bookmark and folder operations take their owner from the verified access-token subject; the client never supplies a user ID.

## Start the local stack

Install and start Docker Desktop, then from the repository root run:

```powershell
docker compose up --build
```

The API listens on `http://localhost:8080`. Health check: `http://localhost:8080/actuator/health`. PostgreSQL data is stored in the named `unimark-postgres` volume. Stop with `Ctrl+C`; use `docker compose down` to stop/remove containers. `docker compose down -v` also deletes the local database volume.

The Compose defaults are for local development only. Set unique values in a root `.env` file for `POSTGRES_PASSWORD` and `UNIMARK_JWT_SECRET`; never reuse development credentials in a deployed service. Generate a JWT secret with a cryptographically secure random generator and keep it out of Git.

Google sign-in is optional until configured. Set `GOOGLE_CLIENT_ID` in the root `.env` to the OAuth client ID of type **Web application**. The API verifies Google ID tokens against Google's public signing keys and checks their issuer, audience, expiry, and verified email claim.

## Email sign-in codes

Account creation, password sign-in, and Google sign-in now send a 6-digit code to the account email. No access token is issued until the code is verified. Codes expire after 10 minutes, can be tried up to five times, and can be resent after one minute. The old authenticator setup screen is no longer used; existing accounts receive email codes on their next sign-in.

Configure an SMTP provider in the root `.env` using `UNIMARK_SMTP_HOST`, `UNIMARK_SMTP_PORT`, `UNIMARK_SMTP_USERNAME`, `UNIMARK_SMTP_PASSWORD`, `UNIMARK_SMTP_FROM`, and `UNIMARK_SMTP_SECURITY` (`starttls`, `ssl`, or `none`). The `FROM` address must be permitted by the provider. Keep SMTP credentials out of Git. The API returns a clear 503 error for account creation and sign-in until delivery is configured; it never displays a code in the app or logs.

For local testing without a domain, a dedicated Gmail account can send codes through SMTP. Turn on 2-Step Verification for that sender account and create a Google app password, then add these values to the root `.env` (using the actual address and app password):

```dotenv
UNIMARK_SMTP_HOST=smtp.gmail.com
UNIMARK_SMTP_PORT=587
UNIMARK_SMTP_USERNAME=your-dedicated-sender@gmail.com
UNIMARK_SMTP_PASSWORD=your-google-app-password
UNIMARK_SMTP_FROM=your-dedicated-sender@gmail.com
UNIMARK_SMTP_SECURITY=starttls
```

Restart the API with `docker compose up -d --build api` after saving `.env`. For public use, move to a verified sending domain and a transactional email provider; personal Gmail SMTP is intended here only for development.

## API routes

All routes use `/api/v1`.

- `POST /auth/register`, `POST /auth/login`, `POST /auth/google`, `POST /auth/email-code/verify`, `POST /auth/email-code/resend`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /me`
- `GET|POST /bookmarks`, `GET|PATCH|DELETE /bookmarks/{id}`, `PUT /bookmarks/{id}/folders`
- `GET|POST /folders`, `PATCH|DELETE /folders/{id}`

Bookmark listing accepts `folderId`, `platform`, `cursor`, and `limit` query parameters. Limit is capped at 100. See `docs/phase-2.2/api-contract.yaml` for the OpenAPI contract.

## Run the API outside Docker

Use Java 17 and a PostgreSQL instance. Set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`, and `UNIMARK_JWT_SECRET`, then run:

```powershell
cd backend
$env:UNIMARK_JWT_SECRET = "<random-secret-at-least-32-bytes>"
.\gradlew.bat bootRun
```

The committed development endpoint uses HTTP for the Android emulator's `10.0.2.2` host bridge. Use HTTPS and a managed secret/database before exposing the API outside local development.
