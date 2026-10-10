# JON Stream Android TV — Direct Chrome Launcher Test

This isolated test APK lives under `ANDROID-TV-APK/native-shell/`. It does **not** render JON Stream in Android WebView. When opened, it launches the existing published website directly in Google Chrome, because Chrome is the browser known to work on the target Android Box.

- Opens `https://jonjossy0-cpu.github.io/JON-stream/` in the installed Chrome app.
- If Chrome is not installed, asks Android to open the same URL in another installed browser.
- Does not embed or reimplement the website.
- Does not modify the website HTML, Firebase configuration, or `MOBILE-APK/`.
- Uses a separate test package ID: `com.jonstream.tv.test`.

## Important limitation

An ordinary APK that launches Chrome cannot force Chrome to hide its address bar or browser controls. This approach prioritizes the same Chrome engine that works on the box. If hiding Chrome's controls is still mandatory, a verified Trusted Web Activity/PWA or a device-level kiosk setup must be evaluated separately; those options have additional setup requirements and must not be assumed to work without testing.

## Install and test

1. Download only the artifact named `JON-Stream-Android-TV-Chrome-Launcher-Test` from the dedicated workflow run.
2. Install it as a separate test app; it must not replace Mobile APK 6.0.
3. Open the launcher and confirm it opens the exact JON Stream URL in Chrome.
4. Use the remote to navigate the TV and Radio lists.
5. Test MBC 3, MBC 4, MBC 5, and MBC Bollywood.
6. Confirm TV playback, fullscreen, and radio playback on the actual RK3228A box.
7. Check whether Chrome's address bar and controls remain visible.

A successful build only proves the launcher compiles. The real box test is still required. Do not merge this branch into `mainv` or call the APK release-ready until it has been tested and explicitly approved by the user.
