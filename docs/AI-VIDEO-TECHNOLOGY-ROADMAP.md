# JON Stream AI Video Enhancement — technology roadmap

Status: isolated experiment; planning and baseline measurement. This is not a claim that AI enhancement is already implemented.

## Goal
Improve perceived video quality where the device can process frames efficiently, while preserving reliable playback on weak networks and low-memory devices. Never make buffering worse just to show an AI badge.

## Recommended technical direction
1. **Keep HLS.js as the playback baseline and fallback.** Preserve channel URLs, existing failover, audio, captions, Premium/Free access checks, PIP, fullscreen and remote navigation.
2. **Feature-detect a device-side processing path.** Evaluate WebCodecs for frame-level video access and WebGPU for GPU processing only when both the browser and device support the required APIs and performance. API availability alone is not proof that an enhancement model is loaded or working.
3. **Select a real, licensed enhancement model before enabling AI.** Measure model load time, per-frame processing latency, dropped frames, GPU/CPU and memory use, and visual quality against the original frame. Do not call CSS sharpening or a GPU capability check “AI.”
4. **Use a strict performance budget.** If frame processing falls behind playback, dropped frames rise, memory pressure appears, or buffering worsens, stop enhancement and immediately continue with the original stream. Never wait for AI to recover before restoring standard playback.
5. **Keep weak devices supported.** Devices without the needed APIs, model resources, or performance use normal HLS playback. Low Data mode must keep conservative adaptive bitrate settings; enhancement must not require a higher stream bitrate.
6. **Do not add AI transcoding to the existing gateway worker.** Any later server-side experiment must be separate, opt-in, and measured for GPU cost, latency, egress and concurrent-user limits.
7. **Make AI status truthful and compact.** Show the small `AI ✦` icon only while a real processor is actively processing frames. In fullscreen it belongs to the same control overlay: show it with the controls, hide it after 3 seconds, and show it again whenever the controls reappear. If processing stops or falls back, remove the active icon.
8. **Use staged rollout.** Keep the feature flag OFF by default. Test on a phone and the low-memory Android TV box before any production integration. Do not merge to `mainv` until the baseline/candidate tests pass and changes are explicitly approved.

## Required experiment sequence
- Record baseline playback first on the same permitted test stream and network.
- Compare Low Data and Balanced modes over repeated runs, recording startup time, rebuffer count and duration, throughput estimate, buffered seconds, dropped frames, and playback stability.
- Add the real model only after a compatible frame-processing pipeline is proven.
- Compare original and enhanced frames under the same source and display conditions; report genuine visual gains rather than claiming artificial 4K detail.
- Verify audio/video sync, channel switch, retry/failover, fullscreen controls, PIP, and remote navigation.
- If the AI path fails any gate, use normal playback without disrupting the viewer.

## Current truth
The isolated lab currently measures baseline playback only. No real enhancement model has been selected or wired into the player; the AI icon must therefore not indicate active processing yet. `mainv` remains unchanged.
