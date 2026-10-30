# JON Stream Premium Access V2 (Preview only)

This branch adds an isolated authorization endpoint at `POST /api/subscription/v2-playback-ticket`.

## Flow
1. Verify the Firebase ID token and verified email.
2. Read the existing public TV/Radio list and require an explicitly Premium item.
3. Resolve that item's IDs against the existing private Premium catalog (document ID and explicit aliases).
4. Read existing UID/email entitlements and the existing subscription profile.
5. Issue a five-minute HMAC playback ticket for the canonical catalog document ID.
6. The existing HLS gateway validates the signed ticket and serves only the catalogued source.

## Safety boundaries
- **Read-only:** this endpoint contains no Firestore writes, transactions, deletes, or mutations.
- It does not create or start trials. It only recognizes an already persisted, unexpired trial.
- It does not alter the existing authorization endpoint or client integration.
- It does not modify Firebase documents, collections, rules, indexes, environment variables, or production settings.
- The ticket uses the existing gateway's signed-ticket format for compatibility; its five-minute expiry is enforced by the gateway.
- Current source-host allowlist is intentionally unchanged. New source hosts require separate security review.

## Preview test request
Send a POST to `/api/subscription/v2-playback-ticket` with:
`Authorization: Bearer <Firebase ID token>`, `Content-Type: application/json`, and body `{"channelId":"<public Premium channel ID>"}`.

Do not paste ID tokens or secrets into issue comments or chat. Never use this endpoint to test against a production environment until the Preview environment is explicitly configured and reviewed.
