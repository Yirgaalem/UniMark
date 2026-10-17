# UniMark share feasibility prototype (Phase 2.1)

This React Native app tests the first link-saving path only: receive shared text from another app, find an `http`/`https` URL, and save a basic bookmark to device-local storage. It has no sign-in, backend, folders, metadata fetch, or cross-device sync.

## Android setup

Requirements: Node.js 24.3+ (or 26+; React Native 0.88 does not support Node 25), JDK 17, Android Studio with Android SDK 37/build tools 37, and an Android emulator or a USB-connected phone with USB debugging enabled. On Windows, ensure `ANDROID_HOME` points to your Android SDK and `platform-tools` is on `PATH` so `adb` is available.

1. From this directory, install JavaScript dependencies with `npm install`.
2. Start an Android 16/API 36 or newer emulator in Android Studio, or connect an Android device.
3. Run `npm run android`.
4. In a source app, share a link as text and select **UniMark Share Prototype**. Confirm that the incoming card shows the payload, then tap **Save basic bookmark**.
5. Confirm the item appears under **Received links** and remains after closing and reopening the app.

For a direct receiver smoke check from an attached device, run from PowerShell:

```powershell
adb shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -n com.mobile/.MainActivity
```

The direct intent check verifies Android delivery, not the real share-sheet behavior of TikTok, Instagram, YouTube, Reddit, or a browser. Test each actual source app on a device and record what it sends.

## iOS setup

iOS requires macOS and Xcode. This Windows checkout cannot build or install the iOS target. In Xcode, add an iOS **Share Extension** target, wire the extension to `react-native-share-menu` following its `IOS_INSTRUCTIONS.md`, set matching App Group and URL scheme values, then build and test on an iPhone. The extension must be included in the containing app; test text and web URL payloads from each source app.

## Phase 2.1 acceptance record

Record for each device/source combination:

| Platform/device | Source app | Shared MIME type | Payload contains usable URL? | Save persists after restart? | Notes |
|---|---|---|---|---|---|
| Android | To test |  |  |  |  |
| iOS | To test on Mac |  |  |  |  |

Do not infer platform support from the direct Android intent smoke check alone. Share payloads vary by source app and OS version.

## Native receiver

Android receives `ACTION_SEND` with `text/plain` through the main activity. React Native code uses `react-native-share-menu` to read the initial share and subsequent shares. On iOS, the same library requires a separate Share Extension target and Xcode configuration; that native target is not generated automatically by the React Native CLI.
