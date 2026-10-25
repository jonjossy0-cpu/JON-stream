# JON Stream — Modal AI Video Enhancement (prototype)

This folder is deliberately isolated from the production website and Android APKs.

## What this first prototype does

- Runs Real-ESRGAN x4 inference on a Modal T4 GPU for **one uploaded image frame**.
- Exposes `GET /health` and authenticated `POST /enhance-frame`.
- Accepts a PNG/JPEG request body up to 4 MiB and 1280×720 pixels; returns WebP.
- Requires an API key before invoking the GPU, to reduce accidental compute usage.

## Important limitation

This is **not yet live-TV enhancement**. Live HLS requires a separate design for decoding frames, processing them within a latency budget, and re-encoding/segmenting output. Do not route production JON Stream playback to this endpoint. First measure quality, latency, GPU cost, and cold starts using sample frames.

## Setup

1. Create a Modal API token in the Modal dashboard and keep it private.
2. In an environment with Python 3.10+, install the Modal CLI: `python -m pip install -U modal`.
3. Run `modal setup` and authenticate.
4. Create a Modal secret named `jon-stream-ai-secret` containing `JON_AI_API_KEY` with a long random value.
5. Attach that secret to both the web API function and the GPU function in `modal_app.py` (see the TODO below), then deploy:
   `modal deploy experiments/modal-ai-video-enhancement/modal_app.py`
6. Open the deployed URL's `/health` route first. Use the secret value only in the `X-API-Key` request header; never commit it to GitHub or put it in the website/APK.

## Before connecting to JON Stream

- Verify endpoint authentication and input validation.
- Test with a few locally held frames; compare before/after and measure latency.
- Estimate GPU costs from measured per-frame latency.
- Design a bounded segment/frame pipeline for HLS only after the single-frame test is stable.
- Integrate behind an opt-in experiment flag on a separate branch; preserve the original stream as a fallback.

## Safety / cost notes

The API must remain disabled until `JON_AI_API_KEY` is supplied through a Modal secret. Do not add billing details just to test the repository wiring. Modal GPU usage may consume credits and is not an unlimited free 24/7 service.
