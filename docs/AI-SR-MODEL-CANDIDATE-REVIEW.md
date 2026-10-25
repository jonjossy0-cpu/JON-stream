# JON Stream AI super-resolution candidate review

**Decision: candidate for an isolated proof-of-concept only. Not approved for player integration.**

## Candidate A — ONNX Model Zoo `super-resolution-10.onnx` (ESPCN)

- Model card: https://huggingface.co/onnxmodelzoo/super-resolution-10
- Repository/model source: https://github.com/onnx/models
- License recorded by the model card/source notice: Apache-2.0. Re-check the exact pinned model revision and include its license/notice before redistributing weights.
- Reported artifact size: approximately 240 KB; reported SHA-256 from the model notice: `85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e`. Verify downloaded bytes against the official pinned artifact before use.
- Architecture/task: ESPCN / sub-pixel CNN, 3× single-channel luminance super-resolution; this is a small image SR model, not a video-trained temporal model.
- Model-card provenance points to BSD300 image crops. That is not proof of performance on television video, sports, animation, subtitles, noise, or compression artifacts.

## Why this is the first candidate to benchmark

The small reported weight size makes it a more practical first experiment than a hundreds-of-megabytes model on a low-memory Android TV box. It can be evaluated with an ONNX browser runtime in an isolated test harness without uploading frames to a server.

## Risks and limitations

1. A small file size does not guarantee low inference latency; browser runtime, GPU support, memory copies, and device thermal behavior still need measurement.
2. A 3× luminance model is not true 4K restoration and cannot recover details absent from the source. Output dimensions alone must never be described as source quality.
3. Independent frame processing may cause temporal flicker or unstable texture. Video-specific temporal consistency is unproven and is a release blocker unless testing shows acceptable behavior.
4. The model's fixed input shape/tile strategy and padding/overlap behavior must be verified from the pinned model graph and tested carefully. Do not assume arbitrary video frame dimensions are accepted.
5. ONNX Runtime Web's browser/WASM and WebGPU backends have different compatibility and performance. Test both only where supported; keep the baseline player untouched.
6. Do not ship or automatically download model weights until the exact artifact, checksum, license, attribution, bundle size, caching, and offline/fallback behavior are reviewed.

## Proof-of-concept gate

- Pin the exact model revision and verify SHA-256 before loading it.
- Run inference on local test images first, not a live stream; show original/output side by side and expose processing time.
- Test known synthetic patterns, text/subtitles, faces, fine edges, gradients, and compression artifacts. Record halos, ringing, false detail, and color/luma changes.
- Then run a separate local video sample test to measure frame latency and temporal flicker; never connect it to production HLS or the gateway.
- On target hardware, record median/p95 inference latency, dropped frames, memory, sustained heat/performance, and fallback behavior.
- Keep disabled by default. Any persistent playback impact, temporal flicker, artifact, or unsupported runtime means no integration.

## Current status

- This review selects a candidate for testing; it does not mean the model has been downloaded, licensed for redistribution by independent legal review, integrated, or benchmarked on JON Stream hardware.
- No model weights are committed by this review.
- `mainv`, GitHub Pages production, the HLS gateway, and all APKs remain unchanged.