const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");

function active(entitlement, now) {
  if (!entitlement || entitlement.active !== true) return false;
  if (entitlement.unlimited === true) return true;
  const expiry = entitlement.expiresAt && typeof entitlement.expiresAt.toMillis === "function"
    ? entitlement.expiresAt.toMillis() : 0;
  return expiry > now;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req);
    if (!user.email_verified) return res.status(403).json({ error: "Verify your email to use Premium preferences" });
    const { db, FieldValue } = getServices();
    const profileRef = db.collection("subscriptionProfiles").doc(user.uid);
    const now = Date.now();
    const emailKey = require("crypto").createHash("sha256").update(String(user.email || "").trim().toLowerCase()).digest("hex");
    const [uidSnap, emailSnap, profileSnap] = await Promise.all([
      db.collection("premiumEntitlements").doc(user.uid).get(),
      db.collection("premiumEntitlementsByEmail").doc(emailKey).get(),
      profileRef.get()
    ]);
    const uidGrant = uidSnap.exists ? uidSnap.data() : {};
    const emailGrant = emailSnap.exists ? emailSnap.data() : {};
    const profile = profileSnap.exists ? profileSnap.data() : {};
    const trialEnd = profile.trialEndsAt && typeof profile.trialEndsAt.toMillis === "function" ? profile.trialEndsAt.toMillis() : 0;
    const hasPremium = active(uidGrant, now) || active(emailGrant, now) || trialEnd > now;
    if (!hasPremium) return res.status(403).json({ error: "Active Premium access or trial required" });

    const stored = profile.fullscreenPreferences && typeof profile.fullscreenPreferences === "object"
      ? profile.fullscreenPreferences : {};
    const preferences = {
      sponsorAds: stored.sponsorAds !== false,
      newsTicker: stored.newsTicker !== false
    };
    if (req.method === "GET") return res.status(200).json({ ok: true, preferences });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!["sponsorAds", "newsTicker"].some(key => Object.prototype.hasOwnProperty.call(body, key))) {
      return res.status(400).json({ error: "Provide sponsorAds and/or newsTicker as a boolean" });
    }
    const updates = {};
    for (const key of ["sponsorAds", "newsTicker"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        if (typeof body[key] !== "boolean") return res.status(400).json({ error: key + " must be a boolean" });
        preferences[key] = body[key];
        updates["fullscreenPreferences." + key] = body[key];
      }
    }
    updates.updatedAt = FieldValue.serverTimestamp();
    await profileRef.set(updates, { merge: true });
    return res.status(200).json({ ok: true, preferences });
  } catch (error) {
    return sendError(res, error);
  }
};
