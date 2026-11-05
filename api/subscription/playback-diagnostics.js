const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106","45.166.93.156","stitcher-ipv4.pluto.tv","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv","appletree-mytimeuk-rakuten.amagi.tv","63.141.239.226","stream8.cinerama.uz","38.252.238.18","45.162.64.114","45.177.114.115","168.197.104.22","170.83.16.50","cdn-5.nxplay.com.br","stream.telfazalive.com","edge.novastream.et","bozztv.com","rpn.bozztv.com","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"]);
const ALLOWED_ENDPOINTS = new Set(["88.212.15.19:80","88.212.15.19:443","154.58.202.18:80","154.58.202.18:443","5.9.121.178:80","5.9.121.178:443","23.237.104.106:80","23.237.104.106:443","45.166.93.156:80","45.166.93.156:443","45.166.93.156:9999","stitcher-ipv4.pluto.tv:443","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv:443","appletree-mytimeuk-rakuten.amagi.tv:443","63.141.239.226:81","stream8.cinerama.uz:443","38.252.238.18:8000","45.162.64.114:80","45.177.114.115:80","168.197.104.22:80","170.83.16.50:80","cdn-5.nxplay.com.br:443","stream.telfazalive.com:443","edge.novastream.et:443","bozztv.com:443","rpn.bozztv.com:443","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv:443"]);
function endpointKey(url) { return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`; }
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

const SOURCE_FIELDS = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link", "source", "primaryStream", "stream"];

function inspectSource(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { configured: false, reason: "SOURCE_FIELD_MISSING" };
  }
  try {
    const url = new URL(value.trim());
    const schemeAllowed = ["http:", "https:"].includes(url.protocol);
    const credentialsAbsent = !url.username && !url.password;
    const hostAllowed = ALLOWED_HOSTS.has(url.hostname);
    const endpoint = endpointKey(url);
    const endpointAllowed = ALLOWED_ENDPOINTS.has(endpoint);
    let reason = "OK";
    if (!schemeAllowed) reason = "SCHEME_NOT_ALLOWED";
    else if (!credentialsAbsent) reason = "URL_CREDENTIALS_NOT_ALLOWED";
    else if (!hostAllowed) reason = "HOST_NOT_ALLOWLISTED";
    else if (!endpointAllowed) reason = "HOST_PORT_NOT_ALLOWLISTED";
    return {
      configured: true,
      scheme: url.protocol.replace(":", ""),
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? "443" : "80"),
      schemeAllowed,
      credentialsAbsent,
      hostAllowed,
      endpointAllowed,
      allowed: reason === "OK",
      reason
    };
  } catch (_) {
    return { configured: true, allowed: false, reason: "SOURCE_NOT_ABSOLUTE_URL" };
  }
}

function inspectSourceFields(item) {
  const fields = {};
  for (const key of SOURCE_FIELDS) {
    if (item && Object.prototype.hasOwnProperty.call(item, key)) {
      const value = item[key];
      fields[key] = typeof value === "string"
        ? { present: true, nonEmpty: !!value.trim(), ...inspectSource(value) }
        : { present: true, valueType: Array.isArray(value) ? "array" : typeof value, reason: "SOURCE_FIELD_NOT_STRING" };
    }
  }
  const selected = SOURCE_FIELDS.find(key => typeof (item && item[key]) === "string" && item[key].trim());
  return { fields, selectedField: selected || null, selected: selected ? inspectSource(item[selected]) : { configured: false, reason: "NO_SUPPORTED_SOURCE_FIELD" } };
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
    sourceConfiguredAndAllowed: data ? inspectSource(data.sourceUrl).allowed === true : null,
    publicSourceInspection: inspectSourceFields(item),
    catalogSourceInspection: data ? inspectSource(data.sourceUrl) : null
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
      sourceConfiguredAndAllowed: inspectSource(data.sourceUrl).allowed === true,
      sourceInspection: inspectSource(data.sourceUrl)
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
