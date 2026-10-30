# JON Stream Premium Access V2 — isolated Preview

## Safety boundary
- This branch adds a parallel V2 API. It does not replace or edit the current Premium API, web player, Android APK, or Android TV APK.
- All Firestore operations in V2 are reads only. There are no writes, transactions, deletes, catalog synchronization, trial initialization, or automatic repairs.
- No Firebase data is migrated or modified. Existing data is consumed as-is.
- Do not merge or promote this branch without explicit user approval and successful Preview playback tests.

## V2 flow
1. Firebase ID token is verified server-side, including revocation checking through the existing `requireUser`.
2. Public `jonStream/appData` TV/Radio lists establish that the requested ID refers to exactly one Premium channel.
3. The private `premiumPlaybackChannels` collection must already contain exactly one active Premium record matching the public channel's scalar or array aliases. V2 never creates or repairs this record.
4. Existing UID/email entitlement or an already-created, unexpired trial is checked. V2 does not start a new trial because that would write to `subscriptionProfiles`.
5. A ten-minute HMAC ticket is issued and consumed by the existing HLS gateway. The ticket binds the private catalog document ID and upstream host.

## Endpoints
- `GET /api/subscription/status-v2` — read-only access status.
- `POST /api/subscription/playback-ticket-v2` — read-only channel/catalog/entitlement validation and short-lived ticket issuance.

## Required Preview configuration
- Existing Preview `FIREBASE_SERVICE_ACCOUNT_JSON` and `JON_ADMIN_UIDS` must be configured.
- `PREMIUM_PLAYBACK_TICKET_SECRET` must be configured as a random secret with at least 32 characters. Do not paste it into chat or commit it.
- Current source-host allowlist is intentionally identical to the production-branch Vercel HLS allowlist. Add a host only after reviewing both the ticket issuer and gateway policy.

## Expected safe failures
- `PREMIUM_CHANNEL_NOT_IN_LIST`: requested ID is absent or not Premium in the public list.
- `PREMIUM_CHANNEL_ID_AMBIGUOUS`: public ID matches more than one channel.
- `PREMIUM_CATALOG_RECORD_MISSING`: no pre-existing private source record matches.
- `PREMIUM_CATALOG_ID_AMBIGUOUS`: multiple private records match; manual data review is needed, but V2 will not modify Firebase.
- `PREMIUM_V2_SOURCE_REJECTED`: private source host is not allowlisted.
- `PREMIUM_ENTITLEMENT_REQUIRED`: no active paid entitlement or existing trial.
- `PREMIUM_V2_SECRET_MISSING`: Preview signing secret is not configured.

## Verification limits
Unit tests validate matching, ambiguity rejection, source policy, entitlement decisions, and ticket shape. They do not prove Firebase Preview connectivity, actual catalog population, upstream stream availability, Vercel deployment protection, or real device playback. A successful preview deployment is not a successful playback test.
