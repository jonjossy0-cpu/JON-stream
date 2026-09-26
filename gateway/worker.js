const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "23.237.104.106",
  "45.166.93.156",
  "stitcher-ipv4.pluto.tv",
  "amg00627-amg00627c29-rakuten-it-3989.playouts.now.amagi.tv",
  "appletree-mytimeuk-rakuten.amagi.tv"
]);

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

async function handle(request) {
  const incoming = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
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

  const raw = incoming.searchParams.get("url");
  if (!raw) {
    return new Response("Missing url", { status: 400, headers: corsHeaders() });
  }

  let target;
  try {
    target = new URL(raw);
  } catch (_) {
    return new Response("Invalid url", { status: 400, headers: corsHeaders() });
  }

  if (!isAllowed(target)) {
    return new Response("Host not allowed", { status: 403, headers: corsHeaders() });
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method,
      headers: upstreamHeaders(request, target),
      redirect: "follow"
    });
  } catch (_) {
    return new Response("Upstream connection failed", {
      status: 502,
      headers: corsHeaders()
    });
  }

  const contentType = (upstream.headers.get("Content-Type") || "").toLowerCase();
  const finalUrl = upstream.url || target.toString();
  const isPlaylist =
    contentType.includes("mpegurl") ||
    target.pathname.toLowerCase().endsWith(".m3u8") ||
    finalUrl.toLowerCase().split("?")[0].endsWith(".m3u8");

  if (isPlaylist && upstream.ok) {
    const body = await upstream.text();
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
