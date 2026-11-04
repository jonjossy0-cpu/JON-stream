const crypto = require("crypto");
const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");

const DAY_MS = 86400000;
const TICKET_TTL_SECONDS = 4 * 60 * 60;
const emailKey = email => crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "154.58.202.18",
  "5.9.121.178",
  "23.237.104.106",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv",
  "rbmn-live.akamaized.net",
  "mediatailor.us-west-2.amazonaws.com",
  "streams2.sofast.tv"
]);

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload, secret) {
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

function validateSource(sourceUrl) {
  let source;
  try {
    source = new URL(sourceUrl);
  } catch (_) {
    return null;
  }
  if (!["http:", "https:"].includes(source.protocol) ||
      source.username || source.password || source.port ||
      !ALLOWED_HOSTS.has(source.hostname)) return null;
  return source;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.PREMIUM_PLAYBACK_TICKET_SECRET;
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: "Premium playback authorization is not configured", errorCode: "PREMIUM_TICKET_SECRET_MISSING", stage: "configuration" });
  }

  try {
    const user = await requireUser(req);
    if (!user.email_verified || !user.email) {
      return res.status(403).json({ error: "Verify your email before using Premium playback", errorCode: "EMAIL_NOT_VERIFIED", stage: "identity" });
    }

    const channelId = String(req.body && req.body.channelId || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channelId)) {
      return res.status(400).json({ error: "A valid channelId is required", errorCode: "INVALID_CHANNEL_ID", stage: "request" });
    }

    const { db, Timestamp, FieldValue } = getServices();

    // The TV/Radio Channel List is the sole authority for whether a channel exists
    // and is Premium. Never authorize a channel that is absent from that list.
    const publicSnap = await db.collection("jonStream").doc("appData").get();
    const publicData = publicSnap.exists ? publicSnap.data() || {} : {};
    const idFields = ["premiumChannelId", "playbackChannelId", "channelId", "id"];
    const sourceFields = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link"];
    let publicMatch = null;
    let publicGroup = "";
    for (const group of ["tv", "radio"]) {
      const items = Array.isArray(publicData[group]) ? publicData[group] : [];
      publicMatch = items.find(item => item &&
        String(item.accessTier || "").toLowerCase() === "premium" &&
        idFields.some(key => String(item[key] || "").trim() === channelId)
      ) || null;
      if (publicMatch) { publicGroup = group; break; }
    }
    if (!publicMatch) {
      return res.status(404).json({
        error: "Premium channel not found",
        errorCode: "PREMIUM_CHANNEL_NOT_IN_LIST",
        stage: "channel-list",
        requestedChannelId: channelId
      });
    }

    // Private catalog holds the server-trusted playback source, but it cannot add
    // channels that are not present in the public TV/Radio Channel List.
    const channelCollection = db.collection("premiumPlaybackChannels");
    let channelSnap = await channelCollection.doc(channelId).get();

    // Public channel IDs can differ from the canonical private catalog document ID.
    // Resolve only against explicit ID fields in the server-side catalog; never trust
    // a source URL or access tier supplied by the browser.
    if (!channelSnap.exists) {
      const catalogSnap = await channelCollection.get();
      const aliases = new Set(["channelId", "id", "premiumChannelId", "playbackChannelId", "publicChannelId"]);
      const match = catalogSnap.docs.find(doc => {
        const data = doc.data() || {};
        return Array.from(aliases).some(key => String(data[key] || "").trim() === channelId);
      });
      if (match) channelSnap = match;
    }

    // If the Channel List contains this Premium channel but the private source
    // record is missing, rebuild only that record from the matching list entry.
    if (!channelSnap.exists) {
      const rawSource = sourceFields.map(key => publicMatch[key]).find(value => typeof value === "string" && value.trim());
      const safeSource = validateSource(rawSource);
      if (safeSource) {
        const ids = [...new Set(idFields.map(key => String(publicMatch[key] || "").trim()).filter(id => /^[a-zA-Z0-9_-]{1,100}$/.test(id)))];
        const canonicalId = ids.includes(channelId) ? channelId : ids[0];
        if (canonicalId) {
          const targetRef = channelCollection.doc(canonicalId);
          await targetRef.set({
            channelId: ids[0],
            publicChannelId: ids[0],
            publicChannelIds: ids,
            name: String(publicMatch.name || publicMatch.title || "Premium channel").slice(0, 120),
            category: String(publicMatch.category || publicGroup).slice(0, 80),
            active: publicMatch.active === false ? false : true,
            accessTier: "premium",
            sourceUrl: safeSource.toString(),
            isHls: safeSource.pathname.toLowerCase().endsWith(".m3u8"),
            syncedFrom: "jonStream/appData",
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          channelSnap = await targetRef.get();
        }
      }
    }
    if (!channelSnap.exists) return res.status(404).json({ error: "Premium channel not found", errorCode: "PREMIUM_CHANNEL_NOT_FOUND", stage: "catalog", requestedChannelId: channelId });
    const channel = channelSnap.data() || {};
    if (channel.active !== true || String(channel.accessTier || "").toLowerCase() !== "premium") {
      return res.status(403).json({ error: "Premium channel is not enabled", errorCode: channel.active !== true ? "PREMIUM_CHANNEL_INACTIVE" : "PREMIUM_CHANNEL_TIER_MISMATCH", stage: "catalog", catalogChannelId: channelSnap.id });
    }
    const source = validateSource(channel.sourceUrl);
    if (!source) return res.status(503).json({ error: "Premium channel source is not configured safely", errorCode: "PREMIUM_SOURCE_INVALID_OR_HOST_BLOCKED", stage: "source", catalogChannelId: channelSnap.id });

    const now = Date.now();
    const [uidSnap, emailSnap, profileSnap] = await Promise.all([
      db.collection("premiumEntitlements").doc(user.uid).get(),
      db.collection("premiumEntitlementsByEmail").doc(emailKey(user.email)).get(),
      db.collection("subscriptionProfiles").doc(user.uid).get()
    ]);
    const entitlements = [uidSnap, emailSnap].filter(s => s.exists).map(s => s.data() || {});
    const activeEntitlement = entitlements.some(item => {
      if (item.active !== true) return false;
      if (item.unlimited === true) return true;
      return !!(item.expiresAt && typeof item.expiresAt.toMillis === "function" && item.expiresAt.toMillis() > now);
    });

    let profile = profileSnap.exists ? profileSnap.data() || {} : {};
    if (!activeEntitlement && !profile.trialStartedAt) {
      const trialStartedAt = Timestamp.fromMillis(now);
      const trialEndsAt = Timestamp.fromMillis(now + 3 * DAY_MS);
      await db.collection("subscriptionProfiles").doc(user.uid).set({
        trialStartedAt,
        trialEndsAt,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      profile = { ...profile, trialStartedAt, trialEndsAt };
    }
    const trialEndsAt = profile.trialEndsAt && typeof profile.trialEndsAt.toMillis === "function"
      ? profile.trialEndsAt.toMillis()
      : 0;
    const trialActive = trialEndsAt > now;
    if (!activeEntitlement && !trialActive) {
      return res.status(403).json({ error: "Premium subscription or active trial required", errorCode: "PREMIUM_ENTITLEMENT_REQUIRED", stage: "entitlement" });
    }

    // Always bind the ticket and gateway URL to the actual private catalog document ID.
    // The request may use a public alias, but api/hls.js resolves by document ID only.
    const canonicalChannelId = channelSnap.id;
    const expiresAt = Math.floor(now / 1000) + TICKET_TTL_SECONDS;
    const ticket = sign({
      v: 1,
      channelId: canonicalChannelId,
      uid: user.uid,
      host: source.hostname,
      rootPath: source.pathname.slice(0, source.pathname.lastIndexOf("/") + 1) || "/",
      exp: expiresAt,
      nonce: crypto.randomBytes(12).toString("base64url")
    }, secret);

    return res.status(200).json({
      channelId: canonicalChannelId,
      ticket,
      expiresAt,
      ttlSeconds: TICKET_TTL_SECONDS,
      isHls: channel.isHls === true || /\.m3u8$/i.test(source.pathname),
      // Gateway enforcement must be deployed before clients use this URL.
      playbackUrl: "/api/hls?channelId=" + encodeURIComponent(canonicalChannelId) + "&ticket=" + encodeURIComponent(ticket)
    });
  } catch (error) {
    // Keep server diagnostics precise without returning internal details to clients.
    console.error("Premium playback authorization failure", {
      errorCode: error && error.errorCode || "PREMIUM_AUTH_INTERNAL_ERROR",
      stage: error && error.stage || "server",
      status: Number(error && error.status) || 500,
      message: String(error && error.message || "Unknown error").slice(0, 300)
    });
    if (!error.errorCode) error.errorCode = "PREMIUM_AUTH_INTERNAL_ERROR";
    return sendError(res, error);
  }
};
