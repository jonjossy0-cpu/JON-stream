const crypto = require("crypto");
const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");

const TICKET_TTL_SECONDS = 5 *  60;
const DAY_MS = 86400000;
const ID_FIELDS = ["premiumChannelId", "playbackChannelId", "channelId", "id", "publicChannelId", "publicChannelIds"];
const CATALOG_ID_FIELDS = ["channelId", "id", "premiumChannelId", "playbackChannelId", "publicChannelId", "publicChannelIds"];
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
function safeSource(value) {
  try {
    const url = new URL(value);
    // The active Premium catalog record is the trusted source of the host.
    const host = url.hostname.toLowerCase();
    const privateOrLocal = host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host === "0.0.0.0" || host === "127.0.0.1" ||
      /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      !url.port && host && !privateOrLocal ? url : null;
  } catch (_) { return null; }
}
function validId(value) { return /^[a-zA-Z0-9_-]{1,100}$/.test(String(value || "").trim()); }
function idsFrom(item) {
  return [...new Set(ID_FIELDS.flatMap(key => {
    const value = item && item[key];
    return (Array.isArray(value) ? value : [value]).map(x => String(x || "").trim()).filter(validId);
  }))];
}
function catalogMatches(doc, ids) {
  const data = doc.data() || {};
  const aliases = CATALOG_ID_FIELDS.flatMap(key => {
    const value = data[key];
    return (Array.isArray(value) ? value : [value]).map(x => String(x || "").trim());
  });
  return ids.includes(doc.id) || aliases.some(alias => ids.includes(alias));
}
function hasActiveEntitlement(records, now) {
  return records.some(item => item && item.active === true &&
    (item.unlimited === true || (item.expiresAt &&
      typeof item.expiresAt.toMillis === "function" && item.expiresAt.toMillis() > now)));
}
function hasActiveTrial(profile, now) {
  const end = profile && profile.trialEndsAt &&
    typeof profile.trialEndsAt.toMillis === "function" ? profile.trialEndsAt.toMillis() : 0;
  return end > now;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.PREMIUM_PLAYBACK_TICKET_SECRET || "";
  if (secret.length < 32) {
    return res.status(503).json({ error: "Premium V2 signing is not configured", code: "V2_SIGNING_NOT_CONFIGURED" });
  }

  try {
    const user = await requireUser(req);
    if (!user.email || user.email_verified !== true) {
      return res.status(403).json({ error: "Verified email required", code: "V2_EMAIL_NOT_VERIFIED" });
    }
    const requestedId = String(req.body && req.body.channelId || "").trim();
    if (!validId(requestedId)) {
      return res.status(400).json({ error: "A valid channelId is required", code: "V2_INVALID_CHANNEL_ID" });
    }

    const { db } = getServices();
    const [publicSnap, catalogSnap] = await Promise.all([
      db.collection("jonStream").doc("appData").get(),
      db.collection("premiumPlaybackChannels").get()
    ]);
    if (!publicSnap.exists) {
      return res.status(503).json({ error: "Channel list is unavailable", code: "V2_CHANNEL_LIST_UNAVAILABLE" });
    }

    const publicData = publicSnap.data() || {};
    let publicItem = null;
    let group = "";
    for (const key of ["tv", "radio"]) {
      const items = Array.isArray(publicData[key]) ? publicData[key] : [];
      const match = items.find(item => item &&
        String(item.accessTier || "").toLowerCase() === "premium" &&
        idsFrom(item).includes(requestedId));
      if (match) { publicItem = match; group = key; break; }
    }
    if (!publicItem) {
      return res.status(404).json({ error: "Premium channel is not in the public channel list", code: "V2_CHANNEL_NOT_LISTED" });
    }

    const publicIds = idsFrom(publicItem);
    const catalogDoc = catalogSnap.docs.find(doc => catalogMatches(doc, publicIds));
    if (!catalogDoc) {
      return res.status(404).json({ error: "Premium catalog record is missing", code: "V2_CATALOG_NOT_FOUND" });
    }
    const channel = catalogDoc.data() || {};
    if (channel.active !== true || String(channel.accessTier || "").toLowerCase() !== "premium") {
      return res.status(403).json({ error: "Premium catalog record is inactive or has the wrong tier", code: "V2_CHANNEL_DISABLED" });
    }
    const source = safeSource(channel.sourceUrl);
    if (!source) {
      return res.status(503).json({ error: "Premium source is not on the approved host list", code: "V2_SOURCE_NOT_ALLOWED" });
    }

    const now = Date.now();
    const [uidEntitlement, emailEntitlement, profile] = await Promise.all([
      db.collection("premiumEntitlements").doc(user.uid).get(),
      db.collection("premiumEntitlementsByEmail").doc(emailKey(user.email)).get(),
      db.collection("subscriptionProfiles").doc(user.uid).get()
    ]);
    const records = [uidEntitlement, emailEntitlement].filter(s => s.exists).map(s => s.data() || {});
    const activePaid = hasActiveEntitlement(records, now);
    const activeTrial = hasActiveTrial(profile.exists ? profile.data() : {}, now);
    if (!activePaid && !activeTrial) {
      return res.status(403).json({ error: "An active Premium entitlement or trial is required", code: "V2_ENTITLEMENT_REQUIRED" });
    }

    const expiresAt = Math.floor(now / 1000) + TICKET_TTL_SECONDS;
    const ticket = sign({
      v: 1,
      channelId: catalogDoc.id,
      uid: user.uid,
      host: source.hostname,
      rootPath: source.pathname.slice(0, source.pathname.lastIndexOf("/") + 1) || "/",
      exp: expiresAt,
      nonce: crypto.randomBytes(16).toString("base64url"),
      issuer: "jon-stream-premium-access-v2"
    }, secret);

    return res.status(200).json({
      system: "JON Stream Premium Access V2",
      channelId: catalogDoc.id,
      channelName: String(publicItem.name || publicItem.title || "Premium channel").slice(0, 120),
      category: group,
      ticket,
      expiresAt,
      ttlSeconds: TICKET_TTL_SECONDS,
      playbackUrl: "/api/hls?channelId=" + encodeURIComponent(catalogDoc.id) + "&ticket=" + encodeURIComponent(ticket)
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports._test = {
  idsFrom, catalogMatches, hasActiveEntitlement, hasActiveTrial, safeSource
};
