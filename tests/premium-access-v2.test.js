const test = require("node:test");
const assert = require("node:assert/strict");
const v2 = require("../api/subscription/v2-playback-ticket");

const { idsFrom, catalogMatches, hasActiveEntitlement, hasActiveTrial, safeSource } = v2._test;

test("collects scalar and array public channel aliases without duplicates", () => {
  assert.deepEqual(idsFrom({
    id: "public-1",
    channelId: ["public-2", "public-1"],
    publicChannelId: "public-3"
  }), ["public-1", "public-2", "public-3"]);
});

test("matches catalog document ID and explicit alias fields", () => {
  const doc = { id: "canonical-1", data: () => ({ publicChannelIds: ["public-1", "public-2"] }) };
  assert.equal(catalogMatches(doc, ["canonical-1"]), true);
  assert.equal(catalogMatches(doc, ["public-1"]), true);
  assert.equal(catalogMatches(doc, ["unrelated"]), false);
});

test("requires active, unexpired paid entitlement unless unlimited", () => {
  const now = 1_800_000_000_000;
  const ts = value => ({ toMillis: () => value });
  assert.equal(hasActiveEntitlement([{ active: true, expiresAt: ts(now + 1000) }], now), true);
  assert.equal(hasActiveEntitlement([{ active: true, expiresAt: ts(now - 1000) }], now), false);
  assert.equal(hasActiveEntitlement([{ active: false, unlimited: true }], now), false);
  assert.equal(hasActiveEntitlement([{ active: true, unlimited: true }], now), true);
});

test("recognizes only a persisted, unexpired trial", () => {
  const now = 1_800_000_000_000;
  assert.equal(hasActiveTrial({ trialEndsAt: { toMillis: () => now + 1 } }, now), true);
  assert.equal(hasActiveTrial({ trialEndsAt: { toMillis: () => now } }, now), false);
  assert.equal(hasActiveTrial({}, now), false);
});

test("accepts valid provider hosts from trusted catalog records and rejects unsafe URLs", () => {
  assert.equal(safeSource("https://88.212.15.19/live/index.m3u8") instanceof URL, true);
  assert.equal(safeSource("https://provider-cdn.example/live/index.m3u8") instanceof URL, true);
  assert.equal(safeSource("https://user:pass@provider-cdn.example/live/index.m3u8"), null);
  assert.equal(safeSource("https://provider-cdn.example:8443/live/index.m3u8"), null);
  assert.equal(safeSource("http://127.0.0.1/internal"), null);
  assert.equal(safeSource("http://192.168.1.10/internal"), null);
});
