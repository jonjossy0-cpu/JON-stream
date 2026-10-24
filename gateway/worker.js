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
  "45.162.64.114",
  "45.177.114.115",
  "168.197.104.22",
  "170.83.16.50",
  "cdn-5.nxplay.com.br",
  "stream.telfazalive.com",
  "edge.novastream.et",
  "bozztv.com",
  "rpn.bozztv.com",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"
]);

// Fixed EBS entry points avoid requiring users to paste encoded source URLs.
// HLS child playlists and segments still use the guarded /hls proxy route.
const EBS_CHANNELS = new Map([
  ["/ebs/tv", [
    "https://rpn.bozztv.com/ebstv/ebstv/index.m3u8",
    "https://bozztv.com/ebstv/ebstv/tracks-v1a1/mono.ts.m3u8"
  ]],
  ["/ebs/cinema", [
    "https://rpn.bozztv.com/ebstv/ebscinema/index.m3u8",
    "https://bozztv.com/ebstv/ebscinema/tracks-v1a1/mono.ts.m3u8"
  ]],
  ["/ebs/muzika", [
    "https://rpn.bozztv.com/ebstv/ebsmusika/index.m3u8",
    "https://bozztv.com/ebstv/ebsmusika/tracks-v1a1/mono.ts.m3u8"
  ]],
  ["/great/christmas", "https://amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv/playlist/amg01753-narrativeuk-greatchristmas-lggb/playlist.m3u8"]
]);

// Fixed Sony Movies route; playlist children and segments pass through the guarded /hls endpoint.
const FIXED_CHANNELS = new Map([
  ["/sony/movies", [
    "http://45.162.64.114/SONY_MOVIES/index.m3u8",
    "http://45.177.114.115/SONY_MOVIES/index.m3u8",
    "http://168.197.104.22/SONY_MOVIES/index.m3u8",
    "http://170.83.16.50/SONY_MOVIES/index.m3u8",
    "https://cdn-5.nxplay.com.br/SONY_MOVIES/index.m3u8"
  ]]
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
  "45.162.64.114:80",
  "45.177.114.115:80",
  "168.197.104.22:80",
  "170.83.16.50:80",
  "cdn-5.nxplay.com.br:443",
  "stream.telfazalive.com:443",
  "edge.novastream.et:443",
  "bozztv.com:443",
  "rpn.bozztv.com:443",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv:443"
]);

function isAllowed(url) {
  return (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username && !url.password &&
    ALLOWED_HOSTS.has(url.hostname) &&
    ALLOWED_ENDPOINTS.has(endpointKey(url));
}


function premiumPlaylistReferencesAllowed(body, base, payload, env) {
  const references = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const match of line.matchAll(/URI="([^"]+)"/gi)) references.push(match[1]);
    if (!trimmed.startsWith("#")) references.push(trimmed);
  }
  for (const reference of references) {
    let url;
    try { url = new URL(reference, base); } catch (_) { return false; }
    if (!isAllowed(url) || url.hostname !== payload.host ||
        !url.pathname.startsWith(payload.rootPath) || !isPremiumSource(url, env)) return false;
  }
  return true;
}

function premiumPrefixes(env) {
  return String(env && env.PREMIUM_SOURCE_PREFIXES || "").split(",").map(value => value.trim()).filter(Boolean);
}

function isPremiumSource(url, env) {
  return premiumPrefixes(env).some(value => {
    try {
      const prefix = new URL(value);
      if (!["https:", "http:"].includes(prefix.protocol) || url.origin !== prefix.origin) return false;
      // Prefixes represent directories. Enforce a path boundary even if an
      // operator accidentally omits the trailing slash in configuration:
      // /premium/ is allowed, /premium-extra/ is not.
      const directoryPath = prefix.pathname.endsWith("/") ? prefix.pathname : prefix.pathname + "/";
      return url.pathname === prefix.pathname || url.pathname.startsWith(directoryPath);
    } catch (_) { return false; }
  });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifyPremiumTicket(ticket, env) {
  const secret = String(env && env.PREMIUM_PLAYBACK_TICKET_SECRET || "");
  if (secret.length < 32 || typeof ticket !== "string" || ticket.length > 4096) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(parts[1]), new TextEncoder().encode(parts[0]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    if (payload.v !== 1 || !payload.channelId || !payload.host || !payload.rootPath || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) { return null; }
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
    const baseUrl = new URL(base);
    const target = new URL(value, baseUrl);
    // NovaStream signs HLS entry playlists with query parameters. Some child
    // playlists/segments are relative and rely on the same signature query.
    // Preserve it only for relative NovaStream URLs that do not specify one.
    const isRelative = !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value);
    if (
      isRelative &&
      baseUrl.hostname === "edge.novastream.et" &&
      !target.search &&
      baseUrl.search
    ) {
      target.search = baseUrl.search;
    }
    return target.toString();
  } catch (_) {
    return null;
  }
}

