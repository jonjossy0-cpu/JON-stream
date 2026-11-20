const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");
const {
  TICKET_TTL_SECONDS, collectIds, findPublicPremiumChannel,
  findPrivateCatalogChannel, validateSource, emailKey, resolveAccess, signTicket
} = require("../_lib/premiumAccessV2");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const user = await requireUser(req);
    const channelId = String(req.body && req.body.channelId || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channelId)) {
      return res.status(400).json({ error: "A valid channelId is required", errorCode: "INVALID_CHANNEL_ID" });
    }
    const secret = process.env.PREMIUM_PLAYBACK_TICKET_SECRET || "";
    if (secret.length < 32) {
      return res.status(503).json({ error: "V2 playback signing secret is not configured", errorCode: "PREMIUM_V2_SECRET_MISSING" });
    }

    const { db } = getServices();
    const appDataSnap = await db.collection("jonStream").doc("appData").get();
    const appData = appDataSnap.exists ? appDataSnap.data() || {} : {};
    const publicMatch = findPublicPremiumChannel(appData, channelId);
    if (publicMatch.error) {
      return res.status(404).json({ error: "Premium channel is not present exactly once in the public channel list", errorCode: publicMatch.error });
    }
    const publicIds = collectIds(publicMatch.item);
    const catalogSnap = await db.collection("premiumPlaybackChannels").get();
    const catalogMatch = findPrivateCatalogChannel(catalogSnap.docs, publicIds);
    if (catalogMatch.error) {
      return res.status(404).json({ error: "A unique active private Premium catalog record was not found", errorCode: catalogMatch.error });
    }
    const source = validateSource(catalogMatch.data.sourceUrl);
    if (!source) {
      return res.status(503).json({ error: "The private catalog source is not on the approved host list", errorCode: "PREMIUM_V2_SOURCE_REJECTED" });
    }

    const [uidSnap, emailSnap, profileSnap] = await Promise.all([
      db.collection("premiumEntitlements").doc(user.uid).get(),
      db.collection("premiumEntitlementsByEmail").doc(emailKey(user.email)).get(),
      db.collection("subscriptionProfiles").doc(user.uid).get()
    ]);
    const access = resolveAccess({
      uidEntitlement: uidSnap.exists ? uidSnap.data() : null,
      emailEntitlement: emailSnap.exists ? emailSnap.data() : null,
      profile: profileSnap.exists ? profileSnap.data() : null,
      emailVerified: user.email_verified === true && !!user.email
    });
    if (!access.allowed) {
      return res.status(403).json({
        error: access.reason === "EMAIL_NOT_VERIFIED" ? "Email verification required" : "Premium subscription or existing trial required",
        errorCode: access.reason
      });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = nowSeconds + TICKET_TTL_SECONDS;
    const ticket = signTicket({
      v: 1,
      channelId: catalogMatch.id,
      uid: user.uid,
      host: source.hostname,
      rootPath: source.pathname.slice(0, source.pathname.lastIndexOf("/") + 1) || "/",
      exp: expiresAt,
      nonce: require("crypto").randomBytes(12).toString("base64url"),
      accessVersion: 2
    }, secret);
    return res.status(200).json({
      version: 2,
      channelId: catalogMatch.id,
      ticket,
      expiresAt,
      ttlSeconds: TICKET_TTL_SECONDS,
      isHls: catalogMatch.data.isHls === true || /\.m3u8$/i.test(source.pathname),
      playbackUrl: "/api/hls?channelId=" + encodeURIComponent(catalogMatch.id) + "&ticket=" + encodeURIComponent(ticket),
      readOnly: true
    });
  } catch (error) {
    return sendError(res, error);
  }
};
