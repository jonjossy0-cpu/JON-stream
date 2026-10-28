const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "154.58.202.18",
  "5.9.121.178",
  "23.237.104.106",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"
]);
const ID_FIELDS = ["premiumChannelId", "playbackChannelId", "channelId", "id"];
const CATALOG_ALIAS_FIELDS = ["channelId", "id", "premiumChannelId", "playbackChannelId", "publicChannelId"];

function safeProjectId() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const account = JSON.parse(raw);
    return typeof account.project_id === "string" ? account.project_id : null;
  } catch (_) {
    return null;
  }
}

function sourceIsAllowed(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username && !url.password && !url.port &&
      ALLOWED_HOSTS.has(url.hostname);
  } catch (_) {
    return false;
  }
}

function publicChannelSummary(item, catalog) {
  const publicIds = [...new Set(ID_FIELDS
    .map(key => String(item && item[key] || "").trim())
    .filter(id => /^[a-zA-Z0-9_-]{1,100}$/.test(id)))];
  const match = catalog.find(doc =>
    publicIds.some(publicId => doc.id === publicId ||
      CATALOG_ALIAS_FIELDS.some(key => String(doc.data[key] || "").trim() === publicId))
  ) || null;
  const data = match ? match.data : null;
  return {
    name: String(item && (item.name || item.title) || "Unnamed channel"),
    publicId: publicIds[0] || null,
    publicIds,
    matchedPublicId: match ? publicIds.find(publicId =>
      docIdMatchesCatalog(match, publicId)
    ) || null : null,
    accessTier: String(item && item.accessTier || "free").toLowerCase(),
    catalogMatch: !!match,
    catalogDocumentId: match ? match.id : null,
    active: data ? data.active === true : null,
    catalogAccessTier: data ? String(data.accessTier || "").toLowerCase() : null,
    sourceConfiguredAndAllowed: data ? sourceIsAllowed(data.sourceUrl) : null
  };
}

function docIdMatchesCatalog(doc, publicId) {
  return doc.id === publicId || CATALOG_ALIAS_FIELDS.some(key =>
    String(doc.data[key] || "").trim() === publicId
  );
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

    const { db } = getServices();
    const [catalogSnap, publicSnap] = await Promise.all([
      db.collection("premiumPlaybackChannels").get(),
      db.collection("jonStream").doc("appData").get()
    ]);
    const catalog = catalogSnap.docs.map(doc => ({ id: doc.id, data: doc.data() || {} }));
    const publicData = publicSnap.exists ? publicSnap.data() || {} : {};
    const summarize = key => Array.isArray(publicData[key])
      ? publicData[key]
          .filter(item => item && String(item.accessTier || "").toLowerCase() === "premium")
          .map(item => publicChannelSummary(item, catalog))
      : [];

    const catalogSummary = catalog.map(({ id, data }) => ({
      documentId: id,
      aliases: CATALOG_ALIAS_FIELDS
        .map(key => String(data[key] || "").trim())
        .filter(Boolean),
      active: data.active === true,
      accessTier: String(data.accessTier || "").toLowerCase(),
      sourceConfiguredAndAllowed: sourceIsAllowed(data.sourceUrl)
    }));

    return res.status(200).json({
      diagnostic: "premium-playback-catalog",
      firebaseProjectId: safeProjectId(),
      firebaseServiceAccountConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      ticketSecretConfigured: !!(process.env.PREMIUM_PLAYBACK_TICKET_SECRET &&
        process.env.PREMIUM_PLAYBACK_TICKET_SECRET.length >= 32),
      publicAppDataFound: publicSnap.exists,
      publicPremiumTV: summarize("tv"),
      publicPremiumRadio: summarize("radio"),
      privateCatalogCount: catalog.length,
      privateCatalog: catalogSummary
    });
  } catch (error) {
    return sendError(res, error);
  }
};
