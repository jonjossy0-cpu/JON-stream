# Premium playback migration audit (2026-10-26)

## Verified source-code findings

- The `mainv` web client (`index.html`) has a Premium TV and radio ticket path. It looks for `premiumChannelId` (or the documented aliases), requests `/api/subscription/playback-ticket`, and uses the returned gateway URL for playback.
- The web client intentionally refuses Premium playback if the stable channel ID or ticket helper is missing. This is a safe failure for that client, but it can make a Premium channel unavailable until its private catalog entry is configured.
- The Mobile/Android asset at `android/app/src/main/assets/index.html` does not contain the same ticket-request path in the inspected playback function: TV still builds sources from `channel.url` and radio assigns `currentStation.url` directly. Do not remove shared URLs or assume the APK is protected by the web-client change.
- The root web page still contains static station records with direct `url` values, and TV/radio channel metadata can come from the shared Firestore document `jonStream/appData`. Any Premium source URL still readable there can be copied and requested outside the app.
- PR #234 (ticketed web playback) is merged, but its own rollout checklist explicitly calls out client migration, private catalog population, secret configuration, and end-to-end tests as prerequisites. PR #242 adds per-request entitlement rechecks but remains unmerged.


- **Android TV flavor:** `android/app/build.gradle` defines separate `mobile` (7.4) and `tv` (8.0) flavors. The TV flavor uses the shared `android/app/src/main/assets/index.html`; the Gradle task generates a modified HTML only for the Mobile flavor. The shared asset has no `premiumChannelId`, `jonGetPremiumPlaybackUrl`, or `playback-ticket` implementation in the inspected playback paths, and it assigns TV/radio source URLs directly. Therefore the Android TV flavor is also not yet migrated to ticket playback. Keep Mobile and TV release/testing separate.

## Safe staged migration plan

1. **Inventory only:** identify every TV and radio item whose `accessTier` is `premium`, record its stable ID and source format, and compare the web, Mobile APK, and Android TV playback paths. Do not modify any source URL in this stage.
2. **Private catalog:** create server-only `premiumPlaybackChannels/{channelId}` documents for verified Premium items. Validate each source against the existing allowlist and confirm the HLS playlist, keys, segments, redirects, and any nested manifests remain within the permitted source root.
3. **Web Preview:** configure secrets in the hosting environment without exposing their values, then test a protected Preview: active Premium/trial succeeds; Free, expired, revoked, and unverified users fail; Free TV/radio remains playable.
4. **Client compatibility:** implement and test ticket playback in Mobile APK and Android TV as separate scoped changes. Preserve all current free-channel playback, MBC 3 behavior, backup/failover, and existing UI. Do not publish an APK until a device-level regression test passes.
5. **Controlled cutover:** only after supported clients are verified, stop exposing the Premium raw URLs in public metadata. Check Firestore rules and upstream access controls too; a server proxy alone cannot protect a source URL that remains public or independently accessible.
6. **Post-cutover checks:** test renewal/expiry/revocation during playback, ticket expiry, TV and radio, HLS segments/keys, Free channels, and older clients. Keep a rollback plan that restores the previous catalog only if that does not re-expose paid sources.

## Current status

- No shared Firestore metadata or raw URLs were changed by this audit.
- No APK source or build was changed.
- No production deployment was performed.
- Premium source URL protection is **not yet complete** while raw URLs remain public or clients can play them directly.
