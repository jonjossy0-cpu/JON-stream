const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");

if (!getApps().length) initializeApp();
const db = getFirestore();
const adminUidsParam = defineString("JON_ADMIN_UIDS", { default: "" });
const emailKey = email => crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
const adminAllowed = uid => adminUidsParam.value().split(",").map(x => x.trim()).filter(Boolean).includes(uid);
const active = (entitlement, now) => {
  const expiry = entitlement.expiresAt && typeof entitlement.expiresAt.toMillis === "function" ? entitlement.expiresAt.toMillis() : null;
  return entitlement.active === true && (entitlement.unlimited === true || (expiry !== null && expiry > now));
};

exports.subscriptionStatus = onCall({ region: "us-central1", enforceAppCheck: false }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to check your subscription.");
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const email = String(token.email || "").trim().toLowerCase();
  const verified = token.email_verified === true;
  if (!verified || !email) {
    return { status: "email_verification_required", planLabel: "Email verification required", hasPremium: false,
      daysRemaining: 0, paymentLabel: "Not active", message: "Verify your email before starting a trial or using Premium access." };
  }

  const [uidSnap, emailSnap, profileSnap] = await Promise.all([
    db.collection("premiumEntitlements").doc(uid).get(),
    db.collection("premiumEntitlementsByEmail").doc(emailKey(email)).get(),
    db.collection("subscriptionProfiles").doc(uid).get()
  ]);
  const now = Date.now();
  const grants = [uidSnap.exists ? uidSnap.data() : {}, emailSnap.exists ? emailSnap.data() : {}].filter(x => active(x, now));
  const entitlement = grants.find(x => x.unlimited === true) || grants.sort((a, b) => {
    const ax = a.expiresAt && typeof a.expiresAt.toMillis === "function" ? a.expiresAt.toMillis() : 0;
    const bx = b.expiresAt && typeof b.expiresAt.toMillis === "function" ? b.expiresAt.toMillis() : 0;
    return bx - ax;
  })[0];

  if (entitlement) {
    const unlimited = entitlement.unlimited === true;
    const expiry = entitlement.expiresAt && typeof entitlement.expiresAt.toMillis === "function" ? entitlement.expiresAt.toMillis() : null;
    return { status: "premium", planLabel: "Premium / Paid", hasPremium: true,
      daysRemaining: unlimited ? null : Math.max(0, Math.ceil((expiry - now) / 86400000)),
      remainingLabel: unlimited ? "Unlimited" : undefined,
      paymentLabel: entitlement.source === "admin_grant" ? "Admin-granted access" : "Premium entitlement active",
      message: unlimited ? "Premium access is active until revoked." : "Premium access is active until its expiry date." };
  }

  const profileRef = db.collection("subscriptionProfiles").doc(uid);
  let profile = profileSnap.exists ? profileSnap.data() : {};
  if (!profile.trialStartedAt) {
    const start = Timestamp.fromMillis(now);
    const end = Timestamp.fromMillis(now + 3 * 86400000);
    await profileRef.set({ trialStartedAt: start, trialEndsAt: end, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    profile = { ...profile, trialStartedAt: start, trialEndsAt: end };
  }
  const trialEnd = profile.trialEndsAt && typeof profile.trialEndsAt.toMillis === "function" ? profile.trialEndsAt.toMillis() : 0;
  const trialActive = trialEnd > now;
  return { status: trialActive ? "trial" : "free", planLabel: trialActive ? "Free trial" : "Free plan",
    hasPremium: trialActive, daysRemaining: trialActive ? Math.ceil((trialEnd - now) / 86400000) : 0,
    paymentLabel: "No payment recorded",
    message: trialActive ? "Your 3-day trial is active." : "Your trial has ended. Upgrade to Premium to access Premium channels." };
});

exports.updatePremiumEntitlement = onCall({ region: "us-central1", enforceAppCheck: false }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!adminAllowed(request.auth.uid)) throw new HttpsError("permission-denied", "Admin access required.");
  const body = request.data || {};
  const action = String(body.action || "");
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  if (!["grant", "extend", "revoke"].includes(action)) throw new HttpsError("invalid-argument", "Action must be grant, extend, or revoke.");
  const allowedDurations = new Set([7, 30, 90, 365, "unlimited"]);
  if (action !== "revoke" && !allowedDurations.has(body.duration)) throw new HttpsError("invalid-argument", "Duration must be 7, 30, 90, 365, or unlimited.");

  let target = null;
  try { target = await getAuth().getUserByEmail(email); }
  catch (error) { if (error.code !== "auth/user-not-found") throw error; }
  const refs = [db.collection("premiumEntitlementsByEmail").doc(emailKey(email))];
  if (target) refs.push(db.collection("premiumEntitlements").doc(target.uid));
  if (action === "revoke") {
    const batch = db.batch();
    refs.forEach(ref => batch.set(ref, { active: false, unlimited: false, source: "admin_grant",
      revokedAt: FieldValue.serverTimestamp(), revokedBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    await batch.commit();
    return { ok: true, action, email, status: "revoked" };
  }
  const emailRef = refs[0];
  const existingSnap = await emailRef.get();
  const existing = existingSnap.exists ? existingSnap.data() : {};
  const now = Date.now();
  const oldExpiry = existing.expiresAt && typeof existing.expiresAt.toMillis === "function" ? existing.expiresAt.toMillis() : now;
  const startFrom = action === "extend" ? Math.max(now, oldExpiry) : now;
  const unlimited = body.duration === "unlimited";
  const expiresAt = unlimited ? null : Timestamp.fromMillis(startFrom + Number(body.duration) * 86400000);
  const grant = { active: true, unlimited, ...(expiresAt ? { expiresAt } : { expiresAt: FieldValue.delete() }),
    email, source: "admin_grant", grantedBy: request.auth.uid,
    grantedAt: existing.grantedAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), revokedAt: FieldValue.delete() };
  const batch = db.batch();
  refs.forEach(ref => batch.set(ref, grant, { merge: true }));
  await batch.commit();
  return { ok: true, action, email, status: "premium", duration: unlimited ? "unlimited" : Number(body.duration),
    expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null, accountFound: !!target };
});

exports.subscriptionConfig = onCall({ region: "us-central1", enforceAppCheck: false }, async request => {
  const ref = db.collection("subscriptionConfig").doc("public");
  if (request.data && request.data.action === "update") {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
    if (!adminAllowed(request.auth.uid)) throw new HttpsError("permission-denied", "Admin access required.");
    const body = request.data;
    const valid = value => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000;
    const hasMonthly = Object.prototype.hasOwnProperty.call(body, "monthlyPriceETB");
    const hasYearly = Object.prototype.hasOwnProperty.call(body, "yearlyPriceETB");
    if (!hasMonthly && !hasYearly) throw new HttpsError("invalid-argument", "Provide monthlyPriceETB and/or yearlyPriceETB.");
    if (hasMonthly && !valid(body.monthlyPriceETB)) throw new HttpsError("invalid-argument", "Invalid monthly price.");
    if (hasYearly && !valid(body.yearlyPriceETB)) throw new HttpsError("invalid-argument", "Invalid yearly price.");
    const updates = { currency: "ETB", updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    if (hasMonthly) { updates.monthlyPriceETB = Number(body.monthlyPriceETB); updates.priceETB = Number(body.monthlyPriceETB); }
    if (hasYearly) updates.yearlyPriceETB = Number(body.yearlyPriceETB);
    await ref.set(updates, { merge: true });
  }
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  const valid = value => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000;
  const monthlyPriceETB = valid(data.monthlyPriceETB) ? Number(data.monthlyPriceETB) : (valid(data.priceETB) ? Number(data.priceETB) : 499);
  const yearlyPriceETB = valid(data.yearlyPriceETB) ? Number(data.yearlyPriceETB) : 6000;
  return { currency: "ETB", monthlyPriceETB, yearlyPriceETB, priceETB: monthlyPriceETB };
});
