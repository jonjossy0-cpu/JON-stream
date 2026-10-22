# HLS edge-cache pilot notes

This change is a limited optimization, not a claim of one-million-viewer capacity.

## Change

- Keeps live .m3u8 playlists as Cache-Control: no-store.
- Allows Vercel's shared edge cache to cache only successful complete GET responses that look like media segments for 30 seconds, with 60 seconds stale-while-revalidate.
- Does not cache requests with a Range header, partial responses, errors, responses with Set-Cookie, or unknown/key-like resources.
- Retains the current upstream hostname allowlist and validates redirect destinations.

## Why

The current HLS proxy returns Cache-Control: no-store for every response, so identical segment requests cannot benefit from shared CDN caching. Segment caching may reduce duplicate origin/function work when many viewers request the same segment.

## Client and deployment findings

- The Mobile APK 7.1 source is `android/app/src/main/assets/index.html`; its existing HLS route sends external HTTP stream URLs through `https://jon-stream.vercel.app/api/hls?url=...`. This pilot changes the shared gateway response policy only; it does not rewrite the APK's embedded HTML or change its UI.
- The connected Vercel project `jon-stream` is on the Hobby plan. The deployment generated from this pilot branch is a Preview deployment, not a production rollout. A successful Preview build does not establish production capacity.
- The Telegram Mini App implementation was not located in the connected GitHub repositories inspected so far. Do not claim or make a Telegram client change until its actual source repository and playback URL are identified. If it uses the same gateway URL, it may benefit from the gateway change without a client edit; that still needs verification.

## Limits and rollout

- This is only a small first step. Vercel cache behavior and hit ratio must be measured in the deployed environment.
- The handler still buffers each upstream segment in memory; this patch does not make the function a streaming CDN.
- Query-string URL differences can fragment cache keys.
- Some upstreams use unusual segment extensions or expiring URL parameters, reducing cacheability.
- One million simultaneous viewers still requires a dedicated media CDN/edge delivery design, sufficient origin capacity, a cost review, progressive load tests, monitoring, and rollback. The Vercel Hobby project alone is not evidence of capacity for that load.
- This branch does not change the website or Android APK client URLs, Telegram Mini App integration, Firebase/Premium logic, or production deployment configuration.
- No production deployment or one-million-viewer load test has been performed by this change.

## Verification required before rollout

1. Confirm the current channel segment types and URL stability.
2. Deploy to Preview and test live playback, channel changes, range requests, and source redirect failures.
3. Check response headers and CDN cache HIT/MISS metrics for segment requests; confirm playlists are not shared-cached.
4. Identify the Telegram Mini App source and verify which gateway URL it uses.
5. Select and configure a dedicated media CDN/edge path appropriate for the actual stream origin and budget.
6. Run authorized load tests in increasing stages and compare upstream request volume, function invocations, latency, and playback errors.
7. Only then consider a canary; preserve a rollback path.
