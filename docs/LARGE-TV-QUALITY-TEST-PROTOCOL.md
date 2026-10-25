# JON Stream — Large TV picture-quality test protocol

Status: experiment-only protocol. No production player or APK changes.

## Purpose
Assess picture quality on displays up to 100 inches without sacrificing stable playback. Screen size is not itself a resolution; record the TV's native resolution and actual video output path.

## Before testing
- Use a stream URL that the tester is authorized to play.
- Record TV model, native display resolution, Android TV box/device, browser/player version, connection type, and approximate network throughput.
- Keep TV picture mode, sharpness, motion smoothing and viewing distance unchanged for each comparison.
- Use the same stream, scene, network, display settings and playback duration for baseline and candidate.

## Source test matrix
Test each source separately:
- 480p source
- 720p source
- 1080p source
- 4K source only when the channel legitimately provides it and the device can decode it

For each run, record selected HLS rendition, time to first frame, rebuffer events, total rebuffer seconds, estimated throughput, observed frame rate, dropped frames and audio/video sync notes. Export the lab CSV for every run.

## Visual review
Compare baseline and candidate side by side or in rapid alternation at the same display size. Inspect:
- Faces and skin texture (avoid plastic/smeared faces)
- Small text, logos and subtitles (avoid ringing and halos)
- Diagonal lines and high-contrast edges
- Grass, foliage, hair and fine fabric
- Fast sports/action motion
- Dark gradients and compression blocks

Do not score a frame as better just because it is sharper; check for invented-looking detail and artifacts. Have at least two viewers compare if practical, without telling them which is the candidate.

## Performance pass/fail gates
Pass only if:
- Picture quality is visibly improved in repeated comparisons.
- Total rebuffer time and rebuffer events do not increase versus baseline.
- Startup delay does not materially increase.
- Frame rate remains stable and dropped frames do not rise materially.
- Audio/video sync, captions, fullscreen, PIP, channel switching, failover and remote navigation still work.
- The device remains stable and does not show thermal or memory-pressure symptoms.

If a gate fails, disable enhancement immediately and continue the original stream. Devices that cannot run the model should remain on standard HLS playback.

## Reporting
Include the source resolution, selected rendition, display resolution, test conditions, CSV files, visual notes, and a clear pass/fail decision. Do not claim true 4K enhancement unless the output signal is 4K; do not claim missing source details have been recovered.

## Current implementation status
The current lab is a baseline diagnostics page. It does not run an AI model or implement production large-screen enhancement. The `AI ✦` badge must not imply active processing during this protocol. Keep `mainv` and APKs unchanged until a separately reviewed implementation is approved.
