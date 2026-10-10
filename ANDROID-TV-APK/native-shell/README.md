# JON Stream Android TV — Native Fullscreen Test

This is a separate experimental Android TV shell under `ANDROID-TV-APK/native-shell/`.

- Opens the existing published JON Stream URL in Android WebView.
- Requests immersive sticky fullscreen to hide Android status/navigation bars.
- Has no browser address bar or browser tabs.
- Keeps the display awake while the app runs.
- Enables JavaScript, DOM storage, and media playback.
- Does not modify the site HTML, Firebase configuration, or `MOBILE-APK/`.
- Uses a separate test package ID: `com.jonstream.tv.test`.

## Installation and test checklist

1. Download only the artifact named `JON-Stream-Android-TV-Native-Fullscreen-Test` from the dedicated workflow run.
2. Install it as a separate test app. It must not replace the existing Mobile APK.
3. Confirm the app starts and loads the published JON Stream page.
4. Confirm TV and Radio lists appear and respond to the remote control.
5. Test MBC 3, MBC 4, MBC 5, and MBC Bollywood.
6. Confirm video fullscreen works and the Android status/navigation bars stay hidden.
7. Confirm Back/Escape returns from fullscreen without closing the app unexpectedly.
8. Leave radio playing briefly and check whether playback continues as expected.

## Important test limitation

A successful build only proves the APK compiles. Streaming compatibility depends on the Android System WebView provider and its version on the target box. If this shell cannot load the site while Chrome can, do not replace the browser that currently works; inspect the box's WebView provider before further changes.

Do not merge this branch into `mainv` or call the APK release-ready until it has been tested on the user's RK3228A Android Box and the checklist above has passed.
