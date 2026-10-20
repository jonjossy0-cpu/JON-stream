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
1. Player/Gateway enforcement: currently raw stream/Gateway URLs are not reliably blocked for Free accounts. Client-side gating alone is insufficient.
2. Authentication integration in the web player: the existing page initializes Firestore but does not yet provide the Firebase Auth flow needed to obtain ID tokens for subscription calls.
3. Preview API functional tests against the actual Firebase project.
4. Verify Preview Vercel environment variables `FIREBASE_SERVICE_ACCOUNT_JSON` and `JON_ADMIN_UIDS` are configured; do not place secrets in source control or chat.
5. Admin UI integration for managing plans/grants/prices.
6. Telebirr payment verification requires merchant/API credentials and a verified callback flow; do not claim payments are processed until implemented and tested.

## Last known CI/deployment state
- PR: https://github.com/jonjossy0-cpu/JON-stream/pull/189
- Branch: `feature/secure-premium-entitlements`
- Base: `mainv`
- Last known head when this status was written: `15aae743f3ec2ff36fa1f4b8008ade729ddb8b79`
- Vercel check was still pending at last poll; Dependency Review passed; Security Audit and Build JON Stream APK workflows were still running. The APK workflow was triggered by the repository workflow, but this task must not change or merge Mobile/Android TV sources.

Do not merge until the blocking items are closed and the deployed Preview is verified.
