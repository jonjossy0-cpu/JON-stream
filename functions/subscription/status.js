const crypto = require("crypto");
const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");

const emailKey = email => crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req);
    const { db, Timestamp, FieldValue } = getServices();
    if (!user.email_verified) {
      return res.status(200).json({
        status: "email_verification_required", planLabel: "Email verification required",
        hasPremium: false, daysRemaining: 0, paymentLabel: "Not active",
        message: "Verify your email before starting a trial or using Premium access."
      });
    }

    const uidRef = db.collection("premiumEntitlements").doc(user.uid);
    const emailRef = db.collection("premiumEntitlementsByEmail").doc(emailKey(user.email));
    const profileRef = db.collection("subscriptionProfiles").doc(user.uid);
    const [uidSnap, emailSnap, profileSnap] = await Promise.all([uidRef.get(), emailRef.get(), profileRef.get()]);
    const now = Date.now();
    const uidEntitlement = uidSnap.exists ? uidSnap.data() : {};
    const emailEntitlement = emailSnap.exists ? emailSnap.data() : {};
    const isActive = entitlement => {
      const expiry = entitlement.expiresAt && typeof entitlement.expiresAt.toMillis === "function"
        ? entitlement.expiresAt.toMillis()
        : null;
      return entitlement.active === true &&
        (entitlement.unlimited === true || (expiry !== null && expiry > now));
    };
    // A stale UID record must not mask a newer active grant made by email.
    const activeEntitlements = [uidEntitlement, emailEntitlement].filter(isActive);
    const entitlement = activeEntitlements.find(item => item.unlimited === true) ||
      activeEntitlements.sort((a, b) => {
        const aExpiry = a.expiresAt && typeof a.expiresAt.toMillis === "function" ? a.expiresAt.toMillis() : 0;
        const bExpiry = b.expiresAt && typeof b.expiresAt.toMillis === "function" ? b.expiresAt.toMillis() : 0;
        return bExpiry - aExpiry;
      })[0] || {};
    const expiresAt = entitlement.expiresAt && typeof entitlement.expiresAt.toMillis === "function"
      ? entitlement.expiresAt.toMillis()
      : null;
    const entitlementActive = activeEntitlements.length > 0;

    if (entitlementActive) {
      const unlimited = entitlement.unlimited === true;
      return res.status(200).json({
        status: "premium", planLabel: "Premium", hasPremium: true,
        daysRemaining: unlimited ? null : Math.max(0, Math.ceil((expiresAt - now) / 86400000)),
        remainingLabel: unlimited ? "Unlimited" : undefined,
        paymentLabel: entitlement.source === "admin_grant" ? "Admin-granted access" : "Premium entitlement active",
        message: unlimited ? "Premium access is active until revoked." : "Premium access is active until its expiry date."
      });
    }

    let profile = profileSnap.exists ? profileSnap.data() : {};
    if (!profile.trialStartedAt) {
      const start = Timestamp.fromMillis(now);
      const end = Timestamp.fromMillis(now + 3 * 86400000);
      await profileRef.set({ trialStartedAt: start, trialEndsAt: end, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      profile = { ...profile, trialStartedAt: start, trialEndsAt: end };
    }
    const trialEnd = profile.trialEndsAt && typeof profile.trialEndsAt.toMillis === "function" ? profile.trialEndsAt.toMillis() : 0;
    const trialActive = trialEnd > now;
    return res.status(200).json({
      status: trialActive ? "trial" : "free", planLabel: trialActive ? "Free trial" : "Free plan",
      hasPremium: trialActive, daysRemaining: trialActive ? Math.ceil((trialEnd - now) / 86400000) : 0,
      paymentLabel: "No payment recorded",
      message: trialActive ? "Your 3-day trial is active." : "Your trial has ended. Upgrade to Premium to access Premium channels."
    });
  } catch (error) {
    return sendError(res, error);
  }
};