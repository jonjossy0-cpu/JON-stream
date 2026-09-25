const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    "Cache-Control": "no-store"
  };
}

function isAllowed(url) {
  return (url.protocol === "http:" || url.protocol === "https:") &&
    ALLOWED_HOSTS.has(url.hostname);
}

function absolutize(value, base) {
  try {
    return new URL(value, base).toString();
  } catch (_) {
    return value;
  }
}

function gatewayUrl(target) {
  return "https://jon-stream.vercel.app/api/hls?url=" + encodeURIComponent(target);
}

function rewriteUriAttributes(line, baseUrl) {
  return line.replace(/URI="([^"]+)"/gi, (_, value) => {
    const absolute = absolutize(value, baseUrl);
    try {
      const u = new URL(absolute);
      return isAllowed(u) ? 'URI="' + gatewayUrl(absolute) + '"' : 'URI="' + absolute + '"';
    } catch (_) {
      return 'URI="' + value + '"';
    }
  });
}

function rewritePlaylist(body, baseUrl) {
  return body.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    let rewritten = rewriteUriAttributes(line, baseUrl);

    if (!trimmed.startsWith("#")) {
      const absolute = absolutize(trimmed, baseUrl);
      try {
        const u = new URL(absolute);
        if (isAllowed(u)) rewritten = gatewayUrl(absolute);
      } catch (_) {}
    }

    return rewritten;
  }).join("\n");
}

export default async function handler(req, res) {
  const cors = corsHeaders();

  if (req.method === "OPTIONS") {
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(405).send("Method not allowed");
  }

  const raw = typeof req.query.url === "string" ? req.query.url : "";
  if (!raw) {
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(400).send("Missing url");
  }

  let target;
  try {
    target = new URL(raw);
  } catch (_) {
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(400).send("Invalid url");
  }

  if (!isAllowed(target)) {
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(403).send("Host not allowed");
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
      headers: {
        "User-Agent": req.headers["user-agent"] || "JON-Stream-Gateway",
        "Accept": req.headers.accept || "*/*",
        ...(req.headers.range ? { "Range": req.headers.range } : {})
      },
      redirect: "follow"
    });

    const finalTarget = new URL(upstream.url || target.toString());
    if (!isAllowed(finalTarget)) {
      Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(502).send("Redirected host not allowed");
    }

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const looksLikePlaylist =
      contentType.includes("mpegurl") ||
      contentType.includes("vnd.apple.mpegurl") ||
      target.pathname.toLowerCase().endsWith(".m3u8");

    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Content-Type", looksLikePlaylist ? "application/vnd.apple.mpegurl" : (contentType || "application/octet-stream"));

    if (looksLikePlaylist) {
      const body = await upstream.text();
      res.statusCode = upstream.status;
      if (req.method === "HEAD") return res.end();
      return res.end(rewritePlaylist(body, finalTarget.toString()));
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    res.statusCode = upstream.status;
    if (req.method === "HEAD") return res.end();
    return res.end(buffer);
  } catch (error) {
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(502).send("Gateway upstream error");
  }
}
