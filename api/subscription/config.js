const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  try {
    const { db, FieldValue } = getServices();
    const ref = db.collection("subscriptionConfig").doc("public");
    if (req.method === "GET") {
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : {};
      const priceETB = Number(data.priceETB);
      return res.status(200).json({ currency: "ETB", priceETB: Number.isFinite(priceETB) && priceETB >= 0 ? priceETB : null });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const user = await requireUser(req);
    requireAdmin(user);
    const value = req.body && req.body.priceETB;
    const priceETB = Number(value);
    if (value === "" || value == null || !Number.isFinite(priceETB) || priceETB < 0 || priceETB > 100000000) {
      return res.status(400).json({ error: "priceETB must be a valid non-negative ETB amount" });
    }
    await ref.set({ currency: "ETB", priceETB, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }, { merge: true });
    return res.status(200).json({ ok: true, currency: "ETB", priceETB });
  } catch (error) {
    return sendError(res, error);
  }
};