# JON Stream Premium entitlement API setup

This branch adds server-side API building blocks. They are not active in production until the branch is reviewed/deployed and the required Vercel environment variables are configured.

## Required Vercel environment variables

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete Firebase service-account JSON for the `jon-stream` Firebase project. Add it in Vercel Project Settings → Environment Variables. Never commit it, put it in browser code, or send it in chat.
- `JON_ADMIN_UIDS`: comma-separated Firebase Authentication **UIDs** authorized to manage Premium grants and pricing. Do not use email addresses as the admin allowlist.

Keep both variables restricted to the server runtime and set them for Preview and Production only when appropriate. Redeploy after changing environment variables.

## API routes

- `GET /api/subscription/status` — requires a Firebase ID token in `Authorization: Bearer <token>`; reports email verification, a 3-day verified-email trial, or a current Premium entitlement.
- `POST /api/subscription/grant` — admin-only JSON body:
  - `{"action":"grant","email":"person@example.com","duration":7}`
  - `{"action":"extend","email":"person@example.com","duration":30}`
  - `{"action":"grant","email":"person@example.com","duration":"unlimited"}`
  - `{"action":"revoke","email":"person@example.com"}`
  Durations supported: 7, 30, 90, 365, or `"unlimited"`.
- `GET /api/subscription/grants` — admin-only list of email grants, expiry, and active status (maximum 500 records).
- `GET /api/subscription/config` — returns public `monthlyPriceETB` and `yearlyPriceETB` values in ETB. Defaults are 499 ETB/month and 6,000 ETB/year. The legacy `priceETB` field remains an alias for the monthly price.
- `POST /api/subscription/config` — admin-only JSON body; supports `{"monthlyPriceETB":499,"yearlyPriceETB":6000}`. Either field may be updated independently. Legacy `{"priceETB":499}` continues to update the monthly price only.

## Firestore collections

- `premiumEntitlements/{firebaseUid}` — entitlement copy for an already registered account.
- `premiumEntitlementsByEmail/{sha256-lowercase-email}` — email grant, allowing an admin to grant before the user creates an account.
- `subscriptionProfiles/{firebaseUid}` — trial start/end, created only after the user's Firebase token confirms a verified email.
- `subscriptionConfig/public` — public ETB price settings (`monthlyPriceETB`, `yearlyPriceETB`, plus legacy `priceETB` alias).

The API uses Firebase Admin SDK on the server, which bypasses Firestore client rules; all write routes therefore verify a Firebase ID token and enforce `JON_ADMIN_UIDS`.

## Important rollout limitation

These endpoints do not themselves protect raw stream URLs or force the player to call the status endpoint before playback. Do not describe Premium access as enforced until the player/gateway has been integrated and tested to deny Premium playback to a Free account. Price storage is not payment processing; Telebirr payment verification is not implemented by these routes.