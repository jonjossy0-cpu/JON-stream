# JON Stream Premium API on Firebase Functions

This deploys the existing Premium handlers as one HTTPS function named `subscriptionApi`, preserving the current route names and handler-level authentication/CORS checks.

## Routes

- `GET /config` — public price read
- `POST /config` — admin-only price update
- `GET /grants` — admin-only grant list
- `POST /grant` — admin-only grant/extend/revoke
- `GET /status` — signed-in user's entitlement status
- `GET|POST /fullscreen-preferences` — signed-in Premium user's preferences

## Deploy

1. Ensure the Firebase CLI is authenticated to the owner account and the project `jon-stream` is accessible.
2. Create `functions/.env.jon-stream` locally with `JON_ADMIN_UIDS` set to the exact comma-separated Firebase Authentication UID(s) for authorized admins. Never commit the real file or any service-account key.
3. From the repository root, run `npm --prefix functions install`.
4. Deploy only this function with `firebase deploy --only functions:subscriptionApi --project jon-stream`.
5. Verify `https://us-central1-jon-stream.cloudfunctions.net/subscriptionApi/config` returns JSON (expected defaults: monthly 499 ETB and yearly 6000 ETB) and that authenticated admin routes reject non-admin users.

Firebase Functions supplies Application Default Credentials, so a downloaded service-account JSON is not needed for this deployment. The existing handler CORS allowlist remains enforced; do not broaden it to arbitrary origins.

**Do not switch the Admin UI API URL until deployment and endpoint verification succeed.** After verification, set its base URL to `https://us-central1-jon-stream.cloudfunctions.net/subscriptionApi`.
