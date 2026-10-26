function isActiveEntitlement(item, now) {
  if (!item || item.active !== true) return false;
  if (item.unlimited === true) return true;
  return !!(item.expiresAt && typeof item.expiresAt.toMillis === "function" && item.expiresAt.toMillis() > now);
}

// Re-check current server-side access for every playlist/segment request.
// Fail closed when Firestore is unavailable; never trust the ticket's issue-time access alone.
async function hasCurrentPremiumAccess(db, uid, emailKey, now = Date.now()) {
  if (typeof uid !== "string" || !uid) return false;

  const refs = [
    db.collection("premiumEntitlements").doc(uid),
    db.collection("subscriptionProfiles").doc(uid)
  ];
  if (typeof emailKey === "string" && /^[a-f0-9]{64}$/.test(emailKey)) {
    refs.push(db.collection("premiumEntitlementsByEmail").doc(emailKey));
  }

  const snapshots = await Promise.all(refs.map(ref => ref.get()));
  const uidEntitlement = snapshots[0].exists ? snapshots[0].data() || {} : {};
  const profile = snapshots[1].exists ? snapshots[1].data() || {} : {};
  const emailEntitlementSnap = snapshots[2];
  const emailEntitlement = emailEntitlementSnap && emailEntitlementSnap.exists
    ? emailEntitlementSnap.data() || {}
    : {};

  if (isActiveEntitlement(uidEntitlement, now) || isActiveEntitlement(emailEntitlement, now)) return true;

  const trialEndsAt = profile.trialEndsAt && typeof profile.trialEndsAt.toMillis === "function"
    ? profile.trialEndsAt.toMillis()
    : 0;
  return trialEndsAt > now;
}

module.exports = { hasCurrentPremiumAccess };
