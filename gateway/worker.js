const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "23.237.104.106",
  "45.166.93.156",
  "stitcher-ipv4.pluto.tv",
  "amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv",
  "appletree-mytimeuk-rakuten.amagi.tv",
  "63.141.239.226",
  "stream8.cinerama.uz",
  "38.252.238.18",
  "45.162.64.114"
]);

const MAX_REDIRECTS = 3;
const MAX_URL_LENGTH = 4096;
const MAX_PLAYLIST_BYTES = 1_000_000;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 300;
const requestBuckets = new Map();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Range,Content-Type",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges,Content-Type",
    "Cache-Control": "no-store"
  };
}

function endpointKey(url) {
  return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;
}

const ALLOWED_ENDPOINTS = new Set([
  "88.212.15.19:80", "88.212.15.19:443",
  "23.237.104.106:80", "23.237.104.106:443",
  "45.166.93.156:80", "45.166.93.156:443", "45.166.93.156:9999",
  "stitcher-ipv4.pluto.tv:443",
  "amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv:443",
  "appletree-mytimeuk-rakuten.amagi.tv:443",
  "63.141.239.226:81",
  "stream8.cinerama.uz:443",
  "38.252.238.18:8000",
  "45.162.64.114:80"
]);

function isAllowed(url) {
  return (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username && !url.password &&
    ALLOWED_HOSTS.has(url.hostname) &&
    ALLOWED_ENDPOINTS.has(endpointKey(url));
}

function checkRateLimit(request) {
  const now = Date.now();
  const client = request.headers.get("CF-Connecting-IP") || "unknown";
  const current = requestBuckets.get(client);

  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestBuckets.set(client, { startedAt: now, count: 1 });
    if (requestBuckets.size > 10_000) {
      for (const [key, bucket] of requestBuckets) {
        if (now - bucket.startedAt >= RATE_WINDOW_MS) requestBuckets.delete(key);
      }
    }
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;
  if (current.count > MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000))
    };
  }

  return { allowed: true, retryAfter: 0 };
}

function rateLimitResponse(retryAfter) {
  return new Response("Rate limit exceeded", {
    status: 429,
    headers: {
      "Retry-After": String(retryAfter),
      ...corsHeaders()
    }
  });
}

function absolutize(value, base) {
  try {
    return new URL(value, base).toString();
  } catch (_) {
    return null;
  }
}

function proxiedUrl(target) {
  return "/hls?url=" + encodeURIComponent(target);
}

function upstreamHeaders(request, target) {
  const headers = {
    "User-Agent": request.headers.get("User-Agent") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    "Accept": request.headers.get("Accept") || "*/*",
    "Referer": target.origin + "/"
  };

  const range = request.headers.get("Range");
  if (range) headers["Range"] = range;

  return headers;
}

function rewriteUriAttributes(line, base) {
  return line.replace(/URI="([^"]+)"/g, (match, value) => {
    const absolute = absolutize(value, base);
    if (!absolute) return match;

    try {
      const url = new URL(absolute);
      return isAllowed(url)
        ? 'URI="' + proxiedUrl(url.toString()) + '"'
        : match;
    } catch (_) {
      return match;
    }
  });
}

function rewritePlaylist(body, base) {
  return body.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      return rewriteUriAttributes(line, base);
    }

    const absolute = absolutize(trimmed, base);
    if (!absolute) return line;

    try {
      const url = new URL(absolute);
      return isAllowed(url) ? proxiedUrl(url.toString()) : line;
    } catch (_) {
      return line;
    }
  }).join("\n");
}

async function fetchAllowed(target, request) {
  let current = target;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetch(current.toString(), {
      method: request.method,
      headers: upstreamHeaders(request, current),
      redirect: "manual"
    });

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current.toString() };
    }

    const location = response.headers.get("Location");
    if (!location) return { response, finalUrl: current.toString() };

    const next = new URL(location, current);
    if (!isAllowed(next)) {
      return { blockedRedirect: true };
    }

    current = next;
  }

  return { tooManyRedirects: true };
}

async function handle(request) {
  const incoming = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Allow": "GET,HEAD,OPTIONS", ...corsHeaders() }
    });
  }

  if (incoming.pathname !== "/hls") {
    return new Response("JON Stream HLS Gateway - ONLINE", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...corsHeaders()
      }
    });
  }

  const rate = checkRateLimit(request);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfter);

  const raw = incoming.searchParams.get("url");
  if (!raw) {
    return new Response("Missing url", { status: 400, headers: corsHeaders() });
  }
  if (raw.length > MAX_URL_LENGTH) {
    return new Response("URL too long", { status: 414, headers: corsHeaders() });
  }

  let target;
  try {
    target = new URL(raw);
  } catch (_) {
    return new Response("Invalid url", { status: 400, headers: corsHeaders() });
  }

  if (!isAllowed(target)) {
    return new Response("Host or port not allowed", { status: 403, headers: corsHeaders() });
  }

  let result;
  try {
    result = await fetchAllowed(target, request);
  } catch (_) {
    return new Response("Upstream connection failed", {
      status: 502,
      headers: corsHeaders()
    });
  }

  if (result.blockedRedirect) {
    return new Response("Upstream redirect host or port not allowed", {
      status: 403,
      headers: corsHeaders()
    });
  }

  if (result.tooManyRedirects) {
    return new Response("Too many upstream redirects", {
      status: 508,
      headers: corsHeaders()
    });
  }

  const upstream = result.response;
  const contentType = (upstream.headers.get("Content-Type") || "").toLowerCase();
  const finalUrl = result.finalUrl;
  const isPlaylist =
    contentType.includes("mpegurl") ||
    target.pathname.toLowerCase().endsWith(".m3u8") ||
    finalUrl.toLowerCase().split("?")[0].endsWith(".m3u8");

  if (isPlaylist && upstream.ok) {
    const lengthHeader = Number(upstream.headers.get("Content-Length") || 0);
    if (lengthHeader > MAX_PLAYLIST_BYTES) {
      return new Response("Playlist too large", { status: 413, headers: corsHeaders() });
    }

    const body = await upstream.text();
    if (new TextEncoder().encode(body).byteLength > MAX_PLAYLIST_BYTES) {
      return new Response("Playlist too large", { status: 413, headers: corsHeaders() });
    }

    const rewritten = rewritePlaylist(body, finalUrl);

    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        ...corsHeaders()
      }
    });
  }

  if (!upstream.ok) {
    const body = request.method === "HEAD" ? "" : await upstream.text();
    return new Response(body || ("Upstream HTTP " + upstream.status), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "text/plain; charset=utf-8",
        ...corsHeaders()
      }
    });
  }

  const headers = new Headers(upstream.headers);
  Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}

export default { fetch: handle };
