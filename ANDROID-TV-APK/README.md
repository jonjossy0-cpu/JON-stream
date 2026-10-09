# JON Stream Android TV — TV Bro based build

This directory contains the **Android TV-only** build customization. It fetches the
official TV Bro source at pinned commit
[`6cb4b7c9be1bc2a231cc2590c184faa2be9c4ff3`](https://github.com/truefedex/tv-bro/commit/6cb4b7c9be1bc2a231cc2590c184faa2be9c4ff3),
applies the JON Stream startup/fullscreen customization, and builds an installable
debug APK with package ID `com.jonstream.tv`.

- JON Stream opens on ordinary app launch: https://jonjossy0-cpu.github.io/JON-stream/
- TV Bro browser features and remote navigation remain from upstream source.
- Fullscreen immersive mode is requested and the screen is kept awake.
- Uses TV Bro's WebView engine variant for compatibility with Android TV boxes.
- The build workflow is isolated from the existing Mobile APK source and signing flow.

Build from GitHub Actions: **Build JON Stream Android TV (TV Bro)** → **Run workflow**.
The APK is not considered verified until the workflow succeeds and the app is tested
on the target RK3228A Android TV box. This first build is debug-signed for testing;
it is not a final release APK.
