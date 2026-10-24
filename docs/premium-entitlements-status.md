# JON Stream Premium — continuation status

Last checked: 2026-10-20

## User requirements
- Verified-email trial: 3 days.
- Premium prices: 499 ETB monthly; 6,000 ETB yearly.
- Free TV/radio channels remain freely accessible.
- Premium access must be validated server-side, not only hidden by the UI.
- Telebirr support is desired, but no payment-verification integration is implemented yet.
- Keep Mobile APK and Android TV APK source/build work separate from this Web/Admin Premium work.
- Merge PR #189 only after the Premium playback enforcement and Preview tests are complete.

## Implemented on `feature/secure-premium-entitlements`
- Server-only Firebase Admin initialization from `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Firebase ID-token verification and admin UID allowlist from `JON_ADMIN_UIDS`.
- Verified-email 3-day trial status endpoint.
- Admin grant/extend/revoke endpoints and grant listing.
- Public ETB price endpoint; admin updates support `monthlyPriceETB` and `yearlyPriceETB`, defaulting to 499 and 6000. Legacy `priceETB` is retained as a monthly-price alias.
- Entitlement selection ignores expired/inactive records so a stale UID record does not mask an active email grant.
- Setup documentation updated.

## Still blocking production merge
1. **Server/gateway playback enforcement remains blocking.** The web player now blocks Premium selections unless the subscription-status API returns `hasPremium: true`, but this is only a client-side layer. Raw stream URLs and the Vercel/Cloudflare gateway routes still need server-side ticket/entitlement validation to prevent bypass.
2. Preview API functional tests against the actual Firebase project.
3. Verify Preview Vercel environment variables `FIREBASE_SERVICE_ACCOUNT_JSON` and `JON_ADMIN_UIDS` are configured; do not place secrets in source control or chat.
4. Admin UI integration for managing plans/grants/prices.
5. Telebirr payment verification requires merchant/API credentials and a verified callback flow; do not claim payments are processed until implemented and tested.

## Fresh code inspection (2026-10-20)
- Confirmed the web `index.html` already imports Firebase Auth and implements account creation, sign-in, verification email, sign-out, and subscription status display. The earlier wording that no Auth flow exists was inaccurate; the missing piece is enforcing the status at playback and gateway layers.
- `index.html` reads channel `accessTier` from Firestore for display, but current `selectStation()` and `playTVStream()` can still start the source directly. The Vercel HLS proxy and Cloudflare Worker also do not validate Premium entitlements. UI labels are not an access-control boundary.
- The Cloudflare Worker has a fixed host/port allowlist, redirect checks, playlist rewriting, and rate limiting. Preserve these safeguards while adding ticket verification; do not globally require Premium, because Free channels must continue working.
- Do not implement a client-only gate as the final security fix. A proper fix needs short-lived playback authorization tied to a server-validated channel ID/tier and verification at every playlist/segment gateway request (including nested HLS URLs), while keeping the mobile APK and Android TV source/builds separate.

## Last known CI/deployment state
- PR: https://github.com/jonjossy0-cpu/JON-stream/pull/189
- Branch: `feature/secure-premium-entitlements`
- Base: `mainv`
- Latest relevant player-gate commit: `332782723d026bf11b2d4c44993d80c3aeb45f03`.
- Latest Vercel Preview for this branch was still BUILDING at last poll; Dependency Review, Security Audit, and the repository's APK workflow were running. The APK workflow was auto-triggered by repository CI; this task did not edit APK source/build files. Do not claim the Preview or workflows passed until their final status is checked.

Do not merge until the blocking items are closed and the deployed Preview is verified.

## Architecture finding from continued gateway inspection (2026-10-20)
- The web client receives channel metadata from the public Firestore document `jonStream/appData`; the document contains `tv` and `radio` arrays with stream `url` values and an `accessTier` field. That means a browser can retrieve the raw stream URLs independently of the player UI.
- A ticket check added only to `api/hls.js` or the Cloudflare Worker would not fully secure Premium sources if those raw upstream URLs remain exposed in the public appData document or the client can open upstream URLs directly.
- Do **not** trust a client-supplied `accessTier`, channel name, or source URL as proof of entitlement. The server must look up a stable channel ID in an authoritative private catalog, verify the user's Firebase ID token and entitlement/trial, and mint a short-lived signed playback ticket bound to that channel/source. The Vercel HLS proxy and Cloudflare Worker must validate the ticket on every playlist, nested playlist, key, and segment request.
- Before calling the paywall secure, Premium source URLs must be moved out of the public `jonStream/appData` document into a server-only/private catalog (or upstream provider access must be restricted). Public channel metadata can retain only a stable ID and tier. Free playback must remain available without a paid entitlement, including for signed-out users; this requires a server-authorized Free path or preserving the existing public Free routes without accidentally allowing Premium-source URLs.
- Implementation is intentionally not marked complete yet: this private-source catalog and verified ticket flow must be designed and tested end-to-end first. No production changes or merge are authorized by this continuation.


## Premium fullscreen preferences (2026-10-20)
- Added authenticated endpoint `/api/subscription/fullscreen-preferences` on the feature branch.
- `GET` returns the signed-in verified user's saved preferences; `POST` accepts boolean `sponsorAds` and/or `newsTicker` values.
- Preferences are stored in `subscriptionProfiles/{uid}.fullscreenPreferences`. Defaults are both ON. Requests require a verified email and active entitlement or unexpired trial.
- Connected Premium-only Sponsored and News ON/OFF buttons in the TV fullscreen control row. The controls load/save preferences through the authenticated endpoint, apply CSS visibility to the fullscreen overlays, and default to ON.
- The Vercel Preview for the UI commit `a8b048a6a9a5e7434e245891645eff567b622fdb` reached `READY`.
- **Preview functional verification remains blocked:** the Vercel connection returned 403 when fetching the protected deployment, so actual sign-in, persistence, and overlay behavior could not be tested against Preview. Do not call the feature fully verified until those tests pass.

## Ticket enforcement implementation started (2026-10-24)
- New branch: `feature/premium-playback-ticket-v1` (separate from APK source/build work).
- Added `api/subscription/playback-ticket.js`: requires a verified Firebase user, reads the channel only from the private Firestore collection `premiumPlaybackChannels/{channelId}`, checks active entitlement or an unexpired 3-day trial, and issues a four-hour HMAC-signed ticket. The browser does not receive the raw source URL from this endpoint.
- Added `api/_lib/playbackTicket.js` to validate HMAC signatures and ticket expiry.
- Updated `api/hls.js` on the feature branch to accept a ticket for private-catalog Premium channels, carry the ticket through nested playlist/segment URLs, reject out-of-root URLs/redirects, and retain the existing no-ticket path for Free HLS sources. Unticketed proxy requests are checked against the private Premium catalog.
- Updated root `index.html` TV playback so Premium TV channels request a server ticket before playback; the returned proxy URL is forced through the HLS player path and backup/raw source URLs are not used in that playback attempt. The channel metadata must include `premiumChannelId` (or `playbackChannelId`/`channelId`) matching the private catalog document ID.
- Required private catalog document shape: `premiumPlaybackChannels/{channelId}` with `active: true`, `accessTier: "premium"`, and `sourceUrl` set to an allowlisted upstream HLS URL. Set `PREMIUM_PLAYBACK_TICKET_SECRET` in Vercel to a random secret of at least 32 characters; set the **same value as a Cloudflare Worker secret binding**. Configure Worker variable `PREMIUM_SOURCE_PREFIXES` as a comma-separated list of exact source directory prefixes (HTTP or HTTPS as used by the upstream URL) (for example, `https://allowed-host.example/path/`) that match each private catalog source directory. Never commit or paste secrets into chat.
- **Not production-secure yet:** the public `jonStream/appData` document still contains raw channel URLs; the browser/client has not yet been migrated to request tickets by stable `channelId`; the Cloudflare Worker ticket-verification code is present on this branch but still requires the shared secret and `PREMIUM_SOURCE_PREFIXES` configuration. Direct upstream URL exposure can bypass the Vercel proxy until the public source catalog is cleaned up or upstream access is restricted.
- Radio station selection now requests a ticket for Premium stations too, and ticket metadata identifies HLS sources so the browser can use Hls.js where supported. Radio media-format compatibility and end-to-end playback have not been tested. No merge, deployment, or end-to-end playback verification has been performed. Keep this branch unmerged until catalog migration, client integration, Worker enforcement, secret configuration, Free/Premium regression checks, and Preview tests are complete.


