# JON Stream Android TV — Native Fullscreen Test

This is a separate experimental Android TV shell under `ANDROID-TV-APK/native-shell/`.

- Opens the existing published JON Stream URL in Android WebView.
- Requests immersive sticky fullscreen to hide Android status/navigation bars.
- Has no browser address bar or browser tabs.
- Keeps the display awake while the app runs.
- Enables JavaScript, DOM storage, and media playback.
- Does not modify the site HTML, Firebase configuration, or `MOBILE-APK/`.
- Uses a separate test package ID: `com.jonstream.tv.test`.

## Important test limitation

A successful build only proves the APK compiles. Streaming compatibility depends on the Android System WebView provider and its version on the target box. If this shell cannot load the site while Chrome can, do not replace the browser that currently works; inspect the box's WebView provider before further changes.

Do not merge this branch into `mainv` or call the APK release-ready until it has been tested on the user's RK3228A Android Box, including TV/Radio lists, MBC channels, remote navigation, and all system bars.
