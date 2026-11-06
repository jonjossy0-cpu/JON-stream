const test = require("node:test");
const assert = require("node:assert/strict");
const { hasCurrentPremiumAccess } = require("../api/_lib/premiumAccess");

function fakeDb(records) {
  return {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              const value = records[name + "/" + id];
              return {
                exists: value !== undefined,
                data: () => value
              };
            }
          };
        }
      };
    }
  };
}

const future = now => ({ toMillis: () => now + 60_000 });
const past = now => ({ toMillis: () => now - 60_000 });

test("allows a currently active paid entitlement", async () => {
  const now = Date.now();
  const db = fakeDb({
    "premiumEntitlements/user-1": { active: true, expiresAt: future(now) }
  });
  assert.equal(await hasCurrentPremiumAccess(db, "user-1", null, now), true);
});

test("denies an expired entitlement after the ticket was issued", async () => {
  const now = Date.now();
  const db = fakeDb({
    "premiumEntitlements/user-1": { active: true, expiresAt: past(now) },
    "subscriptionProfiles/user-1": { trialEndsAt: past(now) }
  });
  assert.equal(await hasCurrentPremiumAccess(db, "user-1", null, now), false);
});

test("allows an active verified-email trial", async () => {
  const now = Date.now();
  const db = fakeDb({
    "subscriptionProfiles/user-1": { trialEndsAt: future(now) }
  });
  assert.equal(await hasCurrentPremiumAccess(db, "user-1", null, now), true);
});

test("allows a current email-based admin grant", async () => {
  const now = Date.now();
  const emailKey = "a".repeat(64);
  const db = fakeDb({
    ["premiumEntitlementsByEmail/" + emailKey]: { active: true, expiresAt: future(now) }
  });
  assert.equal(await hasCurrentPremiumAccess(db, "user-1", emailKey, now), true);
});

test("allows unlimited grants and denies missing user identity", async () => {
  const db = fakeDb({
    "premiumEntitlements/user-1": { active: true, unlimited: true }
  });
  assert.equal(await hasCurrentPremiumAccess(db, "user-1", null), true);
  assert.equal(await hasCurrentPremiumAccess(db, "", null), false);
});
