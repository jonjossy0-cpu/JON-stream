const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");
const { emailKey, resolveAccess, timestampMillis } = require("../_lib/premiumAccessV2");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req);
    const { db } = getServices();
    const [uidSnap, emailSnap, profileSnap] = await Promise.all([
      db.collection("premiumEntitlements").doc(user.uid).get(),
      db.collection("premiumEntitlementsByEmail").doc(emailKey(user.email)).get(),
      db.collection("subscriptionProfiles").doc(user.uid).get()
    ]);
    const access = resolveAccess({
      uidEntitlement: uidSnap.exists ? uidSnap.data() : null,
      emailEntitlement: emailSnap.exists ? emailSnap.data() : null,
      profile: profileSnap.exists ? profileSnap.data() : null,
      emailVerified: user.email_verified === true && !!user.email
    });
    const now = Date.now();
    const daysRemaining = access.allowed && access.expiresAt
      ? Math.max(0, Math.ceil((access.expiresAt - now) / 86400000))
      : access.allowed ? null : 0;
    return res.status(200).json({
      version: 2,
      status: access.status,
      hasPremium: access.allowed,
      plan: access.plan || null,
      daysRemaining,
      remainingLabel: access.plan === "unlimited" ? "Unlimited" : undefined,
      readOnly: true,
      message: access.allowed
        ? "Premium access is active."
        : access.reason === "EMAIL_NOT_VERIFIED"
          ? "Verify your email to use Premium access."
          : "No active Premium entitlement or existing trial was found."
    });
  } catch (error) {
    return sendError(res, error);
  }
};
