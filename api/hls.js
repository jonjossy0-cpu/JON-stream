const { getServices } = require("./_lib/firebaseAdmin");
const { decodeTicket, isWithinChannelRoot } = require("./_lib/playbackTicket");

const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106","45.166.93.156","stitcher-ipv4.pluto.tv","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv","appletree-mytimeuk-rakuten.amagi.tv","63.141.239.226","stream8.cinerama.uz","38.252.238.18","45.162.64.114","45.177.114.115","168.197.104.22","170.83.16.50","cdn-5.nxplay.com.br","stream.telfazalive.com","edge.novastream.et","bozztv.com","rpn.bozztv.com","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"]);
const ALLOWED_ENDPOINTS = new Set(["88.212.15.19:80","88.212.15.19:443","154.58.202.18:80","154.58.202.18:443","5.9.121.178:80","5.9.121.178:443","23.237.104.106:80","23.237.104.106:443","45.166.93.156:80","45.166.93.156:443","45.166.93.156:9999","stitcher-ipv4.pluto.tv:443","amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv:443","appletree-mytimeuk-rakuten.amagi.tv:443","63.141.239.226:81","stream8.cinerama.uz:443","38.252.238.18:8000","45.162.64.114:80","45.177.114.115:80","168.197.104.22:80","170.83.16.50:80","cdn-5.nxplay.com.br:443","stream.telfazalive.com:443","edge.novastream.et:443","bozztv.com:443","rpn.bozztv.com:443","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv:443"]);
function endpointKey(url) { return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`; }
const MAX_PLAYLIST_BYTES = 1_000_000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Range,Content-Type",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges,Content-Type",
    "Cache-Control": "no-store"
  };
}

function isAllowed(url) {
  return ["http:", "https:"].includes(url.protocol) &&
    !url.username && !url.password && ALLOWED_HOSTS.has(url.hostname) && ALLOWED_ENDPOINTS.has(endpointKey(url));
}

function absolutize(value, base) {
  try { return new URL(value, base).toString(); } catch (_) { return value; }
}

function gatewayUrl(target, gatewayOrigin, ticket) {
  return gatewayOrigin + "/api/hls?url=" + encodeURIComponent(target) + (ticket ? "&ticket=" + encodeURIComponent(ticket) : "");
}

function rewriteUriAttributes(line, baseUrl, gatewayOrigin, ticket) {
  return line.replace(/URI="([^"]+)"/gi, (_, value) => {
    const absolute = absolutize(value, baseUrl);
    try {
      const u = new URL(absolute);
      return isAllowed(u) ? 'URI="' + gatewayUrl(absolute, gatewayOrigin, ticket) + '"' : 'URI="' + absolute + '"';
    } catch (_) {
      return 'URI="' + value + '"';
    }
  });
}

function premiumPlaylistReferencesAllowed(body, baseUrl, payload, sourceUrl) {
  const references = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const match of line.matchAll(/URI="([^"]+)"/gi)) references.push(match[1]);
    if (!trimmed.startsWith("#")) references.push(trimmed);
  }
  for (const reference of references) {
    let target;
    try { target = new URL(reference, baseUrl); } catch (_) { return false; }
    if (!isAllowed(target) || target.hostname !== payload.host || !isWithinChannelRoot(target, sourceUrl)) return false;
  }
  return true;
}

function rewritePlaylist(body, baseUrl, gatewayOrigin, ticket) {
  return body.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    let rewritten = rewriteUriAttributes(line, baseUrl, gatewayOrigin, ticket);
    if (!trimmed.startsWith("#")) {
      const absolute = absolutize(trimmed, baseUrl);
      try {
        const u = new URL(absolute);
        if (isAllowed(u)) rewritten = gatewayUrl(absolute, gatewayOrigin, ticket);
      } catch (_) {}
    }
    return rewritten;
  }).join("\n");
}

async function getChannel(channelId) {
  const { db } = getServices();
  const [catalogSnap, appSnap] = await Promise.all([
    db.collection("premiumPlaybackChannels").doc(channelId).get(),
    db.collection("jonStream").doc("appData").get()
  ]);
  const appData = appSnap.exists ? appSnap.data() || {} : {};
  const idFields = ["premiumChannelId", "playbackChannelId", "channelId", "id"];
  const sourceFields = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link", "source", "primaryStream", "stream"];
  let publicMatch = null;
  for (const group of ["tv", "radio"]) {
    const items = Array.isArray(appData[group]) ? appData[group] : [];
    publicMatch = items.find(item => item &&
      String(item.accessTier || "").toLowerCase() === "premium" &&
      item.active !== false && item.enabled !== false &&
      idFields.some(key => String(item[key] || "").trim() === channelId)
    ) || null;
    if (publicMatch) break;
  }

  if (catalogSnap.exists) {
    const catalog = catalogSnap.data() || {};
    if (catalog.active !== true || String(catalog.accessTier || "").toLowerCase() !== "premium") return null;
    const catalogSource = typeof catalog.sourceUrl === "string" ? catalog.sourceUrl : "";
    let selectedSource = null;
    try {
      const candidate = new URL(catalogSource);
      if (isAllowed(candidate)) selectedSource = candidate.toString();
    } catch (_) {}
    // Match the ticket issuer's stale-catalog fallback: when the private
    // catalog URL is no longer permitted, use the server-side public TV/Radio
    // record only if its source passes the exact same gateway allowlist.
    if (!selectedSource && publicMatch) {
      const publicSource = sourceFields.map(key => publicMatch[key])
        .find(value => typeof value === "string" && value.trim());
      try {
        const candidate = new URL(publicSource);
        if (isAllowed(candidate)) selectedSource = candidate.toString();
      } catch (_) {}
    }
    if (!selectedSource) return null;
    return { ...catalog, sourceUrl: selectedSource };
  }

  if (!publicMatch) return null;
  const sourceUrl = sourceFields.map(key => publicMatch[key])
    .find(value => typeof value === "string" && value.trim());
  if (!sourceUrl) return null;
  try {
    if (!isAllowed(new URL(sourceUrl))) return null;
  } catch (_) { return null; }
  return { ...publicMatch, sourceUrl };
}

async function isCataloguedPremiumUrl(target) {
  const { db } = getServices();
  const snapshot = await db.collection("premiumPlaybackChannels").get();
  const catalogMatch = snapshot.docs.some(doc => {
    const data = doc.data() || {};
    return String(data.accessTier || "").toLowerCase() === "premium" &&
      typeof data.sourceUrl === "string" &&
      isWithinChannelRoot(target, data.sourceUrl);
  });
  if (catalogMatch) return true;
  const appSnap = await db.collection("jonStream").doc("appData").get();
  const appData = appSnap.exists ? appSnap.data() || {} : {};
  const sourceFields = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link", "source", "primaryStream", "stream"];
  return ["tv", "radio"].some(group => {
    const items = Array.isArray(appData[group]) ? appData[group] : [];
    return items.some(item => {
      if (!item || String(item.accessTier || "").toLowerCase() !== "premium") return false;
      const sourceUrl = sourceFields.map(key => item[key]).find(value => typeof value === "string" && value.trim());
      return !!sourceUrl && isWithinChannelRoot(target, sourceUrl);
    });
  });
}

module.exports = async function handler(req, res) {
  const cors = corsHeaders();
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET,HEAD,OPTIONS");
    return res.status(405).send("Method not allowed");
  }

  const ticketSecret = process.env.PREMIUM_PLAYBACK_TICKET_SECRET || "";
  const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
  const channelIdParam = typeof req.query.channelId === "string" ? req.query.channelId : "";
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  let payload = null;
  let channel = null;
  let target;

  if (ticket) {
    payload = decodeTicket(ticket, ticketSecret);
    if (!payload) return res.status(401).send("Valid playback ticket required");
    if (channelIdParam && channelIdParam !== payload.channelId) return res.status(403).send("Ticket channel mismatch");
    try { channel = await getChannel(payload.channelId); }
    catch (_) { return res.status(503).send("Premium channel catalog unavailable"); }
    if (!channel || typeof channel.sourceUrl !== "string") return res.status(403).send("Premium channel unavailable");
    try { target = raw ? new URL(raw) : new URL(channel.sourceUrl); }
    catch (_) { return res.status(400).send("Invalid URL"); }
    if (!isAllowed(target) || target.hostname !== payload.host || !isWithinChannelRoot(target, channel.sourceUrl)) {
      return res.status(403).send("URL is outside the authorized channel source");
    }
  } else {
    if (channelIdParam) return res.status(401).send("Valid playback ticket required");
    if (!raw) return res.status(400).send("Missing url");
    try { target = new URL(raw); }
    catch (_) { return res.status(400).send("Invalid URL"); }
    if (!isAllowed(target)) return res.status(403).send("Host not allowed");
    try {
      if (await isCataloguedPremiumUrl(target)) return res.status(401).send("Premium playback ticket required");
    } catch (_) {
      return res.status(503).send("Premium channel catalog unavailable");
    }
  }

  try {
    let requestUrl = target;
    let upstream;
    for (let redirects = 0; redirects <= 5; redirects++) {
      upstream = await fetch(requestUrl.toString(), {
        method: req.method,
        headers: {
          "User-Agent": req.headers["user-agent"] || "JON-Stream-Gateway",
          "Accept": req.headers.accept || "*/*",
          ...(req.headers.range ? { "Range": req.headers.range } : {})
        },
        redirect: "manual"
      });
      const redirectStatus = [301, 302, 303, 307, 308].includes(upstream.status);
      const location = upstream.headers.get("location");
      if (!redirectStatus || !location) break;
      if (redirects === 5) {
        try { if (upstream.body) await upstream.body.cancel(); } catch (_) {}
        return res.status(502).send("Too many upstream redirects");
      }
      let nextUrl;
      try { nextUrl = new URL(location, requestUrl); }
      catch (_) {
        try { if (upstream.body) await upstream.body.cancel(); } catch (_) {}
        return res.status(502).send("Invalid upstream redirect");
      }
      let redirectAllowed = isAllowed(nextUrl);
      if (payload) {
        redirectAllowed = redirectAllowed && nextUrl.hostname === payload.host && isWithinChannelRoot(nextUrl, channel.sourceUrl);
      } else if (redirectAllowed) {
        try { if (await isCataloguedPremiumUrl(nextUrl)) redirectAllowed = false; }
        catch (_) { redirectAllowed = false; }
      }
      if (!redirectAllowed) {
        try { if (upstream.body) await upstream.body.cancel(); } catch (_) {}
        return res.status(502).send("Redirected source is outside the authorized channel");
      }
      try { if (upstream.body) await upstream.body.cancel(); } catch (_) {}
      requestUrl = nextUrl;
    }

    const finalTarget = requestUrl;
    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const looksLikePlaylist = contentType.includes("mpegurl") ||
      contentType.includes("vnd.apple.mpegurl") ||
      finalTarget.pathname.toLowerCase().endsWith(".m3u8");

    res.setHeader("Content-Type", looksLikePlaylist ? "application/vnd.apple.mpegurl" : (contentType || "application/octet-stream"));
    if (looksLikePlaylist && upstream.ok) {
      const body = await upstream.text();
      if (Buffer.byteLength(body, "utf8") > MAX_PLAYLIST_BYTES) return res.status(413).send("Playlist too large");
      if (payload && !premiumPlaylistReferencesAllowed(body, finalTarget.toString(), payload, channel.sourceUrl)) {
        return res.status(502).send("Playlist contains a URL outside the authorized Premium source");
      }
      res.statusCode = upstream.status;
      if (req.method === "HEAD") return res.end();
      const requestHost = String(req.headers.host || "");
      const gatewayOrigin = /^jon-stream(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(requestHost)
        ? "https://" + requestHost
        : "https://jon-stream.vercel.app";
      return res.end(rewritePlaylist(body, finalTarget.toString(), gatewayOrigin, payload ? ticket : ""));
    }

    for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.statusCode = upstream.status;
    if (req.method === "HEAD" || !upstream.body) return res.end();
    // Stream live media through without buffering the full response in memory.
    const { Readable } = require("stream");
    const mediaStream = Readable.fromWeb(upstream.body);
    mediaStream.on("error", () => {
      if (!res.headersSent) res.status(502).end("Gateway stream error");
      else res.destroy();
    });
    return mediaStream.pipe(res);
  } catch (_) {
    return res.status(502).send("Gateway upstream error");
  }
};
