# Phase 2.1: Share integration feasibility prototype

**Status:** Android prototype builds and passes a direct share-intent smoke check; real source-app and iOS validation remain pending.  
**App:** [`mobile/`](../../mobile/)

## What this prototype checks

- Whether Android can route a shared text payload into the UniMark app.
- Whether a usable HTTP(S) URL can be extracted from that payload.
- Whether the user can save the link as a basic local bookmark and see it after an app restart.
- What MIME type and source text arrive, for comparison across social apps.

It intentionally saves to on-device storage. Account identity and backend persistence belong to Phase 2.2; wider production share reliability belongs to Phase 3.

## Current implementation

- React Native 0.88 + TypeScript mobile shell.
- Android `ACTION_SEND` receiver for `text/plain`.
- `react-native-share-menu` bridge for initial and in-app share events.
- URL extraction and best-effort source host label for TikTok, Instagram, YouTube, Reddit, X, or other websites.
- Explicit save action; local persistence via AsyncStorage.
- Screen displays the received MIME type and shared text so payload differences can be recorded.

## Limits and outstanding verification

- Android debug build succeeded with React Native 0.88 on a Pixel_4_API_36 emulator running Android 16. The Gradle build installed the required Android SDK/build tools and NDK components.
- No iOS build has been performed. This machine runs Windows; Xcode and CocoaPods are needed on macOS. The iOS Share Extension target, App Group, and URL scheme must be added/configured in Xcode for `react-native-share-menu`.
- No real TikTok, Instagram, YouTube, Reddit, or browser share payloads have been tested yet.
- The local prototype stores the original share text and extracted URL without authentication. It is for feasibility only, not production privacy/account storage.

## Test matrix

Fill the matrix after trying real source apps on devices. Include OS version and exact app where possible.

| Platform / OS | Source app | MIME type | Payload form | URL extracted | Saved locally | Reopened after restart | Limitations |
|---|---|---|---|---|---|---|---|
| Android 16 / Pixel_4_API_36 emulator | Direct `ACTION_SEND` smoke check | `text/plain` | YouTube URL in text payload | Yes | Yes | Yes | Synthetic intent; does not validate a real source app/share sheet |
| Android / pending | TikTok | pending | pending | pending | pending | pending | pending |
| Android / pending | Instagram | pending | pending | pending | pending | pending | pending |
| Android / pending | YouTube | pending | pending | pending | pending | pending | pending |
| Android / pending | Reddit | pending | pending | pending | pending | pending | pending |
| Android / pending | Browser | pending | pending | pending | pending | pending | pending |
| iOS / pending | TikTok | pending | pending | pending | pending | pending | pending |
| iOS / pending | Instagram | pending | pending | pending | pending | pending | pending |
| iOS / pending | YouTube | pending | pending | pending | pending | pending | pending |
| iOS / pending | Reddit | pending | pending | pending | pending | pending | pending |
| iOS / pending | Browser | pending | pending | pending | pending | pending | pending |

## Exit criteria

The prototype implementation and Android synthetic smoke check are ready for review. Phase 2.1's full validation exit criteria are not yet met: real source-app shares on Android and iOS checks on macOS remain outstanding. Directly launching the Android activity with an intent is only a smoke check, not proof for all source apps.
