# JON Stream — Modal AI Video Enhancement (prototype)

This folder is deliberately isolated from the production website and Android APKs.

## What this first prototype does

- Runs Real-ESRGAN x4 inference on a Modal T4 GPU for **one uploaded image frame**.
- Exposes `GET /health` and authenticated `POST /enhance-frame`.
- Accepts a PNG/JPEG request body up to 4 MiB and 1280×720 pixels; returns WebP.
- Requires a Modal secret named `jon-stream-ai-secret` with `JON_AI_API_KEY` before deployment, so the GPU endpoint is not exposed without authentication.

## Important limitation

This is **not yet live-TV enhancement**. Live HLS requires a separate design for decoding frames, processing them within a latency budget, and re-encoding/segmenting output. Do not route production JON Stream playback to this endpoint. First measure quality, latency, GPU cost, and cold starts using sample frames.

## Setup

1. Create a Modal API token in the Modal dashboard and keep it private.
2. In an environment with Python 3.10+, install local dependencies:
   `python -m pip install -r experiments/modal-ai-video-enhancement/modal-requirements.txt`
3. Run `modal setup` and authenticate.
4. In the Modal dashboard, create a secret named `jon-stream-ai-secret` containing `JON_AI_API_KEY` with a long random value. Do not put the value in GitHub, the website, or the APK.
5. Deploy the isolated app:
   `modal deploy experiments/modal-ai-video-enhancement/modal_app.py`
6. Open the deployed URL's `/health` route first. Send the secret value only in the `X-API-Key` request header when calling `POST /enhance-frame`.

## Before connecting to JON Stream

- Verify endpoint authentication and input validation.
- Test with a few sample frames; compare before/after and measure latency.
- Estimate GPU costs from measured per-frame latency.
- Design a bounded segment/frame pipeline for HLS only after the single-frame test is stable.
- Integrate behind an opt-in experiment flag on a separate branch; preserve the original stream as a fallback.

## Safety / cost notes

Modal GPU usage may consume credits and is not an unlimited free 24/7 service. This prototype is separate from production: it does not change the `mainv` branch, public GitHub Pages site, or APK.
