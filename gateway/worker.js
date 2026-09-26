const ALLOWED_HOSTS = new Set([
  // Existing Gateway source
  "88.212.15.19",

  // JON Stream Gateway candidates
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
    return value;
  }
}

function proxiedUrl(target) {
  return new URL("/hls?url=" + encodeURIComponent(target), "https://" + self.location.hostname).toString();
}

async function handle(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const incoming = new URL(request.url);
  if (incoming.pathname !== "/hls") {
    return new Response("JON Stream HLS Gateway", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders() }
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

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers: {
      "User-Agent": request.headers.get("User-Agent") || "JON-Stream-Gateway",
      "Accept": request.headers.get("Accept") || "*/*",
      "Range": request.headers.get("Range") || ""
    },
    redirect: "follow"
  });

  const contentType = (upstream.headers.get("Content-Type") || "").toLowerCase();

  // Rewrite HLS playlists so every segment/sub-playlist also stays inside
  // the HTTPS gateway. This is necessary for live HLS, not just the .m3u8 file.
  if (contentType.includes("mpegurl") || target.pathname.toLowerCase().endsWith(".m3u8")) {
    const body = await upstream.text();
    const rewritten = body.split(/\r?\n/).map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const absolute = absolutize(trimmed, target);
      return isAllowed(new URL(absolute)) ? proxiedUrl(absolute) : line;
    }).join("\n");

    return new Response(rewritten, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        ...corsHeaders()
      }
    });
  }

  const headers = new Headers(upstream.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}

export default {
  fetch: handle
};
