# JON Stream — Local Image SR A/B Result Sheet

**Purpose:** Record a still-image experiment only. This is not a live-video or production-player test.

## Test identity
- Date/time (include timezone):
- Tester/device label (do not include personal account details):
- Device make/model:
- RAM:
- OS / Android version:
- Browser and version:
- Test page commit SHA:
- Model source/revision:
- Model file name:
- Expected SHA-256:
- Reported SHA-256:
- Backend: WASM / CPU or WebGPU
- Internet available for ONNX Runtime CDN: Yes / No

## Input image
- Image category: face / subtitles or small text / sports / animation / fine texture / dark gradient / compression artifacts / synthetic pattern / other
- Permission to test confirmed: Yes / No
- Image dimensions:
- File size:
- Notes on source quality/compression:

Do not use private or sensitive images. Keep the original image locally and do not upload it to a public issue or report.

## Run log
Repeat the same image and backend at least three times when feasible. Record failures and slow runs too.

| Run | Result (pass/fail) | Session load (ms, if reported) | Inference (ms) | Total elapsed (ms) | Error / notes |
|---|---|---:|---:|---:|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

## Visual comparison (score 1–5)
1 = clearly worse, 3 = no clear difference, 5 = clearly better. Judge at the same displayed size and zoom.

| Area | Baseline score | Enhanced score | Artifacts / observations |
|---|---:|---:|---|
| Faces / skin | | | |
| Subtitles / small text / logos | | | |
| Edges / fine lines | | | |
| Hair / grass / fabric / texture | | | |
| Gradients / dark regions | | | |
| Compression noise / ringing / halos | | | |
| Overall natural appearance | | | |

## Device stability
- Browser remained responsive: Yes / No
- Browser tab crashed/reloaded: Yes / No
- Device became unusually hot: Yes / No / Not measured
- Memory pressure or app closure observed: Yes / No / Not measured
- Repeated runs produced visibly inconsistent details: Yes / No
- JSON report exported and stored locally: Yes / No

## Decision
- [ ] Pass for further isolated testing only
- [ ] Fail — worse quality, artifacts, errors, instability or unacceptable latency
- [ ] Inconclusive — insufficient evidence

Reason:
Follow-up:

## Interpretation limits
- This is a still-image result; it does not establish live-stream frame rate, dropped frames, temporal flicker, thermal sustainability, network performance or compatibility with any channel.
- Do not call a 3× upscaled output “true 4K restoration.”
- Do not connect the experiment to the production player based on one good result. Follow the model-selection gate and test on the actual 1 GB TV box and 4 GB phone.
- No result should be reported as measured unless it was observed and recorded.
