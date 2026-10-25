# JON Stream: Architecture for 1,000,000 Concurrent TV/Radio Viewers

## Status and scope

This is a proposed architecture and rollout plan, not a claim that the current service has been load-tested or can already support one million simultaneous viewers. It intentionally makes no runtime changes to the website, Mobile APK 7.1, Android TV 8.0, or production APIs.

## Capacity target

- Target: 1,000,000 concurrent viewers across TV and radio.
- Separate targets must be defined for TV and radio, peak concurrency, average watch duration, expected bitrate, regions, and acceptable startup/rebuffering rates.
- Capacity is end-to-end: stream origin, packaging, CDN delivery, APIs/authentication, databases, DNS, observability, and operational response.

### Why the media path is the main constraint

At 1 Mbps average delivered bitrate, 1,000,000 concurrent streams represent about 1 Tbps of aggregate viewer delivery; at 2 Mbps, about 2 Tbps. One hour at those rates is roughly 450 TB and 900 TB respectively, before protocol overhead and bitrate variation. This traffic must be served by a media delivery network and suitable origin infrastructure, not by a general-purpose API function.

## Proposed architecture

```text
Broadcasters / licensed channel origins
                  |
       Ingest + origin health checks
                  |
    HLS/DASH packaging (where required)
                  |
   Multi-region media CDN / edge cache
                  |
       Android Mobile / Android TV / Web

Clients ---> Static website hosting (GitHub Pages or equivalent)
Clients ---> Control-plane API (auth, channel catalog, Premium status)
                         |
               Firebase Authentication
                         |
         Private entitlement/catalog database
                         |
           Monitoring, logs, rate limits
```

### 1. Media data plane — video and audio

1. Do not route every HLS playlist and media segment through a Vercel Function.
2. Deliver segments from a media CDN/edge cache. Cache immutable media segments aggressively when the source permits it; use carefully configured short TTLs for live playlists.
3. Keep the origin protected and monitor origin health, cache-hit ratio, latency, errors, and regional availability.
4. Use multi-CDN/failover only if operational requirements and budget justify it; test failover before relying on it.
5. Keep each channel's canonical ID and playback configuration stable so the website and both APK families can use the same catalog contract.
6. For third-party channel URLs, verify redistribution rights, source stability, cache permission, CORS/range/redirect behavior, and whether the origin can support the planned audience. A CDN does not make an overloaded or unauthorized origin safe.

### 2. Control plane — login, catalog, Premium

1. Keep login and entitlement checks on APIs; do not put admin credentials or privileged keys in the client.
2. Verify Firebase ID tokens server-side and check Premium entitlement on the server.
3. Keep the authoritative channel catalog and Premium entitlements private; do not rely on a publicly readable document as the security boundary.
4. Return short-lived playback authorization where needed, but do not make the API proxy all media bytes.
5. Apply rate limits, timeouts, bounded retries, idempotency where appropriate, and graceful degradation for non-media APIs.

### 3. Hosting responsibilities

- GitHub Pages: static website files only; it cannot run the existing `/api/hls`, subscription-status, or fullscreen-preferences endpoints.
- Vercel: may continue to host lightweight control-plane endpoints if measured load, plan, limits, and cost support it. It should not be assumed to be the bulk media-delivery layer.
- Media CDN: serves the high-volume HLS/DASH content.
- Firebase: identity and data services, configured and load-tested for the actual access patterns. Avoid one database read per segment or repeated polling from every client.

## Cost and traffic reality check

For one million concurrent viewers, traffic is extremely large even at radio or low-bitrate TV rates. For example, at 1 Mbps average, the theoretical media delivery is about 450 TB per hour. Obtain written quotes using expected TV/radio bitrate, hours watched, geographic distribution, cache behavior, and peak concurrency.

A managed streaming product billed per viewer-minute can be easy to operate but very expensive at this scale. Do not migrate all existing feeds into a per-minute service until a cost model is approved. Compare CDN bandwidth pricing and managed-streaming pricing using actual channel requirements.

Vercel's published limits currently list 100 GB included Fast Data Transfer and 1 million included invocations on Hobby, with higher included transfer on Pro; these allowances are not evidence that Vercel is appropriate for the entire media data plane. See https://vercel.com/docs/limits and https://vercel.com/docs/manage-cdn-usage. Cloudflare's managed Stream live-video documentation describes ingest, encoding, and global delivery, while its pricing is based on stored and delivered minutes; evaluate its economics before adoption: https://developers.cloudflare.com/stream/stream-live/ and https://developers.cloudflare.com/stream/pricing/.

## Rollout plan — do not jump directly to one million

1. **Inventory current behavior:** map all TV/radio origins, bitrate, current HLS proxy usage, channel gateway overrides, Firebase reads, Premium calls, and app-version differences.
2. **Measure a baseline:** instrument request rate, segment/playlist sizes, cacheability, origin errors, startup time, rebuffering, and per-viewer traffic. Avoid logging tokens or personal data.
3. **Separate media from APIs:** introduce CDN delivery for a small test cohort while keeping current app behavior as the fallback. Do not replace APK assets wholesale or remove existing Mobile 7.1 fixes.
4. **Load-test progressively:** 100 → 1,000 → 10,000 → 100,000 concurrent simulated sessions, then larger stages only after passing thresholds. Test realistic playlist/segment cadence, channel changes, login bursts, failures, and regional conditions. Use authorized test streams and a load-test plan that will not overload third-party origins.
5. **Set acceptance gates:** agreed startup latency, rebuffering, playback error rate, API p95/p99 latency, cache-hit ratio, origin load, and cost per viewer-hour.
6. **Run a limited canary and rollback rehearsal:** verify Mobile APK 7.1, Android TV 8.0, and website separately. Keep the old playback path available until tests pass.
7. **Scale and operate:** autoscaling where appropriate, CDN/origin alerts, on-call ownership, incident playbooks, quota/budget alerts, and periodic capacity tests.

## Decisions required before implementation

- Expected TV and radio bitrate/resolution and channel count.
- Whether one million viewers are truly simultaneous and the expected peak duration.
- Licensed origin URLs and whether feeds may be redistributed/cached.
- Monthly budget and preferred billing model (bandwidth-based CDN versus per-minute managed streaming).
- Availability/SLO targets and geographic audience distribution.

## Current verification status

No one-million-viewer load test has been run by this document. No production configuration or application code has been changed. The next safe engineering step is to inventory the current media routes and origins, then design a measured CDN pilot with rollback.