- The public `jonStream/appData` document is shared with existing mobile/Android TV clients; do not remove or blank shared `url` fields until those clients are migrated to the ticket flow or their channel catalogs are split safely. This is required to avoid breaking current APK playback while closing the raw-URL bypass.


## Audit update (2026-10-24, after ticket-revocation review)
- The current branch now includes client-side ticket requests for Premium TV and radio selection. This is implementation presence only; it is not evidence of successful end-to-end playback.
- The Premium playback authorization unit-test workflow, Dependency Review, JON Stream Security Audit, and APK CI workflow completed successfully for the documentation follow-up commit. The playback test workflow runs unit tests and an inline-JavaScript syntax check; it does **not** test Firebase sign-in against Preview, Firestore catalog contents, Cloudflare Worker secrets/routes, real upstream streams, or mobile device playback.
- The Vercel environment-name audit did not find `PREMIUM_PLAYBACK_TICKET_SECRET`; ticket issuance therefore remains expected to return HTTP 503 until configured. Environment values were not decrypted.
- A valid ticket remains usable until its expiry even if a user's entitlement is revoked, unless the channel is disabled or the shared secret is rotated. The current ticket lifetime is four hours; immediate per-user revocation is not implemented.
- **Decision: keep PR #234 open as Draft.** Do not merge or deploy this change yet. The raw-source bypass, secret/catalog setup, Worker enforcement, and real Free/Premium regression tests remain blockers. Preserve the existing shared channel URLs until a compatible catalog/client migration is ready, so the current APK is not accidentally broken.


