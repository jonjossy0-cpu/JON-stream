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

## Large-screen TV quality profile (up to 100-inch displays)

### Quality target
- Optimize perceived detail and stable motion for large screens; do not treat screen diagonal alone as a resolution setting.
- Prefer the highest source rendition that the device and current network can sustain without repeated rebuffering. Keep an adaptive safety margin instead of forcing 4K.
- Preserve source aspect ratio and correct pixel aspect ratio. Never stretch 16:9 content to fill a different aspect ratio; allow letterboxing/pillarboxing when appropriate.
- Keep sharpening conservative and edge-aware to avoid halos, ringing, oversharpening, and amplified compression artifacts. Denoising must not smear faces, text, sports motion, or fine textures.
- Use genuine model-based super-resolution only after a licensed model and compatible runtime are selected. A larger output canvas or CSS filter alone is not AI upscaling and cannot recreate missing source detail.

### TV profile selection
- Add a future experimental `Large TV` profile, separate from the current production settings and OFF by default.
- On capable devices, evaluate frame processing at the display's actual output size and measured frame rate. Track processing latency, presented/dropped frames, memory use, device temperature where available, and visual quality.
- On weak Android TV boxes, do not force local AI inference. Keep hardware/browser decode and standard HLS playback; choose a lower stable source rendition if needed.
- On high-performance devices, compare a real AI model against the original at the same source, network, display and playback settings. Keep the model only if a blinded side-by-side review shows improvement without additional stalls or audio/video desynchronization.

### Large-screen acceptance checks
- Test on an actual large display or a verified 4K output path; emulation alone does not establish TV picture quality.
- Compare representative 480p, 720p and 1080p sources separately. Record source resolution, selected HLS rendition, display output resolution, observed frame rate, dropped frames and total rebuffer time.
- Inspect fine text, faces, diagonal edges, grass/foliage, fast motion, gradients and dark scenes at normal viewing distance.
- Require no increase in buffering or sync errors versus baseline. If processing misses the frame deadline or the device overheats/struggles, turn off enhancement and continue normal playback.
- Never promise that every source becomes true 4K or that every 100-inch TV will support local AI processing.

### Implementation gate
This is a design target only. Do not add filters, a model, or a visible `AI ✦` active state to the production player until the real processing path is implemented, measured and explicitly approved. Keep `mainv` unchanged during the experiment.
