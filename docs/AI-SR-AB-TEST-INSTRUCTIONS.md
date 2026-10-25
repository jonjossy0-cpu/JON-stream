# JON Stream — Local Image SR A/B Test Instructions

## Scope and safety

This is an **image-only experiment**. It does not connect to JON Stream's HLS player, TV/Radio playback, Firebase, Premium/Free access, or any APK. Do not merge it into `mainv` or use it to claim that live-video AI enhancement is working.

## What is needed

- A modern browser with JavaScript enabled.
- Internet access to load ONNX Runtime Web from jsDelivr.
- The official `super-resolution-10.onnx` model file from the ONNX Model Zoo candidate source.
- A locally stored test image. Use an image you have permission to test.

The page verifies the selected model against this expected SHA-256 before inference:

`85f36ff88cc504a24af5e0602148bc56a8aa09a58eca8c0da2756f3e8186035e`

A mismatch is rejected. Do not bypass the hash check to test a different file; update the candidate review and hash through a deliberate review first.

## Run the test

1. Open `ai-local-image-sr-ab-test.html` from a secure local web server or an authorized HTTPS preview. Browser security requirements can prevent SHA-256 hashing when opened directly as a `file://` page.
2. Select the verified `.onnx` file and a local image.
3. Start with **WASM / CPU**. Only try WebGPU if the browser exposes WebGPU and the WASM run works first.
4. Wait for inference to finish. Review the baseline and output side by side, especially faces, fine text, edges, gradients, and compression artifacts.
5. Export the JSON report. Keep it with the device/browser and test conditions.
6. Repeat with the same image and settings on each target device. Record failures and slow runs too; do not report only the best result.

## Interpretation

- The candidate is a 3×, luminance-focused, single-image super-resolution model; it is **not a true 4K restoration model**.
- Baseline scaling and chroma resizing are browser-canvas approximations of the reference preprocessing/postprocessing, so this is an exploratory visual comparison, not a pixel-identical reproduction of the model card's pipeline.
- A still-image run does not measure live-stream latency, dropped frames, temporal flicker, heat, battery use, sustained memory, weak-network behavior, or compatibility with MBC 3 and other channels.
- A successful inference means only that the selected model ran for this still image in this browser. It does not mean the result looks better or that video enhancement is safe to enable.

## Required gate before any player integration

1. Review output quality across several representative images and multiple runs.
2. Benchmark on the actual low-memory Android TV box and 4 GB phone; include temperature/sustained performance and memory stability.
3. Separately test video-frame handling and temporal stability.
4. Verify that disabling or failing the experiment immediately returns to the existing unmodified playback path.
5. Run regression checks for TV/Radio, HLS/failover, MBC 3, remote controls, PIP/fullscreen, Firebase, and Premium/Free.
6. Keep the feature off by default and isolated until the results are documented and explicitly approved.

**Current status:** prototype source only. No real-device image A/B result, sustained performance result, or live-stream integration is claimed.