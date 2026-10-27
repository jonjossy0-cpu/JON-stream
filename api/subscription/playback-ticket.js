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
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"
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
    return res.status(503).json({ error: "Premium playback authorization is not configured" });
  }

  try {
    const user = await requireUser(req);
    if (!user.email_verified || !user.email) {
      return res.status(403).json({ error: "Verify your email before using Premium playback" });
    }

    const channelId = String(req.body && req.body.channelId || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(channelId)) {
      return res.status(400).json({ error: "A valid channelId is required" });
    }

    const { db, Timestamp, FieldValue } = getServices();
    // The source is read only from a server-side collection. Never accept a URL or
    // accessTier from the browser as proof of entitlement or as a playback source.
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
    if (!channelSnap.exists) return res.status(404).json({ error: "Premium channel not found" });
    const channel = channelSnap.data() || {};
    if (channel.active !== true || String(channel.accessTier || "").toLowerCase() !== "premium") {
      return res.status(403).json({ error: "Premium channel is not enabled" });
    }
    const source = validateSource(channel.sourceUrl);
    if (!source) return res.status(503).json({ error: "Premium channel source is not configured safely" });

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
      return res.status(403).json({ error: "Premium subscription or active trial required" });
    }

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
      // Use the canonical private catalog ID because /api/hls resolves that document directly.
      playbackUrl: "/api/hls?channelId=" + encodeURIComponent(canonicalChannelId) + "&ticket=" + encodeURIComponent(ticket)
    });
  } catch (error) {
    return sendError(res, error);
  }
};
