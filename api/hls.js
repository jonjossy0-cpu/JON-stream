const { getServices } = require("./_lib/firebaseAdmin");
const { decodeTicket, isWithinChannelRoot } = require("./_lib/playbackTicket");

const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106","amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"]);
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
    !url.username && !url.password && ALLOWED_HOSTS.has(url.hostname);
}

function absolutize(value, base) {
  try { return new URL(value, base).toString(); } catch (_) { return value; }
}

function gatewayUrl(target, gatewayOrigin, ticket) {
  return gatewayOrigin + "/api/hls?url=" + encodeURIComponent(target) + "&ticket=" + encodeURIComponent(ticket);
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
  const snap = await db.collection("premiumPlaybackChannels").doc(channelId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.active !== true || String(data.accessTier || "").toLowerCase() !== "premium") return null;
  return data;
}

async function isCataloguedPremiumUrl(target) {
  const { db } = getServices();
  const snapshot = await db.collection("premiumPlaybackChannels").get();
  return snapshot.docs.some(doc => {
    const data = doc.data() || {};
    return data.active === true &&
      String(data.accessTier || "").toLowerCase() === "premium" &&
      typeof data.sourceUrl === "string" &&
      isWithinChannelRoot(target, data.sourceUrl);
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

  const ticketSecret = process.env.PREMIUM_PLAYBACK_TICKET_SECRET;
  if (!ticketSecret || ticketSecret.length < 32) {
    return res.status(503).send("Premium playback authorization is not configured");
  }

  const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
  const payload = decodeTicket(ticket, ticketSecret);
  if (!payload) return res.status(401).send("Valid playback ticket required");

  let channelId = typeof req.query.channelId === "string" ? req.query.channelId : "";
  if (channelId && channelId !== payload.channelId) return res.status(403).send("Ticket channel mismatch");
  channelId = payload.channelId;

  let channel;
  try {
    channel = await getChannel(channelId);
  } catch (_) {
    return res.status(503).send("Premium channel catalog unavailable");
  }
  if (!channel || typeof channel.sourceUrl !== "string") {
    return res.status(403).send("Premium channel unavailable");
  }

  let target;
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  try {
    target = raw ? new URL(raw) : new URL(channel.sourceUrl);
  } catch (_) {
    return res.status(400).send("Invalid URL");
  }
  if (!isAllowed(target)) return res.status(403).send("Host not allowed");
  if (target.hostname !== payload.host || !isWithinChannelRoot(target, channel.sourceUrl)) {
    return res.status(403).send("URL is outside the authorized channel source");
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
      if (!isAllowed(nextUrl) || nextUrl.hostname !== payload.host ||
          !isWithinChannelRoot(nextUrl, channel.sourceUrl)) {
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
      res.statusCode = upstream.status;
      if (req.method === "HEAD") return res.end();
      const requestHost = String(req.headers.host || "");
      const gatewayOrigin = /^jon-stream(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(requestHost)
        ? "https://" + requestHost
        : "https://jon-stream.vercel.app";
      return res.end(rewritePlaylist(body, finalTarget.toString(), gatewayOrigin, ticket));
    }

    for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
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
