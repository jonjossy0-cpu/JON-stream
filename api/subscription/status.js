const { getServices, requireUser, sendError } = require("../_lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req);
    const { db, Timestamp, FieldValue } = getServices();
    if (!user.email_verified) {
      return res.status(200).json({
        status: "email_verification_required",
        planLabel: "Email verification required",
        hasPremium: false,
        daysRemaining: 0,
        paymentLabel: "Not active",
        message: "Verify your email before starting a trial or using Premium access."
      });
    }

    const entitlementRef = db.collection("premiumEntitlements").doc(user.uid);
    const profileRef = db.collection("subscriptionProfiles").doc(user.uid);
    const [entitlementSnap, profileSnap] = await Promise.all([entitlementRef.get(), profileRef.get()]);
    const now = Date.now();
    const entitlement = entitlementSnap.exists ? entitlementSnap.data() : {};
    const expiresAt = entitlement.expiresAt && typeof entitlement.expiresAt.toMillis === "function" ? entitlement.expiresAt.toMillis() : null;
    const entitlementActive = entitlement.active !== false && (
      entitlement.unlimited === true || (expiresAt !== null && expiresAt > now)
    );

    if (entitlementActive) {
      const unlimited = entitlement.unlimited === true;
      const daysRemaining = unlimited ? null : Math.max(0, Math.ceil((expiresAt - now) / 86400000));
      return res.status(200).json({
        status: "premium",
        planLabel: "Premium",
        hasPremium: true,
        daysRemaining,
        remainingLabel: unlimited ? "Unlimited" : undefined,
        paymentLabel: entitlement.source === "admin_grant" ? "Admin-granted access" : "Premium entitlement active",
        message: unlimited ? "Premium access is active until revoked." : "Premium access is active until its expiry date."
      });
    }

    let profile = profileSnap.exists ? profileSnap.data() : {};
    if (!profile.trialStartedAt) {
      const start = Timestamp.fromMillis(now);
      const end = Timestamp.fromMillis(now + 3 * 86400000);
      await profileRef.set({
        trialStartedAt: start,
        trialEndsAt: end,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      profile = { ...profile, trialStartedAt: start, trialEndsAt: end };
    }
    const trialEnd = profile.trialEndsAt && typeof profile.trialEndsAt.toMillis === "function" ? profile.trialEndsAt.toMillis() : 0;
    const trialActive = trialEnd > now;
    return res.status(200).json({
      status: trialActive ? "trial" : "free",
      planLabel: trialActive ? "Free trial" : "Free plan",
      hasPremium: trialActive,
      daysRemaining: trialActive ? Math.ceil((trialEnd - now) / 86400000) : 0,
      paymentLabel: "No payment recorded",
      message: trialActive ? "Your 3-day trial is active." : "Your trial has ended. Upgrade to Premium to access Premium channels."
    });
  } catch (error) {
    return sendError(res, error);
  }
};