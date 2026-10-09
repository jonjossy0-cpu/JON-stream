# JON Stream Android TV — isolated TV Bro browser build

This directory contains only Android TV build customization. CI fetches the official TV Bro source at pinned commit
[`6cb4b7c9be1bc2a231cc2590c184faa2be9c4ff3`](https://github.com/truefedex/tv-bro/commit/6cb4b7c9be1bc2a231cc2590c184faa2be9c4ff3), applies TV-only changes, and builds the real TV Bro browser.

- Uses distinct package ID `com.jonstream.tvbro` so it cannot be confused with the earlier WebView-shell APK package.
- Opens JON Stream on normal app launch.
- Keeps the TV Bro browser engine, tabs, and remote navigation.
- Hides the address/navigation bar; requests immersive fullscreen and keeps the display awake.
- Builds the WebView-engine variant for initial compatibility testing, not Chrome.
- Uses JDK 21 in CI.
- Does not build or modify `MOBILE-APK/`.

Artifact: `JON-Stream-Android-TV-TV-Bro`.
A successful CI build confirms compilation only. It still needs real-device testing on the RK3228A TV box before being called verified or release-ready.
