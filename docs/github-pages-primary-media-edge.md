# GitHub Pages primary + separate HLS edge gateway

## Correct hosting boundary

- Keep the main JON Stream website at GitHub Pages: `https://jonjossy0-cpu.github.io/JON-stream/`.
- GitHub Pages serves the static HTML/CSS/JS only. It cannot execute `/api/hls` server-side code.
- Do not make Vercel the primary website or media plane.
- The HLS gateway in `workers/hls-gateway.js` is a separate Cloudflare Worker candidate. It streams upstream segment bodies instead of buffering each segment into a function-sized array, validates each redirect against the current source allowlist, leaves live playlists uncached, and enables a short edge cache only for complete successful segment GETs.
- The worker is source code only at this stage. It has not been deployed, configured with a production hostname, or load-tested.

## Safe rollout order

1. Create/deploy the Worker under a dedicated Cloudflare Workers hostname using the Cloudflare account that owns the project.
2. Test an allowlisted live playlist, nested playlist, video/audio segment, HEAD request, Range request, redirect to an unapproved host, and upstream error.
3. Confirm cache HIT/MISS behavior and that playlist responses are always `Cache-Control: no-store`.
4. Change the website's HLS gateway constant to the actual Worker URL; change the embedded Mobile APK 7.1 HTML separately, preserving its existing UI and all unrelated behavior.
5. Identify the Telegram Mini App repository and update its gateway only if it actually uses the same source/gateway path.
6. Test playback on GitHub Pages, Mobile APK 7.1, and Telegram Mini App before considering a rollout. Do not touch Android TV 8.0 unless specifically required.
7. Gradually load-test and measure edge hit ratio, origin traffic, startup time, buffering, errors, and spend. One million simultaneous viewers is not established by a successful deployment.

## Important limitations

GitHub Pages is the primary static website host, not a video CDN or backend. GitHub documents a soft 100 GB/month bandwidth limit and says Pages is not intended as free commercial SaaS hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

The video bytes must be delivered by an appropriate media CDN/edge service with adequate origin capacity and a reviewed budget. Keeping GitHub Pages as the main website does not mean serving all live video bytes from GitHub Pages.

No production client URLs have been changed in this branch because the actual Cloudflare Worker hostname and deployment are not yet available. This avoids breaking live playback or pointing users at a non-existent endpoint.
