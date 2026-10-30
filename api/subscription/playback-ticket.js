const crypto = require("crypto");
const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");

const DAY_MS = 86400000;
const TICKET_TTL_SECONDS = 4 * 60 * 60;
const ID_FIELDS = ["premiumChannelId", "playbackChannelId", "channelId", "id", "publicChannelId", "publicChannelIds"];
const SOURCE_FIELDS = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link"];
const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "154.58.202.18",
  "5.9.121.178",
  "23.237.104.106",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"
]);

function b64url(value) { return Buffer.from(value).toString("base64url"); }
function sign(payload, secret) {
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}
function emailKey(email) {
  return crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
}
function idsFrom(item) {
  return [...new Set(ID_FIELDS.flatMap(key => {
    const value = item && item[key];
    return (Array.isArray(value) ? value : [value]).map(x => String(x || "").trim()).filter(x => /^[a-zA-Z0-9_-]{1,100}$/.test(x));
  }))];
}
function sourceFrom(item) {
  for (const field of SOURCE_FIELDS) {
    const value = item && item[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
function validateSource(value) {
  try {
    const source = new URL(value);
    if (!["http:", "https:"].includes(source.protocol) || source.username || source.password ||
        source.port || !ALLOWED_HOSTS.has(source.hostname.toLowerCase())) return null;
    return source;
  } catch (_) { return null; }
}
function activeEntitlement(records, now) {
  return records.some(item => item && item.active === true &&
    (item.unlimited === true || (item.expiresAt && typeof item.expiresAt.toMillis === "function" && item.expiresAt.toMillis() > now)));
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const secret = process.env.PREMIUM_PLAYBACK_TICKET_SECRET || "";
  if (secret.length < 32) return res.status(503).json({ error: "Premium playback service is not configured", code: "PREMIUM_SERVICE_NOT_CONFIGURED" });

  try {
    const user = await requireUser(req);
    if (!user.email || user.email_verified !== true) {
      return res.status(403).json({ error: "Verified email required", code: "EMAIL_NOT_VERIFIED" });
    }
    const requestedId = String(req.body && req.body.channelId || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(requestedId)) {
      return res.status(400).json({ error: "A valid channel ID is required", code: "INVALID_CHANNEL_ID" });
    }

    const { db } = getServices();
    const publicSnap = await db.collection("jonStream").doc("appData").get();
    if (!publicSnap.exists) return res.status(503).json({ error: "Channel list is unavailable", code: "CHANNEL_LIST_UNAVAILABLE" });
    const publicData = publicSnap.data() || {};
    let publicItem = null;
    let category = "";
    for (const group of ["tv", "radio"]) {
      const items = Array.isArray(publicData[group]) ? publicData[group] : [];
      const match = items.find(item => item &&
        String(item.accessTier || "free").toLowerCase() === "premium" &&
        item.active !== false && idsFrom(item).includes(requestedId));
      if (match) { publicItem = match; category = group; break; }
    }
    if (!publicItem) return res.status(404).json({ error: "Premium channel is not in the TV/Radio list", code: "PREMIUM_CHANNEL_NOT_LISTED" });

    const source = validateSource(sourceFrom(publicItem));
    if (!source) return res.status(503).json({ error: "This Premium channel has no supported stream source", code: "PREMIUM_SOURCE_UNAVAILABLE" });

    const now = Date.now();
    const [uidSnap, emailSnap, profileSnap] = await Promise.all([
      db.collection("premiumEntitlements").doc(user.uid).get(),
      db.collection("premiumEntitlementsByEmail").doc(emailKey(user.email)).get(),
      db.collection("subscriptionProfiles").doc(user.uid).get()
    ]);
    const entitlements = [uidSnap, emailSnap].filter(s => s.exists).map(s => s.data() || {});
    const paid = activeEntitlement(entitlements, now);
    const profile = profileSnap.exists ? profileSnap.data() || {} : {};
    const trialEnd = profile.trialEndsAt && typeof profile.trialEndsAt.toMillis === "function" ? profile.trialEndsAt.toMillis() : 0;
    if (!paid && trialEnd <= now) return res.status(403).json({ error: "An active Premium subscription or trial is required", code: "PREMIUM_ENTITLEMENT_REQUIRED" });

    const expiresAt = Math.floor(now / 1000) + TICKET_TTL_SECONDS;
    const ticket = sign({
      v: 1,
      channelId: requestedId,
      uid: user.uid,
      sourceUrl: source.toString(),
      host: source.hostname.toLowerCase(),
      rootPath: source.pathname.slice(0, source.pathname.lastIndexOf("/") + 1) || "/",
      exp: expiresAt,
      nonce: crypto.randomBytes(12).toString("base64url")
    }, secret);
    return res.status(200).json({
      system: "JON Stream Premium Direct Access",
      channelId: requestedId,
      channelName: String(publicItem.name || publicItem.title || "Premium channel").slice(0, 120),
      category,
      ticket,
      expiresAt,
      ttlSeconds: TICKET_TTL_SECONDS,
      isHls: /\.m3u8$/i.test(source.pathname),
      playbackUrl: "/api/hls?channelId=" + encodeURIComponent(requestedId) + "&ticket=" + encodeURIComponent(ticket)
    });
  } catch (error) {
    console.error("Premium direct access error", { code: error && error.code || "PREMIUM_ACCESS_INTERNAL", message: String(error && error.message || "").slice(0, 200) });
    return sendError(res, error);
  }
};

module.exports._test = { idsFrom, sourceFrom, validateSource, activeEntitlement };
