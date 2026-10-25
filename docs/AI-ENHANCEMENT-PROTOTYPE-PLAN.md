# JON Stream — isolated client-side enhancement prototype plan

**State: planning only. No AI inference implementation or model weights are present.**

## Scope
Build a standalone prototype under the experiment branch. It must not import, modify, or replace the production JON Stream player. The prototype receives video frames only in an explicitly started test session, and the default path remains the original frame.

## Prototype stages
1. **Capability gate:** detect WebGPU/WebGL, browser support, memory/performance signals where available, and the device class supplied by the tester. Capability detection must not be presented as proof of real-time AI support.
2. **Baseline capture:** collect startup time, rebuffer events and duration, selected HLS rendition, presented/dropped frames when exposed, device/TV/source metadata, and export CSV. This stage is the current lab.
3. **Model adapter contract:** define a small interface such as initialize(), processFrame(frame), dispose(), and status. Model name/version/license and input/output dimensions must be visible in the test report. No model should be loaded until its license, size, runtime compatibility, and provenance are reviewed.
4. **Frame-budget guard:** use a bounded single-frame pipeline; do not queue stale frames. If processing misses the frame budget repeatedly, falls behind playback, or increases drops/buffering, disable processing and show the original video.
5. **A/B review:** compare original and candidate using the same source, device, output resolution, network, and display settings. Record at least three runs for each variant and evaluate faces, text, fine edges, foliage, motion, dark scenes, artifacts, and temporal flicker.
6. **Device matrix:** test the 4 GB phone and low-memory Android TV separately. Test 480p, 720p, and 1080p sources; test 4K only when the source really supplies it. Never infer source quality from display output resolution.
7. **Review gate:** only propose integration after measured visual improvement and playback stability are demonstrated. Production integration requires separate explicit approval.

## Active-state and UX rules
- The AI ✦ indicator may say active only while the selected, licensed model is initialized and is processing current video frames.
- A static preview indicator must remain clearly labeled preview and must never be reused as a real active status.
- If unsupported, disabled, or failed, remove the active state and preserve ordinary playback.
- Fullscreen controls, channel navigation, PIP, captions, audio, HLS failover, Firebase, Premium/Free checks, and APK code are out of scope and must not be touched by this prototype.

## Performance gates
- No sustained increase in buffering compared with baseline.
- No persistent rise in dropped frames, A/V desynchronization, memory pressure, overheating, or crashes.
- Stop inference when its measured latency exceeds the available frame budget repeatedly; never delay HLS network loading to feed the model.
- If metrics cannot be read, mark them unavailable rather than inventing values.

## Not authorized
- No production branch merge.
- No APK build or update.
- No server-side transcoding or changes to the HLS gateway.
- No claims of 4K restoration from a lower-resolution source.
- No external upload of stream frames for inference.

## Next implementation task
Create a model-free prototype shell and adapter interface in a new isolated lab file first. Add a real model only after the license, runtime, and device performance have been independently verified.