const { getServices } = require("./_lib/firebaseAdmin");
const { decodeTicket, isWithinChannelRoot } = require("./_lib/playbackTicket");

const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"]);
const MAX_PLAYLIST_BYTES = 1_000_000;
const SOURCE_FIELDS = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link"];

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
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
    !url.port && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
}
function withinPremiumSource(url, payload) {
  return !!payload && isAllowed(url) && url.hostname.toLowerCase() === String(payload.host || "").toLowerCase() &&
    isWithinChannelRoot(url, payload.sourceUrl);
}
function absolutize(value, base) {
  try { return new URL(value, base).toString(); } catch (_) { return value; }
}
function gatewayUrl(target, gatewayOrigin, ticket) {
  return gatewayOrigin + "/api/hls?url=" + encodeURIComponent(target) + (ticket ? "&ticket=" + encodeURIComponent(ticket) : "");
}
function rewriteUriAttributes(line, baseUrl, gatewayOrigin, ticket, allowUrl) {
  return line.replace(/URI="([^"]+)"/gi, (_, value) => {
    const absolute = absolutize(value, baseUrl);
    try {
      const u = new URL(absolute);
      return allowUrl(u) ? 'URI="' + gatewayUrl(absolute, gatewayOrigin, ticket) + '"' : 'URI="' + absolute + '"';
    } catch (_) { return 'URI="' + value + '"'; }
  });
}
function premiumPlaylistReferencesAllowed(body, baseUrl, payload) {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const refs = [...Array.from(line.matchAll(/URI="([^"]+)"/gi), m => m[1])];
    if (!trimmed.startsWith("#")) refs.push(trimmed);
    for (const reference of refs) {
      let target;
      try { target = new URL(reference, baseUrl); } catch (_) { return false; }
      if (!withinPremiumSource(target, payload)) return false;
    }
  }
  return true;
}
function rewritePlaylist(body, baseUrl, gatewayOrigin, ticket, allowUrl) {
  return body.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    let rewritten = rewriteUriAttributes(line, baseUrl, gatewayOrigin, ticket, allowUrl);
    if (!trimmed.startsWith("#")) {
      const absolute = absolutize(trimmed, baseUrl);
      try { const u = new URL(absolute); if (allowUrl(u)) rewritten = gatewayUrl(absolute, gatewayOrigin, ticket); } catch (_) {}
    }
    return rewritten;
  }).join("\n");
}
async function isCataloguedPremiumUrl(target) {
  const { db } = getServices();
  const snap = await db.collection("jonStream").doc("appData").get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  for (const group of ["tv", "radio"]) {
    const items = Array.isArray(data[group]) ? data[group] : [];
    for (const item of items) {
      if (!item || String(item.accessTier || "free").toLowerCase() !== "premium") continue;
      const source = SOURCE_FIELDS.map(key => item[key]).find(value => typeof value === "string" && value.trim());
      try { if (source && isWithinChannelRoot(target, source)) return true; } catch (_) {}
    }
  }
  return false;
}

module.exports = async function handler(req, res) {
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET,HEAD,OPTIONS");
    return res.status(405).send("Method not allowed");
  }

  const secret = process.env.PREMIUM_PLAYBACK_TICKET_SECRET || "";
  const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
  const channelId = typeof req.query.channelId === "string" ? req.query.channelId : "";
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  let payload = null;
  let target;

  if (ticket) {
    payload = decodeTicket(ticket, secret);
    if (!payload || !payload.sourceUrl) return res.status(401).send("Valid Premium playback ticket required");
    if (channelId && channelId !== payload.channelId) return res.status(403).send("Ticket channel mismatch");
    try { target = raw ? new URL(raw) : new URL(payload.sourceUrl); }
    catch (_) { return res.status(400).send("Invalid URL"); }
    if (!withinPremiumSource(target, payload)) return res.status(403).send("URL is outside the signed Premium source");
  } else {
    if (channelId) return res.status(401).send("Valid Premium playback ticket required");
    if (!raw) return res.status(400).send("Missing URL");
    try { target = new URL(raw); } catch (_) { return res.status(400).send("Invalid URL"); }
    if (!isAllowed(target)) return res.status(403).send("Host not allowed");
    try { if (await isCataloguedPremiumUrl(target)) return res.status(401).send("Premium playback ticket required"); }
    catch (_) { return res.status(503).send("Channel list unavailable"); }
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
      const redirectStatus = [301,302,303,307,308].includes(upstream.status);
      const location = upstream.headers.get("location");
      if (!redirectStatus || !location) break;
      if (redirects === 5) { try { if (upstream.body) await upstream.body.cancel(); } catch (_) {} return res.status(502).send("Too many upstream redirects"); }
      let nextUrl;
      try { nextUrl = new URL(location, requestUrl); }
      catch (_) { try { if (upstream.body) await upstream.body.cancel(); } catch (_) {} return res.status(502).send("Invalid upstream redirect"); }
      let allowed = payload ? withinPremiumSource(nextUrl, payload) : isAllowed(nextUrl);
      if (!payload && allowed) { try { if (await isCataloguedPremiumUrl(nextUrl)) allowed = false; } catch (_) { allowed = false; } }
      if (!allowed) { try { if (upstream.body) await upstream.body.cancel(); } catch (_) {} return res.status(502).send("Redirected source is not allowed"); }
      try { if (upstream.body) await upstream.body.cancel(); } catch (_) {}
      requestUrl = nextUrl;
    }

    const finalTarget = requestUrl;
    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const isPlaylist = contentType.includes("mpegurl") || contentType.includes("vnd.apple.mpegurl") ||
      finalTarget.pathname.toLowerCase().endsWith(".m3u8");
    res.setHeader("Content-Type", isPlaylist ? "application/vnd.apple.mpegurl" : (contentType || "application/octet-stream"));

    if (isPlaylist && upstream.ok) {
      const body = await upstream.text();
      if (Buffer.byteLength(body, "utf8") > MAX_PLAYLIST_BYTES) return res.status(413).send("Playlist too large");
      if (payload && !premiumPlaylistReferencesAllowed(body, finalTarget.toString(), payload)) {
        return res.status(502).send("Playlist contains a URL outside the signed Premium source");
      }
      res.statusCode = upstream.status;
      if (req.method === "HEAD") return res.end();
      const requestHost = String(req.headers.host || "");
      const gatewayOrigin = /^jon-stream(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(requestHost) ? "https://" + requestHost : "https://jon-stream.vercel.app";
      const allowUrl = payload ? url => withinPremiumSource(url, payload) : isAllowed;
      return res.end(rewritePlaylist(body, finalTarget.toString(), gatewayOrigin, payload ? ticket : "", allowUrl));
    }

    for (const name of ["content-length","content-range","accept-ranges","etag","last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    const buffer = req.method === "HEAD" ? null : Buffer.from(await upstream.arrayBuffer());
    res.statusCode = upstream.status;
    return res.end(buffer || undefined);
  } catch (_) {
    return res.status(502).send("Gateway upstream error");
  }
};

module.exports._test = { isAllowed, withinPremiumSource, premiumPlaylistReferencesAllowed };
