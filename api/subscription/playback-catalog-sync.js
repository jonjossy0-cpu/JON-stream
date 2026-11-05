const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

const ID_FIELDS = ["premiumChannelId", "playbackChannelId", "channelId", "id"];
const SOURCE_FIELDS = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link", "source", "primaryStream", "stream"];
const ALIASES = ["channelId", "id", "premiumChannelId", "playbackChannelId", "publicChannelId"];
const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106","45.166.93.156","stitcher-ipv4.pluto.tv","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv","appletree-mytimeuk-rakuten.amagi.tv","63.141.239.226","stream8.cinerama.uz","38.252.238.18","45.162.64.114","45.177.114.115","168.197.104.22","170.83.16.50","cdn-5.nxplay.com.br","stream.telfazalive.com","edge.novastream.et","bozztv.com","rpn.bozztv.com","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"]);
const ALLOWED_ENDPOINTS = new Set(["88.212.15.19:80","88.212.15.19:443","154.58.202.18:80","154.58.202.18:443","5.9.121.178:80","5.9.121.178:443","23.237.104.106:80","23.237.104.106:443","45.166.93.156:80","45.166.93.156:443","45.166.93.156:9999","stitcher-ipv4.pluto.tv:443","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv:443","appletree-mytimeuk-rakuten.amagi.tv:443","63.141.239.226:81","stream8.cinerama.uz:443","38.252.238.18:8000","45.162.64.114:80","45.177.114.115:80","168.197.104.22:80","170.83.16.50:80","cdn-5.nxplay.com.br:443","stream.telfazalive.com:443","edge.novastream.et:443","bozztv.com:443","rpn.bozztv.com:443","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv:443"]);
function endpointKey(url) { return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`; }

function validId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : "";
}
function allowedSource(value) {
  try {
    const u = new URL(String(value || ""));
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password &&
      ALLOWED_HOSTS.has(u.hostname) && ALLOWED_ENDPOINTS.has(endpointKey(u)) ? u : null;
  } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const user = await requireUser(req);
    requireAdmin(user);
    const { db, FieldValue } = getServices();
    const [publicSnap, catalogSnap] = await Promise.all([
      db.collection("jonStream").doc("appData").get(),
      db.collection("premiumPlaybackChannels").get()
    ]);
    if (!publicSnap.exists) return res.status(404).json({ error: "Public app data not found", errorCode: "PUBLIC_APP_DATA_NOT_FOUND" });
    const publicData = publicSnap.data() || {};
    const existing = catalogSnap.docs.map(doc => ({ id: doc.id, data: doc.data() || {} }));
    const candidates = [];
    const skipped = [];
    for (const group of ["tv", "radio"]) {
      const items = Array.isArray(publicData[group]) ? publicData[group] : [];
      for (const item of items) {
        if (!item || String(item.accessTier || "").toLowerCase() !== "premium") continue;
        const ids = [...new Set(ID_FIELDS.map(k => validId(item[k])).filter(Boolean))];
        const name = String(item.name || item.title || "Unnamed channel").slice(0, 120);
        if (!ids.length) { skipped.push({ name, reason: "PUBLIC_CHANNEL_ID_MISSING" }); continue; }
        const current = existing.find(doc => ids.some(id => doc.id === id || ALIASES.some(k => String(doc.data[k] || "").trim() === id)));
        const rawSource = SOURCE_FIELDS.map(k => item[k]).find(v => typeof v === "string" && v.trim());
        const source = allowedSource(rawSource);
        if (!source) { skipped.push({ name, ids, reason: rawSource ? "SOURCE_HOST_NOT_ALLOWED_OR_INVALID" : "PUBLIC_SOURCE_URL_MISSING" }); continue; }
        const id = (current && current.id) || ids[0];
        candidates.push({
          id,
          data: {
            channelId: ids[0],
            publicChannelId: ids[0],
            publicChannelIds: ids,
            name,
            category: String(item.category || group).slice(0, 80),
            active: item.active === false ? false : true,
            accessTier: "premium",
            sourceUrl: source.toString(),
            isHls: source.pathname.toLowerCase().endsWith(".m3u8"),
            syncedFrom: "jonStream/appData",
            updatedAt: FieldValue.serverTimestamp()
          },
          existing: !!current,
          sourceHost: source.hostname
        });
      }
    }
    const seen = new Set();
    const unique = candidates.filter(c => {
      if (seen.has(c.id)) { skipped.push({ id: c.id, reason: "DUPLICATE_PUBLIC_ID" }); return false; }
      seen.add(c.id); return true;
    });
    const apply = req.body && req.body.apply === true;
    let written = 0;
    if (apply) {
      const batch = db.batch();
      for (const item of unique) {
        batch.set(db.collection("premiumPlaybackChannels").doc(item.id), item.data, { merge: true });
      }
      if (unique.length) await batch.commit();
      written = unique.length;
    }
    return res.status(200).json({
      diagnostic: "premium-playback-catalog-sync",
      mode: apply ? "applied" : "dry-run",
      publicPremiumCount: ["tv", "radio"].reduce((n, key) => n + (Array.isArray(publicData[key]) ? publicData[key].filter(c => c && String(c.accessTier || "").toLowerCase() === "premium").length : 0), 0),
      matchedOrMappableCount: unique.length,
      existingMatches: unique.filter(c => c.existing).length,
      newDocuments: unique.filter(c => !c.existing).length,
      written,
      channels: unique.map(c => ({ id: c.id, name: c.data.name, active: c.data.active, existing: c.existing, sourceHost: c.sourceHost })),
      skipped
    });
  } catch (error) {
    return sendError(res, error);
  }
};
