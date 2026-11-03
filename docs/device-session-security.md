# JON Stream one-email / one-active-device session control

## Behavior

- A Firebase account can hold one active JON Stream browser/device session at a time.
- A successful sign-in claims the session when no other device is active.
- If another device is active, the new device must ask the user for confirmation before replacing it.
- If the user declines, the new device is signed back out and the existing device session remains unchanged.
- If the user confirms, the server atomically replaces the previous session; the previous device signs out on its next heartbeat/focus check.
- The previous device checks its session every 15 seconds and on browser focus/return from background. If replaced, it signs out locally and Premium playback is stopped by the existing auth-state handler.
- Signing out releases the session only when the signing-out device still owns it. It cannot release a newer device's session.
- Multiple tabs in the same browser profile share one random session ID through local storage, so opening another tab does not count as another device.

## Server-side storage

The API stores only a SHA-256 hash of a random 256-bit session ID in:

- `activeUserSessions/{firebaseUid}`

The endpoint is `POST /api/session/active` with a verified Firebase ID token and one of these actions:

- `claim` — transactionally claim/replace the active device session.
- `check` — confirm ownership and refresh the last-seen timestamp.
- `release` — delete the session only if the caller still owns it.

The endpoint uses the existing Firebase Admin service-account configuration and CORS allowlist. It does not read, migrate, or modify `jonStream/appData`, subscription entitlements, trial profiles, or Premium grants. The new session collection is separate from existing subscription data. The Admin SDK performs the writes; the browser never writes this collection directly.

## Important limits

This enforces one active browser/device session for a Firebase account; it cannot prove that one human is behind an account or prevent a person from deliberately copying browser storage. If a device is offline, it cannot receive the sign-out instruction until it reconnects and performs its next check. Existing unauthenticated Free channel playback remains public; the session control governs the signed-in account and its account-gated access.

## Rollout

The frontend calls `https://jon-stream.vercel.app/api/session/active` from the GitHub Pages site. Firebase sign-in itself remains on the existing GitHub Pages origin; this feature does not redirect users to Vercel for authentication. Vercel must deploy the new API route with the existing `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable. Keep this change in Preview until the two-device test passes. Do not merge to `mainv` or publish a production build without the user's explicit approval.
