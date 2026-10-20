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
