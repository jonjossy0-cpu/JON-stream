const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "154.58.202.18",
  "5.9.121.178",
  "23.237.104.106",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"
]);

const SEGMENT_EXTENSIONS = /\.(ts|m4s|mp4|m4a|aac|ac3|ec3|mp3|vtt)(?:$|\?)/i;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag",
    "Vary": "Origin"
  };
}

function allowed(url) {
  return (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username && !url.password &&
    ALLOWED_HOSTS.has(url.hostname);
}

function absolute(value, base) {
  try { return new URL(value, base).toString(); } catch { return value; }
}

function gatewayUrl(target, origin) {
  return origin + "/api/hls?url=" + encodeURIComponent(target);
}

function rewritePlaylist(body, baseUrl, gatewayOrigin) {
  return body.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    let output = line.replace(/URI="([^"]+)"/gi, (_, value) => {
      const target = absolute(value, baseUrl);
      try {
        const u = new URL(target);
        return allowed(u) ? 'URI="' + gatewayUrl(target, gatewayOrigin) + '"' : 'URI="' + target + '"';
      } catch {
        return 'URI="' + value + '"';
      }
    });
    if (!trimmed.startsWith("#")) {
      const target = absolute(trimmed, baseUrl);
      try {
        if (allowed(new URL(target))) output = gatewayUrl(target, gatewayOrigin);
      } catch {}
    }
    return output;
  }).join("\n");
}

function isPlaylist(url, contentType) {
  return contentType.includes("mpegurl") ||
    contentType.includes("vnd.apple.mpegurl") ||
    url.pathname.toLowerCase().endsWith(".m3u8");
}

function isSegment(url, contentType) {
  return SEGMENT_EXTENSIONS.test(url.pathname) ||
    /^(video\/|audio\/)/i.test(contentType);
}

function responseHeaders(upstream, extra = {}) {
  const headers = new Headers(corsHeaders());
  const type = upstream.headers.get("content-type");
  if (type) headers.set("Content-Type", type);
  for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const raw = url.searchParams.get("url");
    if (!raw) return new Response("Missing url", { status: 400, headers: corsHeaders() });

    let target;
    try { target = new URL(raw); } catch {
      return new Response("Invalid url", { status: 400, headers: corsHeaders() });
    }
    if (!allowed(target)) return new Response("Host not allowed", { status: 403, headers: corsHeaders() });

    const range = request.headers.get("range");
    const cacheableRequest = request.method === "GET" && !range;
    if (cacheableRequest) {
      const cached = await caches.default.match(request);
      if (cached) return cached;
    }

    try {
      let upstream;
      let requestUrl = target;
      for (let redirects = 0; redirects <= 5; redirects++) {
        upstream = await fetch(requestUrl.toString(), {
          method: request.method,
          headers: {
            "User-Agent": request.headers.get("user-agent") || "JON-Stream-Gateway",
            "Accept": request.headers.get("accept") || "*/*",
            ...(range ? { "Range": range } : {})
          },
          redirect: "manual"
        });

        const location = upstream.headers.get("location");
        if (!REDIRECT_STATUSES.has(upstream.status) || !location) break;
        if (redirects === 5) {
          try { await upstream.body?.cancel(); } catch {}
          return new Response("Too many upstream redirects", { status: 502, headers: corsHeaders() });
        }
        let next;
        try { next = new URL(location, requestUrl); } catch {
          try { await upstream.body?.cancel(); } catch {}
          return new Response("Invalid upstream redirect", { status: 502, headers: corsHeaders() });
        }
        if (!allowed(next)) {
          try { await upstream.body?.cancel(); } catch {}
          return new Response("Redirected host not allowed", { status: 502, headers: corsHeaders() });
        }
        try { await upstream.body?.cancel(); } catch {}
        requestUrl = next;
      }

      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      const playlist = isPlaylist(target, type);
      if (playlist) {
        const headers = responseHeaders(upstream, { "Cache-Control": "no-store" });
        headers.set("Content-Type", "application/vnd.apple.mpegurl");
        if (request.method === "HEAD") return new Response(null, { status: upstream.status, headers });
        const text = await upstream.text();
        return new Response(rewritePlaylist(text, requestUrl.toString(), url.origin), {
          status: upstream.status,
          headers
        });
      }

      const segment = isSegment(target, type);
      const canCache = cacheableRequest && segment &&
        upstream.status === 200 &&
        !upstream.headers.has("set-cookie") &&
        !upstream.headers.has("content-range");

      const headers = responseHeaders(upstream, {
        "Cache-Control": canCache ? "public, s-maxage=30, stale-while-revalidate=60" : "no-store"
      });
      const response = new Response(request.method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        headers
      });

      if (canCache) ctx.waitUntil(caches.default.put(request, response.clone()));
      return response;
    } catch {
      return new Response("Gateway upstream error", { status: 502, headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
    }
  }
};
