# JON Stream — Cloudflare AI Upscale Test

This is an isolated proof of concept on the `experiment/cloudflare-ai-upscale` branch. It does **not** change `mainv`, GitHub Pages, the existing gateway Worker, or any APK.

## What it does

- `GET /health`: returns a simple health/status response.
- `POST /upscale?width=1280&height=720`: accepts one JPEG, PNG, or WebP image and requests Cloudflare Images AI upscaling (`upscale: "generate"`), returning WebP.
- Requires a server-side `API_TOKEN` secret. Never put this secret in public JON Stream HTML or an APK.
- Limits inputs to 5 MB and output dimensions to at most 1920×1080.

## Configure and test

1. Create a separate Cloudflare Worker named `jon-stream-ai-upscale-test` from this folder, or deploy it with Wrangler.
2. Enable/configure the Cloudflare Images binding named `IMAGES` (configured in `wrangler.jsonc`).
3. Set a strong secret: `npx wrangler secret put API_TOKEN`.
4. Deploy the Worker, then test `GET /health`.
5. From a trusted terminal, POST a single test image with `Authorization: Bearer <API_TOKEN>` and `Content-Type: image/jpeg`. Save the returned bytes as a .webp file and compare them with the original.

## Important limits

- This is a **single-image test**, not a live-video or HLS enhancement server. No JON Stream player is connected to it.
- AI upscaling of individual frames does not provide temporal consistency or real-time video processing.
- Cloudflare Images Free currently includes up to 5,000 unique transformations per month. Each unique frame is a different source image, so a live stream would exhaust this allowance very quickly. This design must not be used for continuous video.
- Do not expose a public unauthenticated endpoint: it could be abused and consume the transformation quota.
- The Cloudflare account must have Images transformations available. The Worker has not been deployed or live-tested from this repository.

## Decision gate before integration

Only consider a next step after a real test verifies output image quality, latency, transformation quota, and cost. A separate server-side video pipeline with a supported temporal super-resolution model would be needed for genuine live AI video enhancement.
