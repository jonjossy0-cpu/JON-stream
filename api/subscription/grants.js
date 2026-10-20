const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireUser(req);
    requireAdmin(user);
    const { db } = getServices();
    const snap = await db.collection("premiumEntitlementsByEmail").limit(500).get();
    const grants = snap.docs.map(doc => {
      const data = doc.data();
      const expiresAt = data.expiresAt && typeof data.expiresAt.toDate === "function" ? data.expiresAt.toDate().toISOString() : null;
      const active = data.active === true && (data.unlimited === true || (expiresAt && Date.parse(expiresAt) > Date.now()));
      return {
        email: data.email || "",
        active,
        unlimited: data.unlimited === true,
        expiresAt,
        source: data.source || "unknown",
        updatedAt: data.updatedAt && typeof data.updatedAt.toDate === "function" ? data.updatedAt.toDate().toISOString() : null
      };
    });
    grants.sort((a, b) => String(a.email).localeCompare(String(b.email)));
    return res.status(200).json({ grants, limit: 500 });
  } catch (error) {
    return sendError(res, error);
  }
};