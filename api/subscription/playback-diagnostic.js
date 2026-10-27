const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

const ALIASES = ["channelId", "id", "premiumChannelId", "playbackChannelId", "publicChannelId"];
const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "154.58.202.18",
  "5.9.121.178",
  "23.237.104.106",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"
]);

function sourceIsValid(value) {
  try {
    const source = new URL(value);
    return ["http:", "https:"].includes(source.protocol) &&
      !source.username && !source.password && !source.port &&
      ALLOWED_HOSTS.has(source.hostname);
  } catch (_) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);
    requireAdmin(user);

    const requestedId = String(req.query && req.query.channelId || "").trim();
    if (requestedId && !/^[a-zA-Z0-9_-]{1,100}$/.test(requestedId)) {
      return res.status(400).json({ error: "A valid channelId is required" });
    }

    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
    let firebaseProjectId = null;
    try {
      firebaseProjectId = JSON.parse(rawServiceAccount).project_id || null;
    } catch (_) {}

    const { db } = getServices();
    const collection = db.collection("premiumPlaybackChannels");
    const catalog = await collection.get();
    const matches = catalog.docs.filter(doc => {
      if (requestedId && doc.id === requestedId) return true;
      if (!requestedId) return false;
      const data = doc.data() || {};
      return ALIASES.some(key => String(data[key] || "").trim() === requestedId);
    });

    const matchDetails = matches.map(doc => {
      const data = doc.data() || {};
      return {
        documentId: doc.id,
        matchedByDocumentId: doc.id === requestedId,
        matchedAliasFields: ALIASES.filter(key => String(data[key] || "").trim() === requestedId),
        active: data.active === true,
        accessTier: String(data.accessTier || "").toLowerCase() || null,
        sourceConfigured: typeof data.sourceUrl === "string" && data.sourceUrl.trim().length > 0,
        sourceHostAllowed: sourceIsValid(data.sourceUrl),
        isHls: data.isHls === true
      };
    });

    return res.status(200).json({
      diagnostic: "premium-playback-catalog",
      firebaseProjectId,
      serviceAccountConfigured: !!rawServiceAccount,
      ticketSecretConfigured: typeof process.env.PREMIUM_PLAYBACK_TICKET_SECRET === "string" &&
        process.env.PREMIUM_PLAYBACK_TICKET_SECRET.length >= 32,
      catalogDocumentCount: catalog.size,
      requestedChannelId: requestedId || null,
      matchingRecordCount: matches.length,
      matches: matchDetails
    });
  } catch (error) {
    return sendError(res, error);
  }
};