## Follow-up route and test-coverage audit (2026-10-24)
- The ticket issuer currently returns a relative playback URL of `/api/hls?channelId=...&ticket=...`, and the web client resolves it against `https://jon-stream.vercel.app`. That sends the browser to the Vercel `api/hls.js` handler. The Cloudflare Worker code handles `/hls` and fixed channel routes; the current client ticket URL does not directly target that Worker route. The Vercel HLS handler contains its own ticket checks, so this is not proof of a Vercel bypass, but the deployment topology must be explicitly verified before counting Worker enforcement as active on the playback path.
- The current playback-ticket unit tests cover HMAC validation, expiry, secret mismatch, and Vercel helper source-root checks. The workflow runs `npm test` plus inline-JavaScript syntax checks. It does not include integration tests for `api/hls.js` or `gateway/worker.js`, nor verify playlist/key/segment rewriting, redirect rejection, CORS/range handling, or the deployed Worker route.
- The source-root helper in `api/_lib/playbackTicket.js` derives a slash-terminated directory root and checks the target against that root. Do not report the previously suspected path-prefix issue as a confirmed vulnerability on the Vercel route; the checked helper uses a trailing slash boundary. The Worker uses separate `startsWith` checks, so add targeted tests for boundary paths and ensure configured `PREMIUM_SOURCE_PREFIXES` values are normalized to directory boundaries before enabling it.
- **Next safe action:** add automated tests for both gateway implementations and confirm the actual deployed route for ticketed playback. Keep PR #234 Draft; do not merge or change the public shared catalog until the secrets, private catalog, route topology, and Free/Premium playback are verified.
