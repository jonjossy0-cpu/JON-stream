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
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
    !url.port && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
}
function absolutize(value, base) {
  try { return new URL(value, base).toString(); } catch (_) { return value; }
}
function gatewayUrl(target, gatewayOrigin) {
  return gatewayOrigin + "/api/hls?url=" + encodeURIComponent(target);
}
function rewritePlaylist(body, baseUrl, gatewayOrigin) {
  return body.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    let rewritten = line.replace(/URI="([^"]+)"/gi, (_, value) => {
      const absolute = absolutize(value, baseUrl);
      try { const u = new URL(absolute); return isAllowed(u) ? 'URI="' + gatewayUrl(absolute, gatewayOrigin) + '"' : 'URI="' + absolute + '"'; }
      catch (_) { return 'URI="' + value + '"'; }
    });
    if (!trimmed.startsWith("#")) {
      const absolute = absolutize(trimmed, baseUrl);
      try { const u = new URL(absolute); if (isAllowed(u)) rewritten = gatewayUrl(absolute, gatewayOrigin); } catch (_) {}
    }
    return rewritten;
  }).join("\n");
}

module.exports = async function handler(req, res) {
  Object.entries(corsHeaders()).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET,HEAD,OPTIONS");
    return res.status(405).send("Method not allowed");
  }
  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw) return res.status(400).send("Missing URL");
  let target;
  try { target = new URL(raw); } catch (_) { return res.status(400).send("Invalid URL"); }
  if (!isAllowed(target)) return res.status(403).send("Host not allowed");

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
      if (!isAllowed(nextUrl)) { try { if (upstream.body) await upstream.body.cancel(); } catch (_) {} return res.status(502).send("Redirected source is not allowed"); }
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
      res.statusCode = upstream.status;
      if (req.method === "HEAD") return res.end();
      const requestHost = String(req.headers.host || "");
      const gatewayOrigin = /^jon-stream(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(requestHost) ? "https://" + requestHost : "https://jon-stream.vercel.app";
      return res.end(rewritePlaylist(body, finalTarget.toString(), gatewayOrigin));
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

module.exports._test = { isAllowed };
