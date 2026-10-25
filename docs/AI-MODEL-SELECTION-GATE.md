# JON Stream AI Enhancement — model selection gate

**Status:** decision criteria only. No model weights or runtime have been installed; no AI inference runs in the player.

## Target use case
Optional enhancement of an already-decoded video frame on supported client devices, with ordinary HLS playback remaining the default and immediate fallback. The large-screen target is up to 100 inches, but screen size alone does not determine required processing: source resolution, native panel resolution, viewing distance, and TV's own scaler all matter.

## Required candidate properties
A candidate must have:
- A clear license allowing the intended distribution and commercial use; record the exact model card, version, license, and weight source before adoption.
- A browser-compatible inference path supported by the target browser/WebView and GPU, with capability detection and a clean CPU/standard-playback fallback.
- Measured end-to-end frame processing time on the actual 4 GB phone and low-memory Android TV target, not just a desktop benchmark.
- Bounded memory use and a way to stop processing immediately when playback falls behind.
- A repeatable A/B evaluation showing better perceived detail without halos, ringing, oversharpening, false texture, flicker, or temporal instability.
- No requirement to upload private viewing data or the stream itself to an external inference service.

## Candidate evaluation table

| Candidate approach | Potential value | Main risk | Current decision |
|---|---|---|---|
| Existing TV / browser scaler + correct HLS rendition | Lowest overhead; keeps playback stable | Cannot restore missing source detail | Keep as baseline |
| Lightweight device-side denoise / edge-aware enhancement | May improve mild compression artifacts | Can create halos or false detail; not necessarily AI | Evaluate only as a clearly labeled non-AI baseline |
| WebGPU super-resolution model | May improve detail on supported GPUs | Device/browser support, GPU cost, memory and frame latency vary widely | Prototype separately; not production-ready |
| CPU-only super-resolution on weak Android TV | Broad theoretical compatibility | Likely too slow for real-time video on low-power hardware | Do not enable by default |
| Server-side AI transcoding | Can run larger models on capable hardware | Added latency, cost, egress, concurrency and bitrate risks | Out of scope for current gateway; no implementation |

## Frame scheduling and fallback requirements
1. Keep the original decoded frame and normal playback path available.
2. Process only when the device has enough measured headroom; never queue an unbounded backlog of frames.
3. If processing time exceeds the frame budget repeatedly, memory pressure rises, or dropped frames/buffering increase, stop enhancement and return to normal playback.
4. Never pause HLS loading or raise the selected rendition bitrate solely to feed an enhancement model.
5. Never draw an active AI ✦ indicator unless a real model is initialized and actually processing current frames.
6. The model must not change Firebase, Premium/Free entitlements, channel URLs, audio, captions, remote controls, fullscreen, PIP, or APK behavior.

## Acceptance gates
- Test source resolutions separately (480p, 720p, 1080p; 4K only if actually supplied).
- Compare at least three runs of baseline and candidate under the same network and device conditions.
- No sustained buffering increase; no A/V sync issue; no playback-control regression.
- Candidate must visibly improve a blinded or side-by-side visual review on the target TV, not just report a larger output resolution.
- If any gate fails or the device is unsupported, leave enhancement off and use the existing player.

## Current conclusion
Do not select or bundle model weights yet. First capture baseline metrics and identify the exact target TV/browser/GPU and source stream characteristics. Model selection is evidence-gated; this document does not claim AI is active and does not authorize a production merge.
