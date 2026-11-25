const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

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

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const adminUser = await requireUser(req);
    requireAdmin(adminUser);

    const force = String(req.query && req.query.refresh || "") === "1";
    if (!force && cachedSummary && Date.now() - cachedAt < CACHE_MS) {
      return res.status(200).json({ ...cachedSummary, cached: true, cacheAgeSeconds: Math.floor((Date.now() - cachedAt) / 1000) });
    }

    const { auth, db, Timestamp } = getServices();
    const now = Date.now();
    const [totalUsers, activeSessions, activeTrials, premiumSnap] = await Promise.all([
      countAuthUsers(auth),
      db.collection("activeUserSessions")
        .where("lastSeenAt", ">", Timestamp.fromMillis(now - ACTIVE_WINDOW_MS))
        .count().get(),
      db.collection("subscriptionProfiles")
        .where("trialEndsAt", ">", Timestamp.fromMillis(now))
        .count().get(),
      db.collection("premiumEntitlements").where("active", "==", true).get()
    ]);

    const premiumSubscribers = premiumSnap.docs.filter(doc => {
      const data = doc.data() || {};
      if (data.unlimited === true) return true;
      return !!(data.expiresAt && typeof data.expiresAt.toMillis === "function" && data.expiresAt.toMillis() > now);
    }).length;

    cachedSummary = {
      totalUsers,
      activeUsers: activeSessions.data().count,
      activeWindowMinutes: 5,
      activeTrials: activeTrials.data().count,
      premiumSubscribers,
      generatedAt: new Date(now).toISOString()
    };
    cachedAt = now;
    return res.status(200).json({ ...cachedSummary, cached: false, cacheAgeSeconds: 0 });
  } catch (error) {
    return sendError(res, error);
  }
};
