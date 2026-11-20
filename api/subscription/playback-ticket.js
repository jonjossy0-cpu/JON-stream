const crypto = require("crypto");
const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");

const DAY_MS = 86400000;
const TICKET_TTL_SECONDS = 4 * 60 * 60;
const emailKey = email => crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106","45.166.93.156","stitcher-ipv4.pluto.tv","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv","appletree-mytimeuk-rakuten.amagi.tv","63.141.239.226","stream8.cinerama.uz","38.252.238.18","45.162.64.114","45.177.114.115","168.197.104.22","170.83.16.50","cdn-5.nxplay.com.br","stream.telfazalive.com","edge.novastream.et","bozztv.com","rpn.bozztv.com","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"]);
const ALLOWED_ENDPOINTS = new Set(["88.212.15.19:80","88.212.15.19:443","154.58.202.18:80","154.58.202.18:443","5.9.121.178:80","5.9.121.178:443","23.237.104.106:80","23.237.104.106:443","45.166.93.156:80","45.166.93.156:443","45.166.93.156:9999","stitcher-ipv4.pluto.tv:443","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv:443","appletree-mytimeuk-rakuten.amagi.tv:443","63.141.239.226:81","stream8.cinerama.uz:443","38.252.238.18:8000","45.162.64.114:80","45.177.114.115:80","168.197.104.22:80","170.83.16.50:80","cdn-5.nxplay.com.br:443","stream.telfazalive.com:443","edge.novastream.et:443","bozztv.com:443","rpn.bozztv.com:443","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv:443"]);
function endpointKey(url) { return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`; }

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
      source.username || source.password || !ALLOWED_HOSTS.has(source.hostname) ||
      !ALLOWED_ENDPOINTS.has(endpointKey(source))) return null;
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
    const sourceFields = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link", "source", "primaryStream", "stream"];
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

    // Prefer the private playback catalog when provisioned. If a channel has not
    // yet been copied there, use the server-read TV/Radio appData record instead.
    // This keeps the main channel list authoritative and avoids hiding channels or
    // failing playback solely because a duplicate private catalog document is absent.
    const channelCollection = db.collection("premiumPlaybackChannels");
    let channelSnap = await channelCollection.doc(channelId).get();
    if (!channelSnap.exists) {
      const catalogSnap = await channelCollection.get();
      const aliases = new Set(["channelId", "id", "premiumChannelId", "playbackChannelId", "publicChannelId"]);
      const match = catalogSnap.docs.find(doc => {
        const data = doc.data() || {};
        return Array.from(aliases).some(key => String(data[key] || "").trim() === channelId);
      });
      if (match) channelSnap = match;
    }

    let channel;
    let canonicalChannelId;
    let source;
    if (channelSnap.exists) {
      channel = channelSnap.data() || {};
      if (channel.active !== true || String(channel.accessTier || "").toLowerCase() !== "premium") {
        return res.status(403).json({ error: "Premium channel is not enabled", errorCode: channel.active !== true ? "PREMIUM_CHANNEL_INACTIVE" : "PREMIUM_CHANNEL_TIER_MISMATCH", stage: "catalog", catalogChannelId: channelSnap.id });
      }
      source = validateSource(channel.sourceUrl);
      // A stale/incomplete private catalog row must not mask a valid source
      // already present on the authoritative TV/Radio appData channel record.
      if (!source) {
        const publicSourceValue = sourceFields
          .map(key => publicMatch[key])
          .find(value => typeof value === "string" && value.trim());
        source = validateSource(publicSourceValue);
      }
      canonicalChannelId = channelSnap.id;
    } else {
      // publicMatch came directly from Firestore appData on the server, not from
      // browser input. Keep its source URL private; only a signed ticket is returned.
      channel = publicMatch;
      if (channel.active === false || channel.enabled === false) {
        return res.status(403).json({ error: "Premium channel is not enabled", errorCode: "PREMIUM_CHANNEL_INACTIVE", stage: "channel-list" });
      }
      const sourceValue = sourceFields.map(key => channel[key]).find(value => typeof value === "string" && value.trim());
      source = validateSource(sourceValue);
      canonicalChannelId = channelId;
    }
    if (!source) return res.status(503).json({ error: "Premium channel source is not configured safely", errorCode: "PREMIUM_SOURCE_INVALID_OR_HOST_BLOCKED", stage: "source", channelId: canonicalChannelId });

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

    const expiresAt = Math.floor(now / 1000) + TICKET_TTL_SECONDS;
    const ticket = sign({
      v: 1,
      channelId: canonicalChannelId,
      uid: user.uid,
      emailKey: emailKey(user.email),
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
