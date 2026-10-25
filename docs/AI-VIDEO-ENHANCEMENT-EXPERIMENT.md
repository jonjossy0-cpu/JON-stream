# JON Stream AI Video Enhancement — isolated experiment

Status: planning and validation only. This document does not enable AI processing or change the live player.

## Non-negotiable safety rules
- Keep `mainv` unchanged until a reviewed pull request is explicitly approved.
- Preserve all existing TV/Radio playback, channel URLs and failover, MBC support, Firebase, Premium/Free checks, PIP, fullscreen, remote navigation, favorites, search, ads and APK workflows.
- AI is optional. If enhancement initialization fails, the player must continue with the original source and existing playback path.
- Never show `AI ACTIVE` unless a real enhancement processor is running and frames are being processed. Otherwise show `AI UNAVAILABLE — Standard Playback`.
- Do not insert a server-side transcoding step into the existing gateway/worker.

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
