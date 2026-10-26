# UniMark mobile app (Phase 2.2)

The Android client supports account registration/sign-in, share-in, account-backed bookmarks, custom titles, and folders. It uses the Spring Boot API and PostgreSQL backend. Phase 2.1 device-only links can be explicitly imported after signing in.

## Start the backend

Install and start Docker Desktop. From the repository root, run:

```powershell
docker compose up --build
```

Wait for the API container to start. It is available on the host at `http://localhost:8080`; the Android emulator connects through `http://10.0.2.2:8080`. The database is persistent in Docker volume `unimark-postgres`.

## Android setup

Requirements: Node.js 24.3+ or 26+ (React Native 0.88 does not support Node 25), JDK 17, Android Studio with Android SDK 37/build tools 37, and an Android emulator or USB-connected phone with USB debugging enabled. On Windows, set `ANDROID_HOME` to the SDK folder and add `platform-tools` to `PATH` so `adb` is available. Start the backend first.

1. From this directory, install JavaScript dependencies with `npm install`.
2. Start an Android emulator in Android Studio or connect an Android device.
3. Run `npm run android -- --deviceId emulator-5554`, replacing the ID with the one shown by `adb devices`.
4. Create an account or sign in, then enter the code sent to the account email. Share a link from another app, review it, add an optional title, then tap **Save to account**. The backend needs SMTP settings described in `backend/README.md` before it can send codes.
5. Create/rename/delete folders with **Manage**, assign bookmarks to one or more folders with **Folders**, rename titles inline, or delete bookmarks. The account library persists on the server.

When the app finds Phase 2.1 device-only bookmarks, it offers an explicit **Import links** action after sign-in. Successfully imported items are removed from the device-only queue one by one so a failed import can resume without duplicating already uploaded items.

For a direct Android receiver smoke check from PowerShell:

```powershell
adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -n com.yirgaalem.unimark/.MainActivity
```

This verifies Android intent delivery, not all source-app share-sheet behavior. Record remaining source-app checks in `docs/phase-2.1/feasibility-prototype.md`.

## Google sign-in setup

Google sign-in is wired into the app and API, but Google requires OAuth credentials before the button can authenticate. In Google Cloud Console, create an Android OAuth client for package `com.yirgaalem.unimark` using the debug signing SHA-1, and a Web application OAuth client. Obtain the debug SHA-1 by opening PowerShell in `mobile\android` and running `.\gradlew.bat signingReport`. Set the Web client ID in both the root `.env` as `GOOGLE_CLIENT_ID` and `src/api/googleConfig.ts` as `GOOGLE_WEB_CLIENT_ID`. Restart Docker with `docker compose up --build`, then rebuild/reinstall the Android app with `npm run android -- --deviceId emulator-5554`. A native rebuild is required after adding the Google Sign-In package. Use matching OAuth project/client settings; mismatched package name or SHA-1 prevents Android sign-in.

## iOS setup

iOS requires macOS and Xcode. This Windows checkout cannot build or install the iOS target. In Xcode, add a native **Share Extension**, wire it to `react-native-share-menu` following the library's `IOS_INSTRUCTIONS.md`, configure the App Group and URL scheme, then build and validate on an iPhone. `react-native-keychain` provides Keychain-backed token storage on iOS. The iOS share extension and build have not yet been configured or verified.

## Backend routes and behavior

The Spring Boot API routes are documented in `docs/phase-2.2/api-contract.yaml`; backend setup and token/database configuration are in `backend/README.md`. The app uses HTTP only for local development. Deployments must use HTTPS and managed secrets.
