const { getServices, requireUser, requireAdmin, sendError, setCors } = require("./_lib/firebaseAdmin");

let cachedSummary = null;
let cachedAt = 0;
const CACHE_MS = 120000;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

async function countAuthUsers(auth) {
  let pageToken;
  let total = 0;
  let pages = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    total += page.users.length;
    pageToken = page.pageToken;
    pages += 1;
    if (pages > 1000) throw new Error("User count exceeded the safe pagination limit");
  } while (pageToken);
  return total;
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
    const mode = String(req.query && req.query.mode || "");

    if (mode === "summary" && req.method === "GET") {
      const force = String(req.query && req.query.refresh || "") === "1";
      if (!force && cachedSummary && Date.now() - cachedAt < CACHE_MS && !cachedSummary.metricErrors) {
        return res.status(200).json({ ...cachedSummary, cached: true, cacheAgeSeconds: Math.floor((Date.now() - cachedAt) / 1000) });
      }
      const { auth, db, Timestamp } = getServices();
      const now = Date.now();
      const checks = await Promise.allSettled([
        countAuthUsers(auth),
        db.collection("activeUserSessions").where("lastSeenAt", ">", Timestamp.fromMillis(now - ACTIVE_WINDOW_MS)).count().get(),
        db.collection("subscriptionProfiles").where("trialEndsAt", ">", Timestamp.fromMillis(now)).count().get(),
        db.collection("premiumEntitlements").where("active", "==", true).get()
      ]);
      const metricErrors = {};
      const value = (index, key, convert) => {
        const result = checks[index];
        if (result.status === "rejected") {
          metricErrors[key] = String(result.reason && (result.reason.code || result.reason.message) || "Query failed");
          return null;
        }
        try { return convert(result.value); }
        catch (error) { metricErrors[key] = String(error && error.message || "Invalid result"); return null; }
      };
      const totalUsers = value(0, "totalUsers", result => result);
      const activeUsers = value(1, "activeUsers", result => result.data().count);
      const activeTrials = value(2, "activeTrials", result => result.data().count);
      const premiumSubscribers = value(3, "premiumSubscribers", snap => snap.docs.filter(doc => {
        const data = doc.data() || {};
        if (data.unlimited === true) return true;
        return !!(data.expiresAt && typeof data.expiresAt.toMillis === "function" && data.expiresAt.toMillis() > now);
      }).length);
      const summary = {
        totalUsers, activeUsers, activeWindowMinutes: 5, activeTrials, premiumSubscribers,
        generatedAt: new Date(now).toISOString(),
        ...(Object.keys(metricErrors).length ? { metricErrors } : {})
      };
      if (!summary.metricErrors) { cachedSummary = summary; cachedAt = now; }
      return res.status(200).json({ ...summary, cached: false, cacheAgeSeconds: 0 });
    }

    if (mode === "users" && req.method === "GET") {
      const auth = getServices().auth;
      const email = String(req.query && req.query.email || "").trim().toLowerCase();
      if (email) {
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
          return res.status(400).json({ error: "Enter a valid email address" });
        }
        try {
          const user = await auth.getUserByEmail(email);
          return res.status(200).json({ user: safeUser(user) });
        } catch (error) {
          if (error && error.code === "auth/user-not-found") {
            return res.status(404).json({ error: "No account found for that email" });
          }
          throw error;
        }
      }
      const requestedLimit = Number(req.query && req.query.limit || 50);
      const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 50));
      const pageToken = String(req.query && req.query.pageToken || "").trim() || undefined;
      const page = await auth.listUsers(limit, pageToken);
      return res.status(200).json({
        users: page.users.map(safeUser),
        nextPageToken: page.pageToken || null,
        pageSize: page.users.length
      });
    }

    if (mode === "users" && req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const email = String(body.email || "").trim().toLowerCase();
      const action = String(body.action || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
      if (!["block", "unblock"].includes(action)) return res.status(400).json({ error: "Action must be block or unblock" });
      const { auth } = getServices();
      const target = await auth.getUserByEmail(email);
      const adminUids = new Set(String(process.env.JON_ADMIN_UIDS || "").split(",").map(value => value.trim()).filter(Boolean));
      if (adminUids.has(target.uid)) return res.status(403).json({ error: "Admin accounts are protected from user blocking" });
      const updated = await auth.updateUser(target.uid, { disabled: action === "block" });
      if (action === "block") await auth.revokeRefreshTokens(target.uid);
      return res.status(200).json({
        ok: true, action, user: safeUser(updated),
        message: action === "block"
          ? "Account blocked and refresh tokens revoked. Existing sessions may take effect after token refresh."
          : "Account unblocked. The user may need to sign in again."
      });
    }

    return res.status(400).json({ error: "Use mode=summary or mode=users" });
  } catch (error) {
    if (error && error.code === "auth/user-not-found") return res.status(404).json({ error: "No account found for that email" });
    return sendError(res, error);
  }
};
