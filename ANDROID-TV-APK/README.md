# JON Stream Android TV — TV Bro-based build

This directory holds only the Android TV build customization. The workflow fetches
the official TV Bro source at pinned commit
[`6cb4b7c9be1bc2a231cc2590c184faa2be9c4ff3`](https://github.com/truefedex/tv-bro/commit/6cb4b7c9be1bc2a231cc2590c184faa2be9c4ff3),
patches it for JON Stream, and builds an installable debug APK with package ID
`com.jonstream.tv`.

- Starts at https://jonjossy0-cpu.github.io/JON-stream/ on normal app launches.
- Retains the actual TV Bro browser code and TV remote handling.
- Hides the browser address/navigation bar while retaining the TV Bro tabs and remote-control behavior.
- Requests immersive fullscreen (including system status/navigation bars) and keeps the display awake.
- Uses the WebView engine variant for initial compatibility testing.
- Does not build or modify the Mobile APK.

The APK is not considered verified until the workflow passes and the app is tested
on the RK3228A TV box. This is a debug build for testing, not the final signed release.
