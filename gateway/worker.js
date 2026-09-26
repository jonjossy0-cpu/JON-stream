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
    "User-Agent": request.headers.get("User-Agent") || "JON-Stream-Gateway",
    "Accept": request.headers.get("Accept") || "*/*"
  };

  const range = request.headers.get("Range");
  if (range) headers["Range"] = range;

  // Some public HLS servers require a normal browser-like origin/referrer.
  headers["Referer"] = target.origin + "/";
  headers["Origin"] = target.origin;

  return headers;
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

  if (!upstream.ok && request.method !== "HEAD") {
    const body = await upstream.text();
    return new Response(body || ("Upstream HTTP " + upstream.status), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "text/plain; charset=utf-8",
        ...corsHeaders()
      }
    });
  }

  const contentType = (upstream.headers.get("Content-Type") || "").toLowerCase();
  const isPlaylist =
    contentType.includes("mpegurl") ||
    target.pathname.toLowerCase().endsWith(".m3u8") ||
    (upstream.url && new URL(upstream.url).pathname.toLowerCase().endsWith(".m3u8"));

  if (isPlaylist) {
    const body = await upstream.text();

    // Use the final URL after redirects so relative HLS references resolve correctly.
    const playlistBase = upstream.url || target.toString();

    const rewritten = body.split(/\r?\n/).map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (match, value) => {
          const absolute = absolutize(value, playlistBase);
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

      const absolute = absolutize(trimmed, playlistBase);
      if (!absolute) return line;

      try {
        const url = new URL(absolute);
        return isAllowed(url)
          ? proxiedUrl(url.toString())
          : line;
      } catch (_) {
        return line;
      }
    }).join("\n");

    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
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
