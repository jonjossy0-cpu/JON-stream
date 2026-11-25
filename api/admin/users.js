const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeUser(user) {
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    disabled: user.disabled === true,
    emailVerified: user.emailVerified === true,
    createdAt: user.metadata && user.metadata.creationTime || null,
    lastSignInAt: user.metadata && user.metadata.lastSignInTime || null
  };
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  try {
    const adminUser = await requireUser(req);
    requireAdmin(adminUser);
    const { auth } = getServices();

    if (req.method === "GET") {
      const email = normalizeEmail(req.query && req.query.email);
      if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Enter a valid email address" });
      }
      const user = await auth.getUserByEmail(email);
      return res.status(200).json({ user: safeUser(user) });
    }

    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const email = normalizeEmail(body.email);
      const action = String(body.action || "").trim().toLowerCase();
      if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Enter a valid email address" });
      }
      if (!["block", "unblock"].includes(action)) {
        return res.status(400).json({ error: "Action must be block or unblock" });
      }

      const target = await auth.getUserByEmail(email);
      const adminUids = new Set(String(process.env.JON_ADMIN_UIDS || "").split(",").map(value => value.trim()).filter(Boolean));
      if (adminUids.has(target.uid)) {
        return res.status(403).json({ error: "Admin accounts are protected from user blocking" });
      }

      const updated = await auth.updateUser(target.uid, { disabled: action === "block" });
      if (action === "block") await auth.revokeRefreshTokens(target.uid);
      return res.status(200).json({
        ok: true,
        action,
        user: safeUser(updated),
        message: action === "block"
          ? "Account blocked and refresh tokens revoked. Existing sessions may take effect after token refresh."
          : "Account unblocked. The user may need to sign in again."
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error && error.code === "auth/user-not-found") return res.status(404).json({ error: "No account found for that email" });
    return sendError(res, error);
  }
};
