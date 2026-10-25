# JON Stream AI Video Enhancement — isolated experiment

Status: planning and validation only. This document does not enable AI processing or change the live player.

## Non-negotiable safety rules
- Keep `mainv` unchanged until a reviewed pull request is explicitly approved.
- Preserve all existing TV/Radio playback, channel URLs and failover, MBC support, Firebase, Premium/Free checks, PIP, fullscreen, remote navigation, favorites, search, ads and APK workflows.
- AI is optional. If enhancement initialization fails, the player must continue with the original source and existing playback path.
- Never show `AI ACTIVE` unless a real enhancement processor is running and frames are being processed. Otherwise show `AI UNAVAILABLE — Standard Playback`.
- Do not insert a server-side transcoding step into the existing gateway/worker.


## Compact AI status icon (including fullscreen)
- Use a small `AI ✦` icon/chip over the video instead of a text banner, to save screen space.
- When fullscreen playback controls appear, show the AI icon in the same overlay group and start a 3-second visibility window. Hide the icon when that 3-second window ends, in sync with the fullscreen controls; when the controls are shown again, show the icon again and restart the 3-second window.
- In normal (non-fullscreen) playback, follow the same 3-second control-overlay visibility lifecycle if that player uses the same auto-hiding controls.
- Keep it anchored to a safe video corner so it does not cover the main controls or captions; make it small enough for phone and Android TV layouts.
- Show the active styling only while the real enhancement processor confirms that it is initialized and processing video frames. Merely enabling a setting, detecting WebGPU, or applying a CSS filter is not sufficient.
- If AI is unavailable, stopped, or has fallen back to the original stream, do not show the active icon; optionally show a subdued/off state only where the player already provides status feedback.
- The icon must not intercept remote-control focus, block playback controls, or alter channel switching, PIP, fullscreen, or audio/video behavior.
- Keep this UI behind the experiment feature flag. Do not change `mainv` until the icon and fallback behavior have been tested and reviewed.

## Recommended architecture
1. Keep the current HLS.js playback path as the default and fallback.
2. Use HLS adaptive bitrate when the source provides a multivariant playlist. In Low Data mode, favor conservative bitrate selection and keep enough buffer to avoid repeated stalls.
3. Prototype enhancement separately from playback. First validate an optional device-side enhancement path on supported browsers/devices; do not label CSS sharpening or filters as AI.
4. Evaluate server-side AI only as a separate, opt-in proof of concept on a single test channel and short sample. Measure real-time factor, end-to-end latency, output bitrate, GPU availability, egress and concurrent-user limits. Do not promise free, always-on GPU processing.
5. If an enhanced stream is ever produced, encode a low-bitrate HLS rendition and cache segments where legally and technically permitted. The enhanced output must not require a higher network bitrate than the selected Low Data budget.
6. Use a feature flag that defaults OFF until tests pass. AI failure, overload, timeout, or increased buffering must immediately fall back to the original HLS source.

## Test gates before any integration
- Baseline and candidate playback both open the same test channel successfully.
- Test at controlled network profiles including 5 Mbps and below; record startup time, rebuffer count/duration, bitrate and dropped frames.
- No worse rebuffering than baseline; if the AI path adds stalls, fallback activates.
- Confirm audio/video sync, fullscreen, PIP, channel switching, retry/failover and TV remote navigation remain intact.
- Test a low-memory Android TV box and a phone; unsupported devices use normal playback.
- Compare frames side by side and document the actual improvement; do not claim true 4K when the source lacks that detail.
- Run existing repository tests before proposing a merge.

## Initial configuration target
- Quality: Low/Auto adaptive, based on the user's chosen setting.
- Low Data Mode: ON.
- AI Enhancement: requested ON, but `AI ACTIVE` only when an actual enhancement processor is operational. If no processor is available, report the fallback truthfully and continue playback.
- No production code has been changed by this planning document.
