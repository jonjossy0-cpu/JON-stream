# AI Model Smoke Test — Review Notes

This review is limited to the isolated experiment branch. It does not authorize production integration.

## What the smoke test establishes
- Whether ONNX Runtime Web can load in the current browser.
- Whether a selected local ONNX file can create a session.
- Whether the first input can accept a generic zero tensor and execute one inference.
- The reported input/output names, dimensions, tensor types, and inference duration.

## What it does not establish
- Correct preprocessing or postprocessing for a specific model.
- Image reconstruction quality or actual super-resolution.
- Stable video output across frames, real-time throughput, thermal behavior, or acceptable RAM usage.
- Suitability for any TV, phone, or production player.

## Safety and validity limitations to resolve before using results
1. The CDN runtime requires network access; the model file itself is selected locally and this page does not intentionally upload it.
2. The generic zero-input tensor is only a runtime smoke test. Some models may execute but produce meaningless output; others require preprocessing or additional inputs.
3. The page checks the first input only. Multi-input models must be treated as unsupported for this generic test until model-specific input handling is implemented.
4. The model's file name and size are recorded, but the current page does not calculate or verify a cryptographic hash. Do not treat a chosen file as authentic solely because of its name.
5. The WebGPU provider is requested only when selected and browser API presence is checked, but actual provider availability may still fail during session creation.
6. Releasing a session is best-effort; stop cannot guarantee cancellation of an inference already executing inside the runtime.
7. The model is not bundled, fetched automatically, or connected to HLS/player frames. No AI-active badge should be shown in the product based on this test.

## Required next gates
- Verify the candidate model's official graph metadata and expected preprocessing against its authoritative model card.
- Pin the exact model artifact and verify SHA-256 before any test use.
- Add model-specific input preparation and output interpretation rather than generic zero tensors.
- Run the standalone smoke test, record actual device/browser details, then separately perform local-image A/B testing.
- Test on the low-memory Android TV and 4 GB phone, measuring warm-up, per-frame latency, memory, dropped frames, thermal behavior, and visual artifacts.
- Keep the feature disabled and isolated until these gates pass and explicit approval is given.

## Reporting rule
Report a test as PASS_ZERO_INPUT_SMOKE_TEST_ONLY only when session creation and inference succeed. Never summarize that as “AI video enhancement works.”