const ALLOWED_HOSTS = new Set(["88.212.15.19","154.58.202.18","5.9.121.178","23.237.104.106"]);
const MAX_REDIRECTS = 5;

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
    ALLOWED_HOSTS.has(url.hostname) &&
    !url.username && !url.password;
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

async function readTextLimited(response, maxBytes) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Upstream playlist too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
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

async function fetchAllowedTarget(initialTarget, options) {
  let target = new URL(initialTarget.toString());

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!isAllowed(target)) {
      throw new Error("Upstream host not allowed");
    }

    const response = await fetch(target.toString(), {
      ...options,
      redirect: "manual"
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalTarget: target };
    }

    const location = response.headers.get("location");
    if (!location) return { response, finalTarget: target };

    if (redirects === MAX_REDIRECTS) {
      throw new Error("Too many upstream redirects");
    }

    let nextTarget;
    try {
      nextTarget = new URL(location, target);
    } catch (_) {
      throw new Error("Invalid upstream redirect");
    }

    // Validate the destination before issuing the redirected request.
    if (!isAllowed(nextTarget)) {
      throw new Error("Redirect destination not allowed");
    }

    target = nextTarget;
  }

  throw new Error("Too many upstream redirects");
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
    const { response: upstream, finalTarget } = await fetchAllowedTarget(target, {
      method: req.method,
      headers: {
        "User-Agent": req.headers["user-agent"] || "JON-Stream-Gateway",
        "Accept": req.headers.accept || "*/*",
        ...(req.headers.range ? { "Range": req.headers.range } : {})
      }
    });

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const looksLikePlaylist =
      contentType.includes("mpegurl") ||
      contentType.includes("vnd.apple.mpegurl") ||
      finalTarget.pathname.toLowerCase().endsWith(".m3u8");

    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Content-Type", looksLikePlaylist ? "application/vnd.apple.mpegurl" : (contentType || "application/octet-stream"));

    if (looksLikePlaylist) {
      const body = await readTextLimited(upstream, 2 * 1024 * 1024);
      res.statusCode = upstream.status;
      if (req.method === "HEAD") return res.end();
      return res.end(rewritePlaylist(body, finalTarget.toString()));
    }

    for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    res.statusCode = upstream.status;
    if (req.method === "HEAD") return res.end();

    // Stream media instead of buffering the entire segment in memory.
    if (upstream.body) {
      const { Readable } = await import("node:stream");
      return Readable.fromWeb(upstream.body).pipe(res);
    }
    return res.end();
  } catch (error) {
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(502).send("Gateway upstream error");
  }
}