function proxiedUrl(target, ticket) {
  return "/hls?url=" + encodeURIComponent(target) + (ticket ? "&ticket=" + encodeURIComponent(ticket) : "");
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

function rewriteUriAttributes(line, base, ticket) {
  return line.replace(/URI="([^"]+)"/g, (match, value) => {
    const absolute = absolutize(value, base);
    if (!absolute) return match;

    try {
      const url = new URL(absolute);
      return isAllowed(url)
        ? 'URI="' + proxiedUrl(url.toString(), ticket) + '"'
        : match;
    } catch (_) {
      return match;
    }
  });
}

function rewritePlaylist(body, base, ticket) {
  return body.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      return rewriteUriAttributes(line, base, ticket);
    }

    const absolute = absolutize(trimmed, base);
    if (!absolute) return line;

    try {
      const url = new URL(absolute);
      return isAllowed(url) ? proxiedUrl(url.toString(), ticket) : line;
    } catch (_) {
      return line;
    }
  }).join("\n");
}

async function fetchAllowed(target, request, ticketPayload, env) {
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
    if (ticketPayload && (next.hostname !== ticketPayload.host || !next.pathname.startsWith(ticketPayload.rootPath) || !isPremiumSource(next, env))) return { blockedRedirect: true };
    if (!ticketPayload && isPremiumSource(next, env)) return { blockedRedirect: true };

    current = next;
  }

  return { tooManyRedirects: true };
}

async function fetchFixedChannel(sources, request) {
  let lastResult = null;

  for (const source of sources) {
    let target;
    try {
      target = new URL(source);
    } catch (_) {
      continue;
    }

    if (!isAllowed(target)) continue;

    try {
      const result = await fetchAllowed(target, request, null, {});
      lastResult = result;

      // Try the next known mirror if this one rejects the request or is unavailable.
      if (result.response && result.response.ok) {
        return { ...result, finalUrl: result.finalUrl || target.toString() };
      }
      if (result.blockedRedirect || result.tooManyRedirects) continue;
    } catch (_) {
      // A failed mirror should not prevent trying the remaining allowlisted mirrors.
    }
  }

  return lastResult || { response: new Response("All Sony Movies mirrors failed", { status: 502 }), finalUrl: sources[0] };
}

async function handle(request, env) {
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

  const ebsSource = EBS_CHANNELS.get(incoming.pathname);
  const fixedSource = FIXED_CHANNELS.get(incoming.pathname);
  const sourceList = Array.isArray(ebsSource) ? ebsSource :
    (Array.isArray(fixedSource) ? fixedSource : null);
  if (incoming.pathname !== "/hls" && !ebsSource && !fixedSource) {
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

  const raw = sourceList ? null : (ebsSource || fixedSource || incoming.searchParams.get("url"));
  if (!raw && !sourceList) {
    return new Response("Missing url", { status: 400, headers: corsHeaders() });
  }
  if (raw && raw.length > MAX_URL_LENGTH) {
    return new Response("URL too long", { status: 414, headers: corsHeaders() });
  }

  let target;
  if (!sourceList) {
    try {
      target = new URL(raw);
    } catch (_) {
      return new Response("Invalid url", { status: 400, headers: corsHeaders() });
    }
  }

  if (!sourceList && !isAllowed(target)) {
    return new Response("Host or port not allowed", { status: 403, headers: corsHeaders() });
  }

  const ticket = incoming.searchParams.get("ticket") || "";
  let ticketPayload = null;
  if (!sourceList && (ticket || isPremiumSource(target, env))) {
    if (!ticket) return new Response("Premium playback ticket required", { status: 401, headers: corsHeaders() });
    ticketPayload = await verifyPremiumTicket(ticket, env);
    if (!ticketPayload || ticketPayload.host !== target.hostname || !target.pathname.startsWith(ticketPayload.rootPath) || !isPremiumSource(target, env)) {
      return new Response("Invalid Premium playback ticket", { status: 401, headers: corsHeaders() });
    }
  }

  let result;
  try {
    result = sourceList
      ? await fetchFixedChannel(sourceList, request)
      : await fetchAllowed(target, request, ticketPayload, env);
  } catch (_) {
    return new Response("Upstream connection failed", {
      status: 502,
      headers: corsHeaders()
    });
  }
  if (sourceList) {
    try { target = new URL(result.finalUrl || sourceList[0]); } catch (_) { target = new URL(sourceList[0]); }
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

    if (ticketPayload && !premiumPlaylistReferencesAllowed(body, finalUrl, ticketPayload, env)) {
      return new Response("Playlist contains a URL outside the authorized Premium source", {
        status: 502,
        headers: corsHeaders()
      });
    }
    const rewritten = rewritePlaylist(body, finalUrl, ticketPayload ? ticket : "");

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

export default { fetch: (request, env) => handle(request, env) };
