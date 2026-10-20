const crypto = require("crypto");
const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

const allowedDurations = new Set([7, 30, 90, 365, "unlimited"]);
const emailKey = email => crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const adminUser = await requireUser(req);
    requireAdmin(adminUser);
    const { db, auth, Timestamp, FieldValue } = getServices();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }
    if (!["grant", "extend", "revoke"].includes(action)) {
      return res.status(400).json({ error: "Action must be grant, extend, or revoke" });
    }

    let targetUser = null;
    try { targetUser = await auth.getUserByEmail(email); }
    catch (error) { if (error.code !== "auth/user-not-found") throw error; }

    const emailRef = db.collection("premiumEntitlementsByEmail").doc(emailKey(email));
    const uidRef = targetUser ? db.collection("premiumEntitlements").doc(targetUser.uid) : null;
    const refs = [emailRef, ...(uidRef ? [uidRef] : [])];

    if (action === "revoke") {
      const batch = db.batch();
      refs.forEach(ref => batch.set(ref, {
        active: false, unlimited: false, source: "admin_grant",
        revokedAt: FieldValue.serverTimestamp(), revokedBy: adminUser.uid,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true }));
      await batch.commit();
      return res.status(200).json({ ok: true, action, email, status: "revoked" });
    }

    if (!allowedDurations.has(body.duration)) {
      return res.status(400).json({ error: "Duration must be 7, 30, 90, 365, or unlimited" });
    }

    // Reconcile both UID and email records so extending access cannot shorten a longer grant.
    const snapshots = await Promise.all(refs.map(ref => ref.get()));
    const existingRecords = snapshots.map(snap => snap.exists ? snap.data() : {});
    const existingEmail = existingRecords[0] || {};
    const now = Date.now();
    const oldExpiry = existingRecords.reduce((latest, record) => {
      const expiry = record.expiresAt && typeof record.expiresAt.toMillis === "function"
        ? record.expiresAt.toMillis()
        : 0;
      return Math.max(latest, expiry);
    }, now);
    const startFrom = action === "extend" ? oldExpiry : now;
    const unlimited = body.duration === "unlimited";
    const expiresAt = unlimited ? null : Timestamp.fromMillis(startFrom + Number(body.duration) * 86400000);
    const grant = {
      active: true,
      unlimited,
      ...(expiresAt ? { expiresAt } : { expiresAt: FieldValue.delete() }),
      email,
      source: "admin_grant",
      grantedBy: adminUser.uid,
      grantedAt: existingEmail.grantedAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      revokedAt: FieldValue.delete()
    };
    const batch = db.batch();
    refs.forEach(ref => batch.set(ref, grant, { merge: true }));
    await batch.commit();
    return res.status(200).json({
      ok: true, action, email, status: "premium",
      duration: unlimited ? "unlimited" : Number(body.duration),
      expiresAt: expiresAt ? expiresAt.toDate().toISOString() : null,
      accountFound: !!targetUser
    });
  } catch (error) {
    return sendError(res, error);
  }
};
