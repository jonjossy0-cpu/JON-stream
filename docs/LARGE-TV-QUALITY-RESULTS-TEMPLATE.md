# JON Stream — Large-TV quality test report template

**Status:** blank template; no test results have been collected by this document.

## Test setup
- Date/time:
- Tester:
- TV make/model:
- TV native resolution:
- Actual HDMI/device output resolution:
- Android TV box / device and RAM:
- Browser / WebView version:
- Network type and measured downlink:
- Source/channel (authorized test stream):
- Source resolution and codec:
- HLS rendition selected:
- Playback mode: Low Data / Balanced
- Viewing distance:
- TV picture settings (keep fixed across runs):

## Run results

Repeat each baseline/candidate test at least three times under comparable conditions.

| Run | Variant | Source | First frame (s) | Rebuffer events | Rebuffer total (s) | Buffer ahead (s) | Estimated throughput | Observed FPS | Dropped frames | Presented frames | A/V sync or visual notes |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Baseline | | | | | | | | | | |
| 2 | Baseline | | | | | | | | | | |
| 3 | Baseline | | | | | | | | | | |
| 1 | Candidate | | | | | | | | | | |
| 2 | Candidate | | | | | | | | | | |
| 3 | Candidate | | | | | | | | | | |

Attach each lab CSV export; do not mix runs from different streams or network conditions in one comparison.

## Large-screen visual review (score 1–5)
1 = clearly worse, 3 = no clear difference, 5 = clearly better. Record source resolution with every score.

| Visual area | Baseline score | Candidate score | Artifacts / notes |
|---|---:|---:|---|
| Faces and skin texture | | | |
| Small text, logos and subtitles | | | |
| Diagonal edges / fine lines | | | |
| Grass, hair, fabric and foliage | | | |
| Fast motion | | | |
| Dark scenes / gradients | | | |
| Overall natural appearance | | | |

## Functional regression checks
- [ ] Audio/video remains synchronized
- [ ] Captions remain readable
- [ ] Channel switch still works
- [ ] Stream retry/failover still works
- [ ] Fullscreen and controls work with remote
- [ ] PIP works where supported
- [ ] Premium/Free access behavior unchanged
- [ ] AI-off fallback immediately restores standard playback
- [ ] No sustained overheating, memory pressure or app crash

## Decision
- [ ] Pass — visible improvement and all playback gates passed
- [ ] Fail — no visible improvement, artifacts, increased buffering, dropped frames, sync issues or regressions
- [ ] Inconclusive — insufficient comparable runs or unsupported metrics

Summary and reason:
Next action:
Reviewer approval:

## Decision rules
- Compare medians across repeated runs, not the single best run.
- Reject the candidate if it consistently increases rebuffering, materially worsens startup/frame drops, creates visual artifacts, or breaks playback controls.
- Metrics that the browser cannot expose must be marked “not reported”; do not estimate or invent them.
- A 4K display output does not prove 4K source detail. Report source, rendition and display/output resolution separately.
- This template does not mean an AI model is installed. The current lab measures baseline playback; no production change is authorized by filling out this report.
