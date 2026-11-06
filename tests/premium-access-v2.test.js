const test = require("node:test");
const assert = require("node:assert/strict");
const {
  collectIds, findPublicPremiumChannel, findPrivateCatalogChannel,
  validateSource, resolveAccess, signTicket, TICKET_TTL_SECONDS
} = require("../api/_lib/premiumAccessV2");

test("collects scalar and array aliases without duplicates", () => {
  assert.deepEqual(collectIds({ id: "legacy", publicChannelIds: ["new", "legacy", ""] }), ["legacy", "new"]);
});

test("resolves a unique Premium TV or Radio public entry by any stable alias", () => {
  const result = findPublicPremiumChannel({ tv: [{ id: "old", publicChannelIds: ["stable"], accessTier: "premium" }] }, "stable");
  assert.equal(result.group, "tv");
});

test("rejects missing, free, and ambiguous public channel IDs", () => {
  assert.equal(findPublicPremiumChannel({ tv: [{ id: "a", accessTier: "free" }] }, "a").error, "PREMIUM_CHANNEL_NOT_IN_LIST");
  assert.equal(findPublicPremiumChannel({ tv: [{ id: "a", accessTier: "premium" }], radio: [{ id: "a", accessTier: "premium" }] }, "a").error, "PREMIUM_CHANNEL_ID_AMBIGUOUS");
});

test("resolves one private catalog doc through scalar or array aliases", () => {
  const docs = [{ id: "canonical", data: { publicChannelIds: ["public"], active: true, accessTier: "premium" } }];
  assert.equal(findPrivateCatalogChannel(docs, ["public"]).id, "canonical");
});

test("rejects missing and ambiguous private catalog records", () => {
  assert.equal(findPrivateCatalogChannel([], ["public"]).error, "PREMIUM_CATALOG_RECORD_MISSING");
  const docs = [
    { id: "one", data: { id: "public", active: true, accessTier: "premium" } },
    { id: "two", data: { publicChannelIds: ["public"], active: true, accessTier: "premium" } }
  ];
  assert.equal(findPrivateCatalogChannel(docs, ["public"]).error, "PREMIUM_CATALOG_ID_AMBIGUOUS");
});

test("source allowlist rejects unsafe or unapproved URLs", () => {
  assert.ok(validateSource("https://88.212.15.19/live/channel.m3u8"));
  assert.equal(validateSource("https://evil.example/live.m3u8"), null);
  assert.equal(validateSource("https://user:pass@88.212.15.19/live.m3u8"), null);
});

test("access is read-only and recognizes paid, unlimited, and existing trial", () => {
  const now = 1000000;
  assert.equal(resolveAccess({ uidEntitlement: { active: true, expiresAt: new Date(now + 10000) }, emailVerified: true, now }).allowed, true);
  assert.equal(resolveAccess({ emailEntitlement: { active: true, unlimited: true }, emailVerified: true, now }).plan, "unlimited");
  assert.equal(resolveAccess({ profile: { trialEndsAt: new Date(now + 10000) }, emailVerified: true, now }).status, "trial");
  assert.equal(resolveAccess({ profile: {}, emailVerified: true, now }).reason, "PREMIUM_ENTITLEMENT_REQUIRED");
  assert.equal(resolveAccess({ profile: {}, emailVerified: false, now }).reason, "EMAIL_NOT_VERIFIED");
});

test("V2 tickets use a short ten-minute expiry", () => {
  assert.equal(TICKET_TTL_SECONDS, 600);
  assert.throws(() => signTicket({}, "short"), /PREMIUM_TICKET_SECRET_MISSING/);
  assert.match(signTicket({ v: 1 }, "x".repeat(40)), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});
